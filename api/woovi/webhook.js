import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const body = req.body;
  
  // Woovi Sandbox envia o evento dentro de body.event
  const event = body.event;
  const charge = body.charge;

  console.log(`Recebido evento Woovi: ${event} para correlationID: ${charge?.correlationID}`);

  if (event === 'OPENPIX:CHARGE_COMPLETED' || event === 'OPENPIX:TRANSACTION_RECEIVED') {
    const correlationID = charge.correlationID;
    
    // Lógica para marcar como pago no Supabase
    // O correlationID que enviamos na criação da cobrança deve ser o ID da locação
    
    try {
      // 1. Atualizar o status da locação para Ativa (ID 1)
      const { error: updateError } = await supabase
        .from('t_locacao')
        .update({ 
          id_status: 1 // 1 = ATIVA
        })
        .eq('id_locacao', correlationID);

      if (updateError) {
        throw updateError;
      }

      console.log(`Locação ${correlationID} marcada como PAGA com sucesso.`);
    } catch (err) {
      console.error('Erro ao atualizar Supabase via Webhook:', err);
      return res.status(500).json({ error: 'Erro ao processar confirmação de pagamento' });
    }
  }

  // Sempre retornar 200 para a Woovi não ficar reenviando o webhook
  return res.status(200).json({ message: 'Webhook recebido' });
}
