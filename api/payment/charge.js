export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { correlationID, value, comment, customer } = req.body;
  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  if (!accessToken) {
    return res.status(500).json({ error: 'MERCADO_PAGO_ACCESS_TOKEN not configured' });
  }

  try {
    const valueBRL = Number(value) / 100;
    
    // Split name into first and last name for Mercado Pago payer field
    const nameParts = (customer?.name || 'Cliente Camubox').trim().split(' ');
    const firstName = nameParts[0] || 'Cliente';
    const lastName = nameParts.slice(1).join(' ') || 'Camubox';

    const host = req.headers.host || 'camubox.com';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;

    const hasPublicWebhook = process.env.MERCADO_PAGO_WEBHOOK_URL || (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1'));

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': correlationID
      },
      body: JSON.stringify({
        transaction_amount: valueBRL,
        description: comment || 'Pagamento Camubox',
        payment_method_id: 'pix',
        payer: {
          email: customer?.email || 'sem-email@camubox.com',
          first_name: firstName,
          last_name: lastName
        },
        external_reference: correlationID,
        ...(hasPublicWebhook ? { notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL || `${baseUrl}/api/payment/webhook` } : {})
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Mercado Pago API returned error:', data);
      
      const errorMsg = JSON.stringify(data).toLowerCase();
      if (response.status === 400 && (errorMsg.includes('idempotency') || errorMsg.includes('exists') || errorMsg.includes('duplicate'))) {
        try {
          const searchResponse = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${correlationID}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });
          
          if (searchResponse.ok) {
            const searchData = await searchResponse.json();
            const existingPayment = searchData.results?.[0];
            if (existingPayment) {
              const qrCodeBase64 = existingPayment.point_of_interaction?.transaction_data?.qr_code_base64;
              const qrCode = existingPayment.point_of_interaction?.transaction_data?.qr_code;
              
              return res.status(200).json({
                charge: {
                  id: existingPayment.id,
                  status: existingPayment.status,
                  qrCodeImage: qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : null,
                  brCode: qrCode,
                  correlationID: existingPayment.external_reference
                }
              });
            }
          }
        } catch (searchErr) {
          console.error('Error fetching existing Mercado Pago payment:', searchErr);
        }
      }

      return res.status(response.status).json(data);
    }

    const qrCodeBase64 = data.point_of_interaction?.transaction_data?.qr_code_base64;
    const qrCode = data.point_of_interaction?.transaction_data?.qr_code;

    return res.status(200).json({
      charge: {
        id: data.id,
        status: data.status,
        qrCodeImage: qrCodeBase64 ? `data:image/png;base64,${qrCodeBase64}` : null,
        brCode: qrCode,
        correlationID: data.external_reference
      }
    });
  } catch (error) {
    console.error('Error creating Mercado Pago charge:', error);
    return res.status(500).json({ error: 'Failed to create Pix charge via Mercado Pago' });
  }
}
