import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function getAccessToken() {
  const envVar = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!envVar) throw new Error('Missing FIREBASE_SERVICE_ACCOUNT');

  let serviceAccount = JSON.parse(envVar);
  if (typeof serviceAccount === 'string') serviceAccount = JSON.parse(serviceAccount);
  
  const privateKey = (serviceAccount.private_key || serviceAccount.privateKey).replace(/\\n/g, '\n');
  const clientEmail = serviceAccount.client_email || serviceAccount.clientEmail;

  const jwtClient = new JWT({
    email: clientEmail,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging']
  });

  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

export default async function handler(req, res) {
  // Only allow POST with proper auth
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { record } = req.body; // Supabase Webhook sends the new row in 'record'
    if (!record || !record.id_usuario) {
      return res.status(400).json({ error: 'Invalid record data' });
    }

    // 1. Get user email
    const { data: user, error: userError } = await supabase
      .from('t_usuario')
      .select('dc_email')
      .eq('id_usuario', record.id_usuario)
      .single();

    if (userError || !user?.dc_email) {
      return res.status(404).json({ error: 'User email not found' });
    }

    // 2. Get FCM tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('t_fcm_tokens')
      .select('token')
      .eq('dc_email', user.dc_email);

    if (tokenError || !tokens || tokens.length === 0) {
      return res.status(200).json({ message: 'No FCM tokens for this user' });
    }

    // 3. Prepare FCM
    const accessToken = await getAccessToken();
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const projectId = (typeof serviceAccount === 'string' ? JSON.parse(serviceAccount) : serviceAccount).project_id;

    // 4. Send to all registered devices
    const results = [];
    for (const t of tokens) {
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
                data: {
                  title: record.dc_titulo || 'CAMUBOX 📦',
                  body: record.dc_mensagem,
                  icon: 'https://camubox.com/pwa-icon.png',
                  badge: 'https://camubox.com/badge-72.png',
                  url: record.tp_entidade === 'armario' 
                    ? `https://camubox.com/dashboard/locker?openLockerId=${record.id_entidade}`
                    : 'https://camubox.com/dashboard/locker',
                  lockerId: record.tp_entidade === 'armario' ? record.id_entidade : undefined
                },
                android: {
                  priority: 'high'
                },
                webpush: {
                  headers: {
                    Urgency: 'high'
                  },
                  fcm_options: {
                    link: record.tp_entidade === 'armario' 
                      ? `https://camubox.com/dashboard/locker?openLockerId=${record.id_entidade}`
                      : 'https://camubox.com/dashboard/locker'
                  }
                }
              }
            })
          }
        );
        const resData = await fcmResponse.json();
        results.push({ token: t.token.substring(0, 10) + '...', status: fcmResponse.status, details: resData });
      } catch (err) {
        results.push({ token: '...', error: err.message });
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (error) {
    console.error('[PUSH ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
}
