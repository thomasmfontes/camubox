import { createClient } from '@supabase/supabase-js';

// Woovi (OpenPix) API Wrapper
const createWooviPayment = async (amount, correlationID, productName, customerData) => {
    const isSandbox = process.env.WOOVI_ENV === 'sandbox';
    const baseUrl = isSandbox ? 'https://api.woovi-sandbox.com' : 'https://api.woovi.com';
    const appId = isSandbox ? process.env.WOOVI_APP_ID_SANDBOX : process.env.WOOVI_APP_ID_PROD;

    if (!appId) {
        throw new Error('Configuração do gateway de pagamento pendente (App ID não encontrado).');
    }

    const response = await fetch(`${baseUrl}/api/v1/charge`, {
        method: 'POST',
        headers: {
            'Authorization': appId,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            correlationID,
            value: amount, // cents
            comment: `CAMUBOX - ${productName}`,
            customer: {
                name: customerData?.name || 'Anônimo',
                email: customerData?.email || 'noreply@camubox.com'
            },
            expiresIn: 600 // 10 minutes
        })
    });

    if (!response.ok) {
        const errorBody = await response.text();
        let errorMessage = 'Falha ao criar cobrança no Woovi';
        try {
            const errorData = JSON.parse(errorBody);
            errorMessage = errorData.error || errorMessage;
        } catch (e) {
            console.error('Woovi returned non-JSON error:', errorBody);
        }
        throw new Error(errorMessage);
    }

    return await response.json();
};

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { targetId, targetType, amountCents, payerName, payerEmail, referenceId } = req.body;

        if (!targetId || !amountCents) {
            return res.status(400).json({ error: 'Missing required fields: targetId ou amountCents' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const internalId = crypto.randomUUID();

        // 1. Initial Record in 'pagamentos' table
        const { error: paymentError } = await supabase
            .from('pagamentos')
            .insert([{
                id: internalId,
                referencia_id: targetId,
                tipo: targetType || 'generic',
                valor_total: amountCents / 100, // assuming database stores value in Reais
                status: 'pending',
                payer_name: payerName || 'Anônimo',
                correlation_id: internalId
            }])
            .select()
            .single();

        if (paymentError) {
            console.error('Error recording payment:', paymentError);
            return res.status(500).json({ error: 'Failed to record transaction header' });
        }

        // 2. Create Woovi Charge
        const wooviResponse = await createWooviPayment(
            amountCents,
            internalId,
            referenceId || targetId,
            { name: payerName || 'Anônimo', email: payerEmail }
        );

        const charge = wooviResponse.charge;

        // 3. Update Payment with External details
        await supabase
            .from('pagamentos')
            .update({
                gateway_id: charge.identifier,
                woovi_charge_id: charge.identifier,
                woovi_txid: charge.txid,
                expires_at: charge.expiresDate
            })
            .eq('id', internalId);

        return res.status(200).json({
            success: true,
            payment: {
                id: charge.identifier,
                brCode: charge.brCode,
                qrCodeImage: charge.qrCodeImage,
                expiresAt: charge.expiresDate,
                databaseId: internalId
            }
        });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ error: error.message || 'Internal server error' });
    }
}
