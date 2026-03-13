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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Verificar a sessão do usuário (token passado via header)
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Missing auth header' });
  }

  try {
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userEmail = user.email;

    // 2. Buscar o token FCM mais recente para este e-mail
    const { data: fcmData, error: fcmError } = await supabase
      .from('t_fcm_tokens')
      .select('token')
      .eq('dc_email', userEmail)
      .single();

    if (fcmError || !fcmData) {
      return res.status(404).json({ error: 'Nenhum token FCM encontrado para este usuário. Tente fazer logout e login novamente no dispositivo.' });
    }

    // 3. Enviar a notificação de teste
    const accessToken = await getAccessToken();
    const projectId = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT).project_id;

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
            token: fcmData.token,
            notification: {
              title: 'Teste de Conexão CAMUBOX 🔔',
              body: 'Sua notificação foi configurada com sucesso neste dispositivo! Você receberá alertas de vencimento aqui.'
            },
            webpush: {
              fcm_options: {
                link: 'https://camubox.com/dashboard/lockers'
              }
            }
          }
        })
      }
    );

    const resultData = await fcmResponse.json();

    if (!fcmResponse.ok) {
      return res.status(500).json({ error: 'Falha ao enviar via Firebase', details: resultData });
    }

    return res.status(200).json({ message: 'Notificação enviada com sucesso!' });
  } catch (error) {
    console.error('Test push error:', error);
    return res.status(500).json({ error: error.message });
  }
}
