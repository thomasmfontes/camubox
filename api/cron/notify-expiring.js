import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAccessToken() {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  
  const jwtClient = new JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key,
    ['https://www.googleapis.com/auth/firebase.messaging']
  );

  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

export default async function handler(req, res) {
  // Verificação de segredo para evitar disparos externos maliciosos
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const today = new Date();
    // Normalizar para YYYY-MM-DD
    const in7Days = new Date(new Date().setDate(today.getDate() + 7)).toISOString().split('T')[0];
    const in1Day = new Date(new Date().setDate(today.getDate() + 1)).toISOString().split('T')[0];

    console.log(`Checking rentals expiring on ${in7Days} and ${in1Day}`);

    // 1. Buscar contratos vencendo em 7 ou 1 dia
    // Filtramos apenas os que estão 'ATIVA' (id_status = 1)
    const { data: rentals, error: rentalError } = await supabase
      .from('t_locacao')
      .select('id_usuario, nr_armario, dt_termino')
      .in('dt_termino', [in7Days, in1Day])
      .eq('id_status', 1);

    if (rentalError) throw rentalError;

    if (!rentals || rentals.length === 0) {
      return res.status(200).json({ message: 'No expiring rentals found today.' });
    }

    // 2. Coletar tokens FCM dos usuários afetados
    const userIds = [...new Set(rentals.map(r => r.id_usuario))];
    const { data: tokens, error: tokenError } = await supabase
      .from('t_fcm_tokens')
      .select('user_id, token')
      .in('user_id', userIds);

    if (tokenError) throw tokenError;

    if (!tokens || tokens.length === 0) {
      return res.status(200).json({ message: 'Found expiring rentals but no FCM tokens registered.' });
    }

    // 3. Obter Access Token do Firebase
    const accessToken = await getAccessToken();
    const projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).project_id;

    // 4. Enviar notificações
    const results = [];
    for (const rental of rentals) {
      const userTokens = tokens.filter(t => t.user_id === rental.id_usuario);
      const daysLeft = rental.dt_termino === in7Days ? 7 : 1;
      
      for (const t of userTokens) {
        try {
          const fcmResponse = await fetch(
            `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
            {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                message: {
                  token: t.token,
                  notification: {
                    title: 'Vencimento de Armário 📦',
                    body: `Sua locação do armário #${rental.nr_armario || rental.cd_armario} vence em ${daysLeft} dia(s). Renove agora!`
                  },
                  webpush: {
                    fcm_options: {
                      link: 'https://camubox.com/dashboard/my-locker'
                    }
                  }
                }
              })
            }
          );

          const resultData = await fcmResponse.json();
          results.push({ 
            user: rental.id_usuario, 
            status: fcmResponse.ok ? 'success' : 'failed',
            details: resultData 
          });
        } catch (err) {
          results.push({ user: rental.id_usuario, status: 'error', error: err.message });
        }
      }
    }

    return res.status(200).json({ 
      summary: `Processed ${rentals.length} rentals, sent to ${results.filter(r => r.status === 'success').length} devices.`,
      results 
    });
  } catch (error) {
    console.error('Cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}
