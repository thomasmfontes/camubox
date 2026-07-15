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
    const host = req.headers.host || 'camubox.com';
    const protocol = host.includes('localhost') || host.includes('127.0.0.1') ? 'http' : 'https';
    const baseUrl = `${protocol}://${host}`;
    const hasPublicWebhook = process.env.MERCADO_PAGO_WEBHOOK_URL || (!baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1'));

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        items: [
          {
            id: correlationID,
            title: comment || 'Pagamento Camubox',
            quantity: 1,
            unit_price: valueBRL,
            currency_id: 'BRL'
          }
        ],
        payer: {
          name: customer?.name || 'Cliente Camubox',
          email: customer?.email || 'sem-email@camubox.com'
        },
        external_reference: correlationID,
        back_urls: {
          success: `${baseUrl}/dashboard/checkout/payment?payment_status=success&correlationID=${correlationID}`,
          pending: `${baseUrl}/dashboard/checkout/payment?payment_status=pending&correlationID=${correlationID}`,
          failure: `${baseUrl}/dashboard/checkout/payment?payment_status=failure&correlationID=${correlationID}`
        },
        ...(baseUrl.startsWith('https') ? { auto_return: 'approved' } : {}),
        ...(hasPublicWebhook ? { notification_url: process.env.MERCADO_PAGO_WEBHOOK_URL || `${baseUrl}/api/payment/webhook` } : {})
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Mercado Pago Preference API returned error:', data);
      return res.status(response.status).json(data);
    }

    return res.status(200).json({
      id: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point
    });
  } catch (error) {
    console.error('Error creating Mercado Pago payment preference:', error);
    return res.status(500).json({ error: 'Failed to create payment preference via Mercado Pago' });
  }
}
