import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const config = {
    api: {
        bodyParser: false,
    },
};

async function getRawBody(req) {
    const chunks = [];
    for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

// Validate Woovi Signature (Supports SHA256 and SHA1)
const validateSignature = (payload, signature, secretsString) => {
    if (!secretsString) return true;

    // Support multiple secrets separated by comma
    const secrets = secretsString.split(',').map(s => s.trim());

    for (const secret of secrets) {
        const expected256Hex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
        const expected256Base64 = crypto.createHmac('sha256', secret).update(payload).digest('base64');
        const expected1Hex = crypto.createHmac('sha1', secret).update(payload).digest('hex');
        const expected1Base64 = crypto.createHmac('sha1', secret).update(payload).digest('base64');

        const isValid = [
            expected256Hex, expected256Base64,
            expected1Hex, expected1Base64
        ].includes(signature);

        if (isValid) return true;
    }

    return false;
};

export default async function handler(req, res) {
    // 0. READ RAW BODY FIRST
    const rawBody = await getRawBody(req);
    let body = {};
    try {
        body = JSON.parse(rawBody);
    } catch (e) {
        console.error('Failed to parse JSON body:', e);
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const signature = req.headers['x-openpix-signature'] || req.headers['x-webhook-signature'];
        const secret = process.env.WOOVI_WEBHOOK_SECRET;

        const event = body.event || body.evento;
        const charge = body.charge || body.cobranca;

        // 1. Handle Woovi connectivity test (Prioritize test detection)
        if (event === 'teste_webhook' || body.evento === 'teste_webhook' || body.event === 'teste_webhook') {
            return res.status(200).json({ received: true, message: 'Test success' });
        }

        // 2. Security Check (Production Strictness)
        if (secret && !validateSignature(rawBody, signature, secret)) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        if (!event || !charge) {
            return res.status(200).json({ received: true, ignored: true, reason: 'Missing payload' });
        }

        const correlationID = charge.correlationID || body.correlationID;

        if (!correlationID) {
            return res.status(200).json({ received: true, ignored: true, reason: 'No correlationID' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: transaction, error: fetchError } = await supabase
            .from('pagamentos')
            .select('id, status, referencia_id, tipo, valor_total')
            .eq('id', correlationID)
            .single();

        if (fetchError || !transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        // 3. Handle Charge Completion
        if (event === 'OPENPIX:CHARGE_COMPLETED' || event === 'CHARGE_COMPLETED') {
            const { data: updated, error: updateError } = await supabase
                .from('pagamentos')
                .update({
                    status: 'paid',
                    paid_at: new Date().toISOString(),
                    woovi_status: 'COMPLETED',
                    provider_payload: body // Audit trail
                })
                .eq('id', transaction.id)
                .neq('status', 'paid')
                .select();

            if (updateError || !updated || updated.length === 0) {
                return res.status(200).json({ message: 'Already processed or no change required' });
            }

            // --- AQUI ENTRA A LÓGICA DE NEGÓCIO DO CAMUBOX ---
            // Exemplo: se `transaction.tipo === 'armario'`, buscar o armário correspondente e marcá-lo como "Em uso".
            console.log("PIX PAGO COM SUCESSO! Referencia:", transaction.referencia_id);

            return res.status(200).json({ success: true, status: 'paid' });
        }

        // 4. Handle Charge Expiration
        if (event === 'OPENPIX:CHARGE_EXPIRED' || event === 'CHARGE_EXPIRED') {
            const { error: expireError } = await supabase
                .from('pagamentos')
                .update({
                    status: 'expired',
                    woovi_status: 'EXPIRED',
                    provider_payload: body
                })
                .eq('id', transaction.id)
                .neq('status', 'paid');

            if (expireError) {
                return res.status(500).json({ error: 'Failed to update status' });
            }

            return res.status(200).json({ success: true, status: 'expired' });
        }

        return res.status(200).json({ received: true, ignored: true, event });

    } catch (error) {
        console.error('Webhook Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
