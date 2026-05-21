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
        } else if (correlationID.startsWith('REN_')) {
          const parts = correlationID.split('_');
          const rentalId = parts[1];

          // 1. Buscar a nova locação de renovação
          const { data: newRental } = await supabase
            .from('t_locacao')
            .select('*')
            .eq('id_locacao', rentalId)
            .maybeSingle();

          if (newRental) {
            // 2. Ativar a nova locação
            const { error: updateErr } = await supabase
              .from('t_locacao')
              .update({ id_status: 1 })
              .eq('id_locacao', rentalId);
            
            if (updateErr) throw updateErr;

            // 3. Encerrar (status 4) contratos antigos remanescentes deste usuário e armário
            const { data: oldRentals } = await supabase
              .from('t_locacao')
              .select('id_locacao')
              .eq('id_usuario', newRental.id_usuario)
              .eq('id_armario', newRental.id_armario)
              .eq('id_status', 1)
              .neq('id_locacao', rentalId);

            if (oldRentals && oldRentals.length > 0) {
              const oldIds = oldRentals.map(o => o.id_locacao);
              await supabase
                .from('t_locacao')
                .update({ id_status: 4 })
                .in('id_locacao', oldIds);
              console.log(`✅ Antigos contratos de carência encerrados: [${oldIds.join(', ')}]`);
            }

            // 4. Inserir notificação de sucesso
            const { data: lockerInfo } = await supabase
              .from('t_armario')
              .select('cd_armario')
              .eq('id_armario', newRental.id_armario)
              .maybeSingle();

            const lockerDisplay = (lockerInfo?.cd_armario || newRental.id_armario).toString().padStart(3, '0');

            await supabase.from('t_notificacao').insert([{
              id_usuario: newRental.id_usuario,
              dc_titulo: 'Renovação Confirmada! 🔄',
              dc_mensagem: `Sua renovação do armário #${lockerDisplay} foi processada com sucesso.`,
              tp_entidade: 'armario',
              id_entidade: newRental.id_armario
            }]);

            console.log(`✅ Renovação Confirmada: ${correlationID}`);
          }
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

        // --- GRAVAR NO EXTRATO AUTÔNOMO (t_transacao) ---
        try {
          const charge = body.charge || body.cobranca;
          const comment = charge?.comment || charge?.comentario || '';
          const valueCents = charge?.value || charge?.valor || 0;
          const val = valueCents / 100;
          const paymentDate = charge?.paymentDate || charge?.dt_pagamento || new Date().toISOString();
          const chargeId = charge?.id || charge?.transactionId || charge?.id_woovi_charge || null;

          let parsedLockerNumber = null;
          let parsedType = null;
          let parsedStudentName = null;

          if (comment.startsWith('CAMUBOX:')) {
            if (comment.includes('Upgrade')) {
              parsedType = 'Upgrade de Plano';
            } else if (comment.includes('Troca')) {
              parsedType = 'Troca de Armário';
            } else if (comment.includes('Renovação')) {
              parsedType = 'Renovação de Contrato';
            } else if (comment.includes('Locação')) {
              parsedType = 'Locação';
            }

            const lockerMatch = comment.match(/Armário\s+([A-Za-z0-9-_]+)/i);
            if (lockerMatch) parsedLockerNumber = lockerMatch[1];

            const nameMatch = comment.match(/\(([^)]+)\)$/);
            if (nameMatch) parsedStudentName = nameMatch[1];
          }

          let transactionType = parsedType;
          let planType = null;
          let targetRentalId = null;

          if (correlationID.startsWith('EXC_')) {
            const parts = correlationID.split('_');
            targetRentalId = parseInt(parts[1], 10);
            if (!transactionType) transactionType = 'Troca de Armário';
            planType = 'N/A';
          } else if (correlationID.startsWith('UPG_')) {
            const parts = correlationID.split('_');
            targetRentalId = parseInt(parts[1], 10);
            if (!transactionType) transactionType = 'Upgrade de Plano';
            planType = 'ANUAL';
          } else if (correlationID.startsWith('REN_')) {
            const parts = correlationID.split('_');
            targetRentalId = parseInt(parts[1], 10);
            if (!transactionType) transactionType = 'Renovação de Contrato';
          } else if (!isNaN(Number(correlationID))) {
            targetRentalId = parseInt(correlationID, 10);
            if (!transactionType) transactionType = 'Locação';
          }

          // Fetch enriched details from Database using targetRentalId
          let userDetails = null;
          let lockerDetails = null;
          let rentalDetails = null;

          if (targetRentalId) {
            const { data: rental, error: rentalErr } = await supabase
              .from('t_locacao')
              .select('*')
              .eq('id_locacao', targetRentalId)
              .maybeSingle();

            if (rentalErr) {
              console.error('⚠️ Erro ao buscar t_locacao:', rentalErr.message);
            }

            if (rental) {
              rentalDetails = rental;
              
              // Query t_usuario separately to bypass PostgREST cache issues
              if (rental.id_usuario) {
                const { data: user, error: userErr } = await supabase
                  .from('t_usuario')
                  .select('*')
                  .eq('id_usuario', rental.id_usuario)
                  .maybeSingle();
                
                if (userErr) {
                  console.error('⚠️ Erro ao buscar t_usuario:', userErr.message);
                } else if (user) {
                  userDetails = user;
                }
              }

              // Query locker details from v_armario view to get pre-resolved location and size
              if (rental.id_armario) {
                const { data: locker, error: lockerErr } = await supabase
                  .from('v_armario')
                  .select('*')
                  .eq('id_armario', rental.id_armario)
                  .maybeSingle();
                
                if (lockerErr) {
                  console.error('⚠️ Erro ao buscar v_armario:', lockerErr.message);
                } else if (locker) {
                  lockerDetails = locker;
                }
              }
            }
          }

          // Plan Type Resolution
          if (!planType) {
            if (rentalDetails) {
              planType = Number(rentalDetails.id_tipo) === 1 ? 'SEMESTRAL' : 'ANUAL';
            } else {
              planType = val >= 100 ? 'ANUAL' : 'SEMESTRAL';
            }
          }

          // Fallbacks for details
          const finalStudentName = charge?.customer?.name || parsedStudentName || userDetails?.nm_usuario || 'Usuário Desconhecido';
          const finalEmail = charge?.customer?.email || userDetails?.dc_email || 'sem-email@camubox.com';
          const finalPhone = charge?.customer?.phone || userDetails?.nr_celular || 'Sem telefone';
          
          let finalLockerNumber = parsedLockerNumber || lockerDetails?.cd_armario || null;
          if (finalLockerNumber) {
            finalLockerNumber = finalLockerNumber.toString().padStart(3, '0');
          }
          const finalLockerSize = lockerDetails?.nm_tamanho || (val >= 100 ? 'Grande' : 'Pequeno');
          
          let finalLockerFloor = 'Térreo';
          if (lockerDetails?.nm_local) {
            finalLockerFloor = lockerDetails.nm_local;
          } else if (lockerDetails?.id_local) {
            const { data: localData } = await supabase
              .from('t_local')
              .select('nm_local')
              .eq('id_local', lockerDetails.id_local)
              .maybeSingle();
            finalLockerFloor = localData?.nm_local || 'Térreo';
          }

          const insertData = {
            id_locacao: targetRentalId || null,
            id_woovi_charge: chargeId || `ch_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
            vl_transacao: val,
            dc_status: 'CONCLUIDO',
            dt_pagamento: paymentDate,
            payload_webhook: body,
            dc_correlation_id: correlationID,
            dc_comentario: comment,
            nm_usuario: finalStudentName,
            dc_email: finalEmail,
            nr_celular: finalPhone,
            cd_armario: finalLockerNumber,
            nm_tamanho: finalLockerSize,
            nm_local: finalLockerFloor,
            tp_operacao: transactionType,
            tp_plano: planType
          };

          const { error: insertErr } = await supabase
            .from('t_transacao')
            .insert([insertData]);

          if (insertErr) {
            console.error('⚠️ Erro ao registrar transação no extrato:', insertErr.message);
          } else {
            console.log(`📊 Extrato atualizado: ${transactionType} de ${finalStudentName} gravada com sucesso!`);
          }
        } catch (ledgerErr) {
          console.error('⚠️ Falha crítica no processamento do Ledger:', ledgerErr.message);
        }
      }
    } catch (err) {
      console.error('❌ Erro no processamento:', err.message);
    }
  }

  return res.status(200).json({ received: true });
}