import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  // 1. CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'GET') {
     return res.status(200).send('Webhook Mercado Pago Camubox está Ativo!');
  }

  const accessToken = process.env.MERCADO_PAGO_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('❌ Webhook error: MERCADO_PAGO_ACCESS_TOKEN not configured');
    return res.status(500).json({ error: 'MERCADO_PAGO_ACCESS_TOKEN not configured' });
  }

  const body = req.body || {};
  
  // Test webhook validation
  if (req.method === 'POST' && (body.type === 'test' || body.action === 'test')) {
     console.log('✅ Mercado Pago connectivity test success');
     return res.status(200).json({ received: true });
  }

  const paymentId = body.data?.id || req.query?.id || body.id;
  const type = body.type || req.query?.topic || body.action;

  console.log(`>>> WEBHOOK MERCADO PAGO: ID=${paymentId} | Type=${type}`);

  if (!paymentId || (type && type !== 'payment' && type !== 'payment.created' && type !== 'payment.updated')) {
     return res.status(200).json({ received: true, ignored: true });
  }

  try {
    const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      console.error(`❌ Error fetching payment details from Mercado Pago (ID: ${paymentId}):`, errorText);
      return res.status(500).json({ error: 'Failed to verify payment with Mercado Pago' });
    }

    const paymentData = await mpResponse.json();
    const status = paymentData.status;

    console.log(`>>> Mercado Pago Payment status: ${status} for ID: ${paymentId}`);

    if (status !== 'approved') {
      console.log(`⚠️ Payment ID ${paymentId} is not approved yet (Status: ${status}). Ignoring DB update.`);
      return res.status(200).json({ received: true, status });
    }

    const correlationID = paymentData.external_reference;
    if (!correlationID) {
      console.error(`❌ Webhook error: No external_reference (correlationID) found in payment ${paymentId}`);
      return res.status(200).json({ received: true, error: 'No external_reference' });
    }

    if (process.env.SUPABASE_URL) {
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const chargeId = String(paymentData.id);
      
      let query = supabase
        .from('t_transacao')
        .select('id_transacao')
        .eq('dc_status', 'CONCLUIDO');
        
      query = query.or(`id_woovi_charge.eq.${chargeId},dc_correlation_id.eq.${correlationID}`);
      
      const { data: existingTx, error: checkErr } = await query.maybeSingle();
      
      if (checkErr) {
        console.error('⚠️ Error checking existing transaction:', checkErr.message);
      }
      
      if (existingTx) {
        console.log(`⚠️ Webhook already processed for correlationID=${correlationID} / chargeId=${chargeId}. Ignoring duplicate.`);
        return res.status(200).json({ received: true, duplicate: true });
      }

      if (correlationID.startsWith('EXC_')) {
        const parts = correlationID.split('_');
        const rentalId = parts[1];
        const oldLockerId = parts[2];
        const newLockerId = parts[3];

        const { data: oldRental } = await supabase.from('t_locacao').select('*').eq('id_locacao', rentalId).single();
        if (oldRental) {
          const { id_locacao: _, ...historyRecord } = oldRental;
          historyRecord.id_status = 2; // ENCERRADA
          historyRecord.dt_termino = new Date().toISOString().split('T')[0];
          await supabase.from('t_locacao').insert([historyRecord]);
        }

        await supabase.from('t_locacao').update({ id_armario: newLockerId }).eq('id_locacao', rentalId);
        await supabase.from('t_armario').update({ id_status: 2 }).eq('id_armario', oldLockerId);
        await supabase.from('t_armario').update({ id_status: 1 }).eq('id_armario', newLockerId);

        const { data: lockerInfo } = await supabase.from('t_armario').select('cd_armario').eq('id_armario', newLockerId).maybeSingle();
        const lockerDisplay = (lockerInfo?.cd_armario || newLockerId).toString().padStart(3, '0');

        await supabase.from('t_notificacao').insert([{
          id_usuario: oldRental.id_usuario,
          dc_titulo: 'Troca de Armário Confirmada! 🔄',
          dc_mensagem: `Sua troca para o armário #${lockerDisplay} foi processada com sucesso.`,
          tp_entidade: 'armario',
          id_entidade: newLockerId
        }]);

        console.log(`✅ Exchange confirmed: ${correlationID}`);
      } else if (correlationID.startsWith('UPG_')) {
        const parts = correlationID.split('_');
        const rentalId = parts[1];
        const newTypeId = parts[2];

        const { data: rental } = await supabase.from('t_locacao').select('*').eq('id_locacao', rentalId).single();
        
        if (rental) {
          const startDate = new Date(rental.dt_inicio);
          const newExpiry = new Date(startDate);
          newExpiry.setFullYear(newExpiry.getFullYear() + 1);
          const newExpiryStr = newExpiry.toISOString().split('T')[0];

          await supabase.from('t_locacao').update({ 
              id_tipo: Number(newTypeId),
              dt_termino: newExpiryStr,
              id_status: 1
          }).eq('id_locacao', rentalId);

          const { data: lockerInfo } = await supabase.from('t_armario').select('cd_armario').eq('id_armario', rental.id_armario).maybeSingle();
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

        const { data: newRental } = await supabase.from('t_locacao').select('*').eq('id_locacao', rentalId).maybeSingle();

        if (newRental) {
          const { error: updateErr } = await supabase.from('t_locacao').update({ id_status: 1 }).eq('id_locacao', rentalId);
          if (updateErr) throw updateErr;

          const { data: oldRentals } = await supabase
            .from('t_locacao')
            .select('id_locacao')
            .eq('id_usuario', newRental.id_usuario)
            .eq('id_armario', newRental.id_armario)
            .eq('id_status', 1)
            .neq('id_locacao', rentalId);

          if (oldRentals && oldRentals.length > 0) {
            const oldIds = oldRentals.map(o => o.id_locacao);
            await supabase.from('t_locacao').update({ id_status: 4 }).in('id_locacao', oldIds);
            console.log(`✅ Old grace period rentals terminated: [${oldIds.join(', ')}]`);
          }

          const { data: lockerInfo } = await supabase.from('t_armario').select('cd_armario').eq('id_armario', newRental.id_armario).maybeSingle();
          const lockerDisplay = (lockerInfo?.cd_armario || newRental.id_armario).toString().padStart(3, '0');

          await supabase.from('t_notificacao').insert([{
            id_usuario: newRental.id_usuario,
            dc_titulo: 'Renovação Confirmada! 🔄',
            dc_mensagem: `Sua renovação do armário #${lockerDisplay} foi processada com sucesso.`,
            tp_entidade: 'armario',
            id_entidade: newRental.id_armario
          }]);

          console.log(`✅ Renewal confirmed: ${correlationID}`);
        }
      } else {
        const { data: rental } = await supabase.from('t_locacao').select('id_usuario, id_armario').eq('id_locacao', correlationID).single();
        
        const { error } = await supabase.from('t_locacao').update({ id_status: 1 }).eq('id_locacao', correlationID);
        if (error) throw error;

        if (rental) {
          const { data: lockerInfo } = await supabase.from('t_armario').select('cd_armario').eq('id_armario', rental.id_armario).maybeSingle();
          const lockerDisplay = (lockerInfo?.cd_armario || rental.id_armario).toString().padStart(3, '0');

          await supabase.from('t_notificacao').insert([{
            id_usuario: rental.id_usuario,
            dc_titulo: 'Pagamento Confirmado! 📦',
            dc_mensagem: `Sua locação do armário #${lockerDisplay} está ativa. Aproveite!`,
            tp_entidade: 'armario',
            id_entidade: rental.id_armario
          }]);
        }

        console.log(`✅ Rental payment confirmed: ${correlationID}`);
      }

      // --- autonomous ledger (t_transacao) ---
      try {
        const comment = paymentData.description || '';
        const val = paymentData.transaction_amount;
        const paymentDate = paymentData.date_approved || new Date().toISOString();

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
            console.error('⚠️ Error fetching t_locacao:', rentalErr.message);
          }

          if (rental) {
            rentalDetails = rental;
            
            if (rental.id_usuario) {
              const { data: user, error: userErr } = await supabase
                .from('t_usuario')
                .select('*')
                .eq('id_usuario', rental.id_usuario)
                .maybeSingle();
              
              if (userErr) {
                console.error('⚠️ Error fetching t_usuario:', userErr.message);
              } else if (user) {
                userDetails = user;
              }
            }

            if (rental.id_armario) {
              const { data: locker, error: lockerErr } = await supabase
                .from('v_armario')
                .select('*')
                .eq('id_armario', rental.id_armario)
                .maybeSingle();
              
              if (lockerErr) {
                console.error('⚠️ Error fetching v_armario:', lockerErr.message);
              } else if (locker) {
                lockerDetails = locker;
              }
            }
          }
        }

        if (!planType) {
          if (rentalDetails) {
            planType = Number(rentalDetails.id_tipo) === 1 ? 'SEMESTRAL' : 'ANUAL';
          } else {
            planType = val >= 100 ? 'ANUAL' : 'SEMESTRAL';
          }
        }

        const finalStudentName = paymentData.payer?.first_name 
          ? `${paymentData.payer.first_name} ${paymentData.payer.last_name || ''}`.trim()
          : parsedStudentName || userDetails?.nm_usuario || 'Usuário Desconhecido';
        const finalEmail = paymentData.payer?.email || userDetails?.dc_email || 'sem-email@camubox.com';
        const finalPhone = paymentData.payer?.phone?.number || userDetails?.nr_celular || 'Sem telefone';
        
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
          payload_webhook: paymentData,
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
          console.error('⚠️ Error registering transaction in ledger:', insertErr.message);
        } else {
          console.log(`📊 Ledger updated: ${transactionType} for ${finalStudentName} recorded!`);
        }
      } catch (ledgerErr) {
        console.error('⚠️ Critical failure in ledger processing:', ledgerErr.message);
      }
    }
  } catch (err) {
    console.error('❌ Webhook error:', err.message);
    return res.status(500).json({ error: err.message });
  }

  return res.status(200).json({ received: true });
}
