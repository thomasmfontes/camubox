const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { createClient } = require('@supabase/supabase-js');

const client = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys'
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, function(err, key) {
    if (err) return callback(err);
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id_token, user_info } = req.body;

  if (!id_token) {
    return res.status(400).json({ error: 'Missing id_token' });
  }

  try {
    // 1. Validar o Token com a Apple
    const decodedToken = await new Promise((resolve, reject) => {
      jwt.verify(
        id_token,
        getKey,
        {
          algorithms: ['RS256'],
          audience: process.env.VITE_APPLE_CLIENT_ID || 'com.chocolapp',
          issuer: 'https://appleid.apple.com'
        },
        (err, decoded) => {
          if (err) reject(err);
          resolve(decoded);
        }
      );
    });

    const email = decodedToken.email;
    // Opcional: Apple envia nome no user_info apenas no primeiro login
    let name = 'Usuário Apple';
    if (user_info && user_info.name) {
      name = `${user_info.name.firstName} ${user_info.name.lastName}`.trim();
    }

    // 2. Buscar o usuário no banco (t_usuario) via Service Role para bypass RLS se necessário
    const { data: user, error: userError } = await supabase
      .from('t_usuario')
      .select('*')
      .eq('dc_email', email)
      .single();

    if (userError && userError.code !== 'PGRST116') {
      throw userError;
    }

    // 3. Retornar dados para o frontend decidir o próximo passo (Passo 2 ou Login Direto)
    return res.status(200).json({
      user: {
        email,
        name: user ? user.nm_usuario : name,
        id: user ? user.id_usuario : null
      }
    });

  } catch (err) {
    console.error('[APPLE AUTH ERROR]', err);
    return res.status(401).json({ error: 'Invalid Apple token', details: err.message });
  }
}
