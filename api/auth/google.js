export default async function handler(req, res) {
    const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
    const redirectUri = process.env.NODE_ENV === 'production' 
        ? 'https://camubox.com/api/auth/google-callback'
        : 'http://localhost:5173/api/auth/google-callback'; // Locally we still need a way to hit the API, but typically Vercel dev handles this. 
                                                           // For now, let's use the production-like URL or local equivalent if using vercel dev.
    
    // In production environment (Vercel), we want the callback to hit our other serverless function
    const actualRedirectUri = process.env.VERCEL_URL 
        ? `https://camubox.com/api/auth/google-callback`
        : `http://localhost:5173/api/auth/google-callback`;

    const scope = 'openid profile email';
    const responseType = 'code'; // Authorization Code Flow, like brilha-mais
    const accessType = 'offline';
    const prompt = 'consent';

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(actualRedirectUri)}&scope=${encodeURIComponent(scope)}&response_type=${responseType}&access_type=${accessType}&prompt=${prompt}`;

    return res.redirect(authUrl);
}
