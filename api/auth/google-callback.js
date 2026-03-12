import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    const { code } = req.query;

    if (!code) {
        return res.redirect('/?error=no_code');
    }

    try {
        const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
        const clientSecret = process.env.VITE_GOOGLE_CLIENT_SECRET;
        const redirectUri = process.env.VERCEL_URL 
            ? `https://camubox.com/api/auth/google-callback`
            : `http://localhost:5173/api/auth/google-callback`;

        // 1. Exchange code for tokens
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code',
            }),
        });

        const tokens = await tokenRes.json();
        if (tokens.error) {
            console.error('[GOOGLE TOKEN ERROR]', tokens);
            throw new Error(tokens.error_description || tokens.error);
        }

        // 2. Get user info using access token
        const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
        });
        const googleUser = await userRes.json();

        // 3. Sync with Supabase t_usuario
        const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        let { data: user, error: fetchError } = await supabase
            .from('t_usuario')
            .select('*')
            .eq('dc_email', googleUser.email)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

        if (!user) {
            const { data: newUser, error: insertError } = await supabase
                .from('t_usuario')
                .insert([{
                    nm_usuario: googleUser.name || googleUser.email.split('@')[0],
                    dc_email: googleUser.email,
                }])
                .select()
                .single();
            if (insertError) throw insertError;
            user = newUser;
        }

        // 4. Redirect back to frontend with user data
        // We'll encode the user object as a base64 string to pass it safely in the URL
        const userData = {
            id_usuario: user.id_usuario,
            name: user.nm_usuario,
            email: user.dc_email,
            isAdmin: true // Logic for admin check could go here
        };
        const encodedData = Buffer.from(JSON.stringify(userData)).toString('base64');
        
        const frontendUrl = process.env.VERCEL_URL ? 'https://camubox.com' : 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/?auth_data=${encodedData}`);

    } catch (err) {
        console.error('[AUTH CALLBACK ERROR]', err);
        const frontendUrl = process.env.VERCEL_URL ? 'https://camubox.com' : 'http://localhost:5173';
        return res.redirect(`${frontendUrl}/?error=${encodeURIComponent(err.message)}`);
    }
}
