import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    // 0. Handle CORS for local development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { id_token } = req.body;

    if (!id_token) {
        return res.status(400).json({ error: 'ID token is required' });
    }

    try {
        // 1. Validate Token with Google API
        // This bypasses the need for Supabase to be a "middleman" for the validation
        const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${id_token}`);
        const tokenInfo = await googleRes.json();

        if (tokenInfo.error || !tokenInfo.email) {
            return res.status(401).json({ error: 'Invalid Google token', details: tokenInfo.error_description });
        }

        // 2. Connect to Supabase using Service Role (Bypassing Auth Provider check)
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        // 3. Find or Create User in t_usuario
        let { data: user, error: fetchError } = await supabase
            .from('t_usuario')
            .select('*')
            .eq('nm_email', tokenInfo.email)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 = not found
            throw fetchError;
        }

        // If user doesn't exist, we could create them or return error
        // Let's create a basic profile if not found to allow access
        if (!user) {
            const { data: newUser, error: insertError } = await supabase
                .from('t_usuario')
                .insert([{
                    nm_usuario: tokenInfo.name || tokenInfo.email.split('@')[0],
                    nm_email: tokenInfo.email,
                    // Add other defaults if required by your schema
                }])
                .select()
                .single();
            
            if (insertError) throw insertError;
            user = newUser;
        }

        // 4. Return user data (This will be stored in localStorage as the "session")
        return res.status(200).json({
            user: {
                id_usuario: user.id_usuario,
                name: user.nm_usuario,
                email: user.nm_email,
                isAdmin: true // Adjust logic for admin check if needed
            }
        });

    } catch (err) {
        console.error('[AUTH API ERROR]', err);
        return res.status(500).json({ error: 'Internal server error', message: err.message });
    }
}
