import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAccessToken() {
  let envVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!envVar) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT variable is empty or not set in Vercel.');
  }

  let serviceAccount;
  try {
    // Tenta o parse normal
    serviceAccount = JSON.parse(envVar);
    // Se o resultado for uma string, significa que estava double-stringified (comum no Windows/Vercel)
    if (typeof serviceAccount === 'string') {
      serviceAccount = JSON.parse(serviceAccount);
    }
  } catch (e) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not a valid JSON. Error: ' + e.message);
  }
  
  const privateKey = serviceAccount.private_key || serviceAccount.privateKey;
  const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;

  if (!privateKey || !clientEmail) {
    throw new Error(`Missing fields in Service Account JSON. Keys found: ${Object.keys(serviceAccount).join(', ')}`);
  }

  // Garantir que a chave tenha o formato correto (newlines reais em vez de \n literais)
  const formattedKey = privateKey.includes('\\n') 
    ? privateKey.replace(/\\n/g, '\n') 
    : privateKey;

  const jwtClient = new JWT({
    email: clientEmail,
    key: formattedKey,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });

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

    // 1.1 Buscar detalhes dos armários (número/código)
    const lockerIds = [...new Set(rentals.map(r => r.id_armario))];
    const { data: lockers, error: lockerError } = await supabase
      .from('t_armario')
      .select('id_armario, cd_armario')
      .in('id_armario', lockerIds);

    if (lockerError) console.error('Error fetching lockers:', lockerError);

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
      const lockerObj = lockers?.find(l => l.id_armario === rental.id_armario);
      const lockerDisplay = lockerObj?.cd_armario || rental.id_armario;

      let daysLeft = 0;
      if (rental.dt_termino === in7Days) daysLeft = 7;
      else if (rental.dt_termino === in1Day) daysLeft = 1;
      
      const notificationBody = daysLeft === 0 
        ? `Seu contrato do armário #${lockerDisplay} venceu hoje!` 
        : `Sua locação do armário #${lockerDisplay} vence em ${daysLeft} dia(s).`;

      // 4.1 Salvar no histórico (t_notificacoes) para o sininho
      // Fazemos isso independente de ter tokens, para aparecer no dashboard
      try {
        await supabase
          .from('t_notificacao')
          .insert({
            id_usuario: rental.id_usuario,
            dc_titulo: 'Vencimento de Armário 📦',
            dc_mensagem: notificationBody,
            is_lida: false
          });
      } catch (dbErr) {
        console.error('Error saving notification to history:', dbErr);
      }

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
                    body: notificationBody
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
