import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, token } = req.body;

  if (!email || !token) {
    return res.status(400).json({ error: 'Missing email or token' });
  }

  try {
    // Upsert token by email
    const { data, error } = await supabase
      .from('t_fcm_tokens')
      .upsert(
        { dc_email: email, token: token },
        { onConflict: 'dc_email' }
      )
      .select();

    if (error) throw error;

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('[API] Error upserting FCM token:', error);
    return res.status(500).json({ error: error.message });
  }
}
