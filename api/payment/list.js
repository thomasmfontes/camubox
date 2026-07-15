import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;

  try {
    if (accessToken && !accessToken.startsWith('sk_mock') && accessToken.trim() !== '') {
      console.log('Fetching live payments from Mercado Pago API...');
      const response = await fetch('https://api.mercadopago.com/v1/payments/search?status=approved&limit=100', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Mercado Pago API returned error: ${JSON.stringify(data)}`);
      }

      const charges = (data.results || []).map((payment) => {
        return {
          correlationID: payment.external_reference,
          value: payment.transaction_amount * 100, // in cents
          status: 'COMPLETED',
          customer: {
            name: `${payment.payer?.first_name || ''} ${payment.payer?.last_name || ''}`.trim() || 'Usuário Desconhecido',
            email: payment.payer?.email || 'sem-email@camubox.com',
            phone: payment.payer?.phone?.number || ''
          },
          createdAt: payment.date_created,
          paymentDate: payment.date_approved,
          comment: payment.description
        };
      });

      return res.status(200).json({ charges });
    }

    console.log('Generating dynamic sandbox mock payments...');
    
    const { data: rentals } = await supabase.from('t_locacao').select('*').in('id_status', [1, 2, 4]);
    const { data: users } = await supabase.from('t_usuario').select('id_usuario, nm_usuario, dc_email, nr_celular');
    const { data: lockers } = await supabase.from('v_armario').select('id_armario, cd_armario, nm_tamanho');

    const charges = (rentals || []).map((rental) => {
      const user = (users || []).find(u => u.id_usuario === rental.id_usuario);
      const locker = (lockers || []).find(l => l.id_armario === rental.id_armario);
      
      let val = 70;
      const isPequeno = (locker?.nm_tamanho || 'Pequeno').toLowerCase() === 'pequeno';
      const isSemestral = Number(rental.id_tipo) === 1;
      
      if (isPequeno) {
        val = isSemestral ? 70 : 100;
      } else {
        val = isSemestral ? 100 : 150;
      }

      const paidDate = new Date(rental.dt_inicio);
      paidDate.setHours(14, 30, 0);

      return {
        correlationID: String(rental.id_locacao),
        value: val * 100, // in cents
        status: 'COMPLETED',
        customer: {
          name: user?.nm_usuario || 'Usuário Desconhecido',
          email: user?.dc_email || 'sem-email@camubox.com',
          phone: user?.nr_celular || ''
        },
        createdAt: paidDate.toISOString(),
        paymentDate: paidDate.toISOString(),
        comment: `Aluguel Armário #${locker?.cd_armario || rental.id_armario}`
      };
    });

    return res.status(200).json({ charges });
  } catch (error) {
    console.error('Error fetching Mercado Pago charges:', error);
    return res.status(500).json({ error: 'Failed to fetch charges' });
  }
}
