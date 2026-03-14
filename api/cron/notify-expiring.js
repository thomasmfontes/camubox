import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAccessToken() {
  const envVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!envVar) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT variable is empty or not set in Vercel.');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(envVar);
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not a valid JSON. Check for trailing commas or encoding issues.');
  }
  
  if (!serviceAccount.private_key || !serviceAccount.client_email) {
    throw new Error(`Missing fields in Service Account JSON. Found email: ${!!serviceAccount.client_email}, Found key: ${!!serviceAccount.private_key}`);
  }

  const jwtClient = new JWT(
    serviceAccount.client_email,
    null,
    serviceAccount.private_key.replace(/\\n/g, '\n'), // Garantir que quebras de linha sejam interpretadas corretamente
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
    const today = new Date().toISOString().split('T')[0];
    // Normalizar para YYYY-MM-DD
    const in7Days = new Date(new Date().setDate(new Date().getDate() + 7)).toISOString().split('T')[0];
    const in1Day = new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0];

    console.log(`Checking rentals expiring on ${today}, ${in7Days} and ${in1Day}`);

    // 1. Buscar contratos vencendo em 7 ou 1 dia
    // Filtramos apenas os que estão 'ATIVA' (id_status = 1)
    const { data: rentals, error: rentalError } = await supabase
      .from('t_locacao')
      .select('id_usuario, id_armario, dt_termino')
      .in('dt_termino', [today, in7Days, in1Day])
      .eq('id_status', 1);

    if (rentalError) throw rentalError;

    if (!rentals || rentals.length === 0) {
      return res.status(200).json({ message: 'No expiring rentals found today.' });
    }

    // 2. Coletar e-mails dos usuários afetados
    const userIds = [...new Set(rentals.map(r => r.id_usuario))];
    const { data: users, error: userError } = await supabase
      .from('t_usuario')
      .select('id_usuario, dc_email')
      .in('id_usuario', userIds);

    if (userError) throw userError;

    const userEmails = users.map(u => u.dc_email).filter(Boolean);
    
    // 3. Buscar tokens FCM por e-mail
    const { data: tokens, error: tokenError } = await supabase
      .from('t_fcm_tokens')
      .select('dc_email, token')
      .in('dc_email', userEmails);

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
      // Encontrar o e-mail do usuário dono dessa locação
      const userObj = users.find(u => u.id_usuario === rental.id_usuario);
      if (!userObj?.dc_email) continue;

      const userTokens = tokens.filter(t => t.dc_email === userObj.dc_email);
      let daysLeft = 0;
      if (rental.dt_termino === in7Days) daysLeft = 7;
      else if (rental.dt_termino === in1Day) daysLeft = 1;
      
      const dayText = daysLeft === 0 ? "HOJE" : `em ${daysLeft} dia(s)`;
      
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
                    body: `Sua locação do armário #${rental.id_armario} vence ${dayText}. Renove agora!`
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
