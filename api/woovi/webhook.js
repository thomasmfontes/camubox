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
          const { data: lockerInfo } = await supabase
            .from('t_armario')
            .select('cd_armario')
            .eq('id_armario', newLockerId)
            .maybeSingle();
          
          const lockerDisplay = (lockerInfo?.cd_armario || newLockerId).toString().padStart(3, '0');

          await supabase.from('t_notificacao').insert([{
            id_usuario: oldRental.id_usuario,
            dc_titulo: 'Troca de Armário Confirmada! 🔄',
            dc_mensagem: `Sua troca para o armário #${lockerDisplay} foi processada com sucesso.`,
            tp_entidade: 'armario',
            id_entidade: newLockerId
          }]);

          console.log(`✅ Troca Confirmada: ${correlationID}`);
        } else if (correlationID.startsWith('UPG_')) {
          const parts = correlationID.split('_');
          const rentalId = parts[1];
          const newTypeId = parts[2]; // 2 para Anual

          // 1. Buscar contrato atual
          const { data: rental } = await supabase.from('t_locacao').select('*').eq('id_locacao', rentalId).single();
          
          if (rental) {
            // 2. Atualizar para Anual e estender data
            // Definimos o término como 1 ano após a data de INÍCIO original
            const startDate = new Date(rental.dt_inicio);
            const newExpiry = new Date(startDate);
            newExpiry.setFullYear(newExpiry.getFullYear() + 1);
            const newExpiryStr = newExpiry.toISOString().split('T')[0];

            await supabase.from('t_locacao').update({ 
                id_tipo: Number(newTypeId),
                dt_termino: newExpiryStr,
                id_status: 1 // Garante que está ativa
            }).eq('id_locacao', rentalId);

            // 3. Notificação
            const { data: lockerInfo } = await supabase
              .from('t_armario')
              .select('cd_armario')
              .eq('id_armario', rental.id_armario)
              .maybeSingle();

            const lockerDisplay = (lockerInfo?.cd_armario || rental.id_armario).toString().padStart(3, '0');

            await supabase.from('t_notificacao').insert([{
              id_usuario: rental.id_usuario,
              dc_titulo: 'Upgrade Confirmado! ⭐',
              dc_mensagem: `Seu plano do armário #${lockerDisplay} foi alterado para ANUAL com sucesso.`,
              tp_entidade: 'armario',
              id_entidade: rental.id_armario
            }]);
          }
          console.log(`✅ Upgrade Confirmado: ${correlationID}`);
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
            // Busca o armário usando o ID que está na locação
            const { data: lockerInfo } = await supabase
              .from('t_armario')
              .select('cd_armario')
              .eq('id_armario', rental.id_armario)
              .maybeSingle();

            // Prioriza cd_armario (013), depois o ID
            const lockerDisplay = (lockerInfo?.cd_armario || rental.id_armario).toString().padStart(3, '0');

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