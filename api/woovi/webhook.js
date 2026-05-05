import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. Headers de CORS para permitir que a Woovi acesse
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, x-openpix-signature, x-webhook-signature');

  // 2. Responde OK imediatamente para requisições de teste (OPTIONS)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Resposta para o navegador (GET)
  if (req.method === 'GET') {
     return res.status(200).send('Webhook Camubox está Ativo e Blindado!');
  }

  const body = req.body || {};
  const event = body.event || body.evento || '';
  const isTest = event === 'teste_webhook' || body.evento === 'teste_webhook';

  console.log(`>>> WEBHOOK [${req.method}]: Event=${event} | Test=${isTest}`);
  
  // 3. Resposta para o Teste da Woovi (Essencial para validação)
  if (req.method === 'POST' && (isTest || !event || Object.keys(body).length === 0)) {
     console.log('✅ Connectivity Test / Validation Received');
     return res.status(200).json({ received: true, message: 'Test success' });
  }

  // 4. Lógica de Confirmação de Pagamento
  if (event === 'OPENPIX:CHARGE_COMPLETED' || event === 'CHARGE_COMPLETED') {
    try {
      const charge = body.charge || body.cobranca;
      const correlationID = charge?.correlationID || body.correlationID;

      if (correlationID && process.env.SUPABASE_URL) {
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY
        );

        if (correlationID.startsWith('EXC_')) {
          const parts = correlationID.split('_');
          const rentalId = parts[1];
          const oldLockerId = parts[2];
          const newLockerId = parts[3];

          // 0. Fetch existing rental
          const { data: oldRental } = await supabase.from('t_locacao').select('*').eq('id_locacao', rentalId).single();
          if (oldRental) {
            const { id_locacao: _, ...historyRecord } = oldRental;
            historyRecord.id_status = 2; // ENCERRADA
            historyRecord.dt_termino = new Date().toISOString().split('T')[0];
            await supabase.from('t_locacao').insert([historyRecord]);
          }

          // 1. Update rental with new locker
          await supabase.from('t_locacao').update({ id_armario: newLockerId }).eq('id_locacao', rentalId);
          // 2. Free old locker (Status 2 = Vistoria)
          await supabase.from('t_armario').update({ id_status: 2 }).eq('id_armario', oldLockerId);
          // 3. Occupy new locker (Status 1 = Em Uso)
          await supabase.from('t_armario').update({ id_status: 1 }).eq('id_armario', newLockerId);

          // 4. Create notification
          const { data: lockerInfo } = await supabase.from('t_armario').select('nr_armario, cd_armario').eq('id_armario', newLockerId).single();
          const lockerDisplay = lockerInfo?.nr_armario || lockerInfo?.cd_armario || newLockerId;

          await supabase.from('t_notificacao').insert([{
            id_usuario: oldRental.id_usuario,
            dc_titulo: 'Troca de Armário Confirmada! 🔄',
            dc_mensagem: `Sua troca para o armário #${lockerDisplay} foi processada com sucesso.`,
            tp_entidade: 'armario',
            id_entidade: newLockerId
          }]);

          console.log(`✅ Troca Confirmada: ${correlationID}`);
        } else {
          // Fetch rental to get user ID
          const { data: rental } = await supabase.from('t_locacao').select('id_usuario, id_armario').eq('id_locacao', correlationID).single();
          
          const { error } = await supabase
            .from('t_locacao')
            .update({ id_status: 1 })
            .eq('id_locacao', correlationID);
          
          if (error) throw error;

          // Create notification
          if (rental) {
            const { data: lockerInfo } = await supabase.from('t_armario').select('nr_armario, cd_armario').eq('id_armario', rental.id_armario).single();
            const lockerDisplay = lockerInfo?.nr_armario || lockerInfo?.cd_armario || rental.id_armario;

            await supabase.from('t_notificacao').insert([{
              id_usuario: rental.id_usuario,
              dc_titulo: 'Pagamento Confirmado! 📦',
              dc_mensagem: `Sua locação do armário #${lockerDisplay} está ativa. Aproveite!`,
              tp_entidade: 'armario',
              id_entidade: rental.id_armario
            }]);
          }

          console.log(`✅ Pagamento Confirmado: ${correlationID}`);
        }
      }
    } catch (err) {
      console.error('❌ Erro no processamento:', err.message);
    }
  }

  return res.status(200).json({ received: true });
}