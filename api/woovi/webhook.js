import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Headers de CORS para permitir que a Woovi acesse
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-openpix-signature, x-webhook-signature');

  // 2. Responde OK imediatamente para requisições de teste (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Resposta para o navegador (GET)
  if (req.method === 'GET') {
     return res.status(200).send('Webhook Camubox está Ativo e Blindado!');
  }

  const body = req.body || {};
  const event = body.event || body.evento || '';
  const isTest = event === 'teste_webhook' || body.evento === 'teste_webhook';

  console.log(`>>> WEBHOOK [${req.method}]: Event=${event} | Test=${isTest}`);
  
  // 3. Resposta para o Teste da Woovi (Essencial para validação)
  if (req.method === 'POST' && (isTest || !event || Object.keys(body).length === 0)) {
     console.log('✅ Connectivity Test / Validation Received');
     return res.status(200).json({ received: true, message: 'Test success' });
  }

  // 4. Lógica de Confirmação de Pagamento
  if (event === 'OPENPIX:CHARGE_COMPLETED' || event === 'CHARGE_COMPLETED') {
    try {
      const charge = body.charge || body.cobranca;
      const correlationID = charge?.correlationID || body.correlationID;

      if (correlationID && process.env.SUPABASE_URL) {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        const { error } = await supabase
          .from('t_locacao')
          .update({ id_status: 1 })
          .eq('id_locacao', correlationID);
        
        if (error) throw error;
        console.log(`✅ Pagamento Confirmado: ${correlationID}`);
      }
    } catch (err) {
      console.error('❌ Erro no processamento:', err.message);
    }
  }

  return res.status(200).json({ received: true });
}