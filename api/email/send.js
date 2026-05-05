import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Authorization check (similar to send-push.js)
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { to, subject, html, text } = req.body;

  if (!to || !subject || (!html && !text)) {
    return res.status(400).json({ error: 'Missing required fields: to, subject, (html or text)' });
  }

  try {
    const data = await resend.emails.send({
      from: 'CAMUBOX <notificacoes@camubox.com>',
      to,
      subject,
      html: html || text,
      text: text || '',
    });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[RESEND ERROR]', error);
    return res.status(500).json({ error: error.message });
  }
}
