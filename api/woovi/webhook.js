import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: true, // Voltando para true para simplificar a validação inicial
  },
};

export default async function handler(req, res) {
  console.log(`>>> WEBHOOK CONTACT: ${req.method} | Body:`, JSON.stringify(req.body));
  
  // Resposta imediata de sucesso para QUALQUER coisa (GET, POST, etc)
  // Isso garante que a Woovi valide o endpoint independente do teste dela
  if (req.method === 'GET') {
     return res.status(200).send('Webhook Camubox está Ativo!');
  }

  const body = req.body || {};
  const event = body.event || body.evento;

  // 1. Resposta para o Teste da Woovi
  if (event === 'teste_webhook' || !event) {
    return res.status(200).json({ status: 'ok', message: 'Endpoint Validado' });
  }

  // 2. Lógica Real (Só processa se for confirmação de carga)
  if (event === 'OPENPIX:CHARGE_COMPLETED' || event === 'CHARGE_COMPLETED') {
    try {
      const charge = body.charge || body.cobranca;
      const correlationID = charge?.correlationID || body.correlationID;

      if (correlationID) {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        await supabase
          .from('t_locacao')
          .update({ id_status: 1 })
          .eq('id_locacao', correlationID);
        
        console.log(`✅ Pagamento Confirmado: ${correlationID}`);
      }
    } catch (err) {
      console.error('❌ Erro no processamento:', err);
    }
  }

  // Sempre retorna 200
  return res.status(200).json({ received: true });
}
