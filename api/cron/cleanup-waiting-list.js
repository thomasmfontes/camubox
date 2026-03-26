import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // Verificação de segredo para evitar disparos externos maliciosos
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Running cleanup for expired waiting list reservations...');
    
    // Call the postgres function to process expirations
    const { data, error } = await supabase.rpc('fn_limpar_reservas_expiradas');

    if (error) throw error;

    return res.status(200).json({ 
      message: 'Cleanup processed successfully', 
      result: data 
    });
  } catch (error) {
    console.error('Cleanup Cron error:', error);
    return res.status(500).json({ error: error.message });
  }
}
