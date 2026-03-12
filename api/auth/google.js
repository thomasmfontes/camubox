export default async function handler(req, res) {
    const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID;
    const callbackUrl = `https://camubox.com/api/auth/google-callback`;

    // Log de diagnóstico - vai aparecer nos logs da Vercel
    console.log('[AUTH/GOOGLE] clientId present?', !!clientId);
    console.log('[AUTH/GOOGLE] clientId value:', clientId ? clientId.substring(0, 20) + '...' : 'UNDEFINED');

    if (!clientId) {
        return res.status(500).send(`
            <h2>Erro: GOOGLE_CLIENT_ID não configurado na Vercel</h2>
            <p>Acesse: Vercel Dashboard → Settings → Environment Variables e adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET.</p>
        `);
    }

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', callbackUrl);
    authUrl.searchParams.set('scope', 'openid profile email');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');

    return res.redirect(authUrl.toString());
}
