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

/**
 * Template de e-mail responsivo e premium do CAMUBOX
 */
function getEmailTemplate(userName, title, message, url) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #002b1f; margin: 0; padding: 0; background-color: #f4f7f6; }
    .container { max-width: 600px; margin: 20px auto; background: #ffffff; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 30px rgba(0, 43, 31, 0.12); border: 1px solid #d1dad7; }
    .header { background-color: #003d2b; color: #ffffff; padding: 40px 20px; text-align: center; }
    .header img { width: 80px; height: 80px; border-radius: 18px; margin-bottom: 15px; box-shadow: 0 8px 16px rgba(0,0,0,0.2); border: 2px solid rgba(255,255,255,0.2); }
    .header h1 { margin: 0; font-size: 26px; font-weight: 850; letter-spacing: -1px; }
    .content { padding: 40px 30px; }
    .content h2 { color: #003d2b; margin-top: 0; font-size: 22px; font-weight: 800; }
    .message-box { background: #f0f7f4; border-left: 4px solid #003d2b; padding: 24px; margin: 25px 0; border-radius: 4px 16px 16px 4px; color: #002b1f; }
    .message-box strong { color: #003d2b; font-size: 18px; display: block; margin-bottom: 8px; }
    .button-container { text-align: center; margin-top: 35px; }
    .button { display: inline-block; padding: 16px 32px; background-color: #003d2b; color: #ffffff !important; text-decoration: none; border-radius: 100px; font-weight: 700; font-size: 16px; box-shadow: 0 6px 15px rgba(0, 61, 43, 0.2); transition: transform 0.2s; }
    .footer { padding: 30px; text-align: center; font-size: 13px; color: #4a635d; background: #f4f7f6; border-top: 1px solid #d1dad7; }
    .footer p { margin: 5px 0; }
    .footer .social { margin-top: 15px; color: #003d2b; font-weight: 700; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="https://camubox.com/pwa-icon.png" alt="CAMUBOX Logo">
      <h1>CAMUBOX</h1>
    </div>
    <div class="content">
      <h2>Olá, ${userName}!</h2>
      <p>Você tem uma nova atualização importante sobre seu armário no CAMUBOX:</p>
      
      <div class="message-box">
        <strong>${title}</strong>
        ${message}
      </div>
      
      <p>Para conferir mais detalhes ou realizar outras ações, acesse seu painel no aplicativo:</p>
      
      <div class="button-container">
        <a href="${url}" class="button">Abrir Aplicativo</a>
      </div>
    </div>
    <div class="footer">
      <p><strong>CAMUBOX - Gestão Inteligente de Armários</strong></p>
      <p>Este é um e-mail automático, por favor não responda.</p>
      <p style="margin-top: 20px; font-size: 11px; opacity: 0.7;">&copy; 2026 CAMUBOX. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>
`;
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
      ? `https://camubox.com/dashboard/my-locker?openLockerId=${record.id_entidade}`
      : 'https://camubox.com/dashboard/my-locker';

    // 2. Send Email via Resend
    let emailResult = null;
    if (resend) {
      try {
        emailResult = await resend.emails.send({
          from: 'CAMUBOX <naoresponda@camubox.com>',
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

