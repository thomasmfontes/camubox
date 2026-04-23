export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { correlationID, value, comment, customer } = req.body;
  const appId = process.env.WOOVI_APP_ID;

  if (!appId) {
    return res.status(500).json({ error: 'WOOVI_APP_ID not configured' });
  }

  try {
    const response = await fetch('https://api.woovi.com/api/v1/charge', {
      method: 'POST',
      headers: {
        'Authorization': appId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        correlationID,
        value,
        comment,
        customer
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
      // Caso a cobrança já exista na Woovi, tentamos buscar a cobrança existente
      // para evitar erro 400 no frontend ao dar refresh na página.
      if (response.status === 400 && (JSON.stringify(data).includes('já existe') || JSON.stringify(data).includes('CorrelationID'))) {
        try {
          const getResponse = await fetch(`https://api.woovi.com/api/v1/charge/${correlationID}`, {
            method: 'GET',
            headers: {
              'Authorization': appId,
              'Content-Type': 'application/json'
            }
          });
          
          if (getResponse.ok) {
            const existingData = await getResponse.json();
            return res.status(200).json(existingData);
          }
        } catch (getErr) {
          console.error('Error fetching existing charge:', getErr);
        }
      }
      
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('Error creating Woovi charge:', error);
    return res.status(500).json({ error: 'Failed to create Pix charge' });
  }
}
