import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Função para ler o corpo bruto da requisição (necessário para validar assinatura)
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Validação de Assinatura da Woovi
const validateSignature = (payload, signature, secret) => {
  if (!secret || !signature) return true; // Se não configurado, ignora (em sandbox)

  const expected256Hex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const expected256Base64 = crypto.createHmac('sha256', secret).update(payload).digest('base64');
  
  return [expected256Hex, expected256Base64].includes(signature);
};

export default async function handler(req, res) {
  const rawBody = await getRawBody(req);
  let body = {};
  if (rawBody) {
    try {
      body = JSON.parse(rawBody);
    } catch (e) {
      console.error('Falha ao parsear JSON:', e);
    }
  }

  // Log para depuração no painel da Vercel
  console.log('--- Woovi Webhook Contact ---');
  console.log('Event:', body.event || body.evento);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const signature = req.headers['x-openpix-signature'] || req.headers['x-webhook-signature'];
    const secret = process.env.WOOVI_WEBHOOK_SECRET;
    const event = body.event || body.evento;
    const charge = body.charge || body.cobranca;

    // 1. Resposta ao Teste de Conectividade (O que a Woovi usa para validar o endpoint)
    if (event === 'teste_webhook' || body.event === 'teste_webhook') {
      console.log('✅ Teste de conectividade recebido');
      return res.status(200).json({ received: true, message: 'Test success' });
    }

    // 2. Validação de Segurança
    if (secret && !validateSignature(rawBody, signature, secret)) {
      console.error('❌ Assinatura Inválida');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // 3. Processamento de Pagamento (Sucesso)
    if (event === 'OPENPIX:CHARGE_COMPLETED' || event === 'CHARGE_COMPLETED') {
      const correlationID = charge?.correlationID || body.correlationID;

      if (!correlationID) {
        return res.status(200).json({ message: 'Ignored: No correlationID' });
      }

      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // Atualiza o Camubox: status 1 = ATIVA
      const { error: updateError } = await supabase
        .from('t_locacao')
        .update({ 
          id_status: 1 
        })
        .eq('id_locacao', correlationID);

      if (updateError) throw updateError;

      console.log(`✅ Locação ${correlationID} confirmada via Webhook.`);
      return res.status(200).json({ success: true, status: 'paid' });
    }

    return res.status(200).json({ received: true, ignored: true });

  } catch (err) {
    console.error('❌ Erro no Webhook:', err);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}
