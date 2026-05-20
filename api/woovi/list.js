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

  const appId = process.env.WOOVI_APP_ID;

  try {
    // If we have a real Woovi App ID, securely fetch completed charges directly from Woovi API
    if (appId && !appId.startsWith('sk_mock') && appId.trim() !== '') {
      console.log('Fetching live payments from Woovi API...');
      const response = await fetch('https://api.woovi.com/api/v1/charge?status=COMPLETED&limit=100', {
        method: 'GET',
        headers: {
          'Authorization': appId,
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Woovi API returned error: ${JSON.stringify(data)}`);
      }

      return res.status(200).json({ charges: data.charges || [] });
    }

    // Fallback: Dynamic sandbox mock generation using the Supabase database
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

    // Append mock locker exchange payments
    if (rentals && rentals.length > 0) {
      const exchangeRental = rentals[0];
      const user = (users || []).find(u => u.id_usuario === exchangeRental.id_usuario);
      const paidDate = new Date(exchangeRental.dt_inicio);
      paidDate.setDate(paidDate.getDate() + 1);

      const studentName = user?.nm_usuario || 'Pedro Souza';

      charges.push({
        correlationID: `EXC_${exchangeRental.id_locacao}_9_10`,
        value: 2000, // R$ 20.00
        status: 'COMPLETED',
        customer: {
          name: studentName,
          email: user?.dc_email || 'pedro.souza@gmail.com',
          phone: user?.nr_celular || ''
        },
        createdAt: paidDate.toISOString(),
        paymentDate: paidDate.toISOString(),
        comment: `CAMUBOX: Troca Armário 013 (${studentName})`
      });
    }

    // Append mock plan upgrade payments
    if (rentals && rentals.length > 1) {
      const upgradeRental = rentals[1];
      const user = (users || []).find(u => u.id_usuario === upgradeRental.id_usuario);
      const paidDate = new Date(upgradeRental.dt_inicio);
      paidDate.setDate(paidDate.getDate() + 2);

      const studentName = user?.nm_usuario || 'Vinicius Morettes Fernandes';

      charges.push({
        correlationID: `UPG_${upgradeRental.id_locacao}_2`,
        value: 5000, // R$ 50.00
        status: 'COMPLETED',
        customer: {
          name: studentName,
          email: user?.dc_email || 'vinimore40@gmail.com',
          phone: user?.nr_celular || ''
        },
        createdAt: paidDate.toISOString(),
        paymentDate: paidDate.toISOString(),
        comment: `CAMUBOX: Upgrade Armário 484 (${studentName})`
      });
    }

    // Append mock contract renewal payments
    if (rentals && rentals.length > 0) {
      const renewalRental = rentals[0];
      const user = (users || []).find(u => u.id_usuario === renewalRental.id_usuario);
      const paidDate = new Date(renewalRental.dt_inicio);
      paidDate.setDate(paidDate.getDate() + 3);
      
      const studentName = user?.nm_usuario || 'Giovanna Santos Di Prinzio';

      charges.push({
        correlationID: `REN_${renewalRental.id_locacao}`,
        value: 10000, // R$ 100.00
        status: 'COMPLETED',
        customer: {
          name: studentName,
          email: user?.dc_email || 'giovanna.sprinzio@gmail.com',
          phone: user?.nr_celular || ''
        },
        createdAt: paidDate.toISOString(),
        paymentDate: paidDate.toISOString(),
        comment: `CAMUBOX: Renovação Armário 013 (${studentName})`
      });
    }

    // Sort charges by payment date descending
    charges.sort((a, b) => new Date(b.paymentDate) - new Date(a.paymentDate));

    return res.status(200).json({ charges });
  } catch (error) {
    console.error('Error fetching Woovi charges:', error);
    return res.status(500).json({ error: 'Failed to retrieve payments history' });
  }
}
