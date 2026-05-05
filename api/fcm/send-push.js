import { createClient } from '@supabase/supabase-js';
import { JWT } from 'google-auth-library';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

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

const getEmailTemplate = (name, title, message, url) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f4f7f9; }
    .container { max-width: 600px; margin: 20px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.1); border: 1px solid #e1e8ed; }
    .header { background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #fff; padding: 30px 20px; text-align: center; }
    .header h1 { margin: 0; font-size: 24px; letter-spacing: 1px; }
    .content { padding: 30px; }
    .content h2 { color: #0f172a; margin-top: 0; font-size: 20px; }
    .message-box { background: #f8fafc; border-left: 4px solid #3b82f6; padding: 20px; margin: 20px 0; border-radius: 0 8px 8px 0; }
    .button { display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #fff; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 20px; }
    .footer { padding: 20px; text-align: center; font-size: 12px; color: #64748b; background: #f8fafc; border-top: 1px solid #e1e8ed; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>CAMUBOX</h1>
    </div>
    <div class="content">
      <h2>Olá, ${name}!</h2>
      <p>Você tem uma nova notificação do CAMUBOX:</p>
      <div class="message-box">
        <strong>${title}</strong><br>
        ${message}
      </div>
      <p>Para mais detalhes, acesse seu painel:</p>
      <a href="${url}" class="button">Ver no App</a>
    </div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} CAMUBOX - Sistema de Gestão de Armários.
    </div>
  </div>
</body>
</html>
`;

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

    // 1. Get user details
    const { data: user, error: userError } = await supabase
      .from('t_usuario')
      .select('dc_email, nm_usuario')
      .eq('id_usuario', record.id_usuario)
      .single();

    if (userError || !user?.dc_email) {
      return res.status(404).json({ error: 'User email not found' });
    }

    const userName = user.nm_usuario?.split(' ')[0] || 'Aluno';
    const notificationTitle = record.dc_titulo || 'CAMUBOX 📦';
    const notificationUrl = record.tp_entidade === 'armario' 
      ? `https://camubox.com/dashboard/locker?openLockerId=${record.id_entidade}`
      : 'https://camubox.com/dashboard/locker';

    // 2. Send Email via Resend
    let emailResult = null;
    if (resend) {
      try {
        emailResult = await resend.emails.send({
          from: 'CAMUBOX <notificacoes@camubox.com>',
          to: user.dc_email,
          subject: notificationTitle,
          html: getEmailTemplate(userName, notificationTitle, record.dc_mensagem, notificationUrl)
        });
      } catch (err) {
        console.error('[RESEND ERROR]', err);
        emailResult = { error: err.message };
      }
    }

    // 3. Get FCM tokens
    const { data: tokens, error: tokenError } = await supabase
      .from('t_fcm_tokens')
      .select('token')
      .eq('dc_email', user.dc_email);

    if (tokenError || !tokens || tokens.length === 0) {
      return res.status(200).json({ 
        message: 'Email sent (if Resend configured), but no FCM tokens for this user',
        email: emailResult
      });
    }

    // 4. Prepare FCM
    const accessToken = await getAccessToken();
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const projectId = (typeof serviceAccount === 'string' ? JSON.parse(serviceAccount) : serviceAccount).project_id;

    // 5. Send to all registered devices
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
                  title: notificationTitle,
                  body: record.dc_mensagem,
                  icon: 'https://camubox.com/pwa-icon.png',
                  badge: 'https://camubox.com/badge-72.png',
                  url: notificationUrl,
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
                    link: notificationUrl
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

    return res.status(200).json({ success: true, results, email: emailResult });
  } catch (error) {
    console.error('[PUSH ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
}

