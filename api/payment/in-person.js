import { createClient } from '@supabase/supabase-js';

const createServerClient = () => {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) throw new Error('Supabase server configuration missing');

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
};

const authenticate = async (supabase, req, requireAdmin = false) => {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return { error: 'Authentication required', status: 401 };

  const { data: authData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authData?.user?.email) return { error: 'Invalid session', status: 401 };

  const { data: dbUser, error: userError } = await supabase
    .from('t_usuario')
    .select('id_usuario, nm_usuario, dc_email, nr_celular, is_adm')
    .ilike('dc_email', authData.user.email)
    .maybeSingle();

  if (userError) throw userError;
  if (!dbUser) return { error: 'CAMUBOX user not found', status: 403 };
  if (requireAdmin && !dbUser.is_adm) return { error: 'Administrator access required', status: 403 };

  return { user: dbUser };
};

const getConfig = async (supabase) => {
  const { data, error } = await supabase.from('t_configuracao').select('*').limit(1).maybeSingle();
  if (error) throw error;
  return data || {};
};

const resolveRequestDetails = async (supabase, correlationID, user, operationHint, previousRentalId) => {
  let rentalId;
  let lockerId;
  let operation;
  let plan;
  let value;

  const config = await getConfig(supabase);

  if (/^EXC_\d+_\d+_\d+$/.test(correlationID)) {
    const [, rawRentalId, rawOldLockerId, rawNewLockerId] = correlationID.split('_');
    rentalId = Number(rawRentalId);
    lockerId = Number(rawNewLockerId);

    const { data: rental, error } = await supabase.from('t_locacao').select('*').eq('id_locacao', rentalId).maybeSingle();
    if (error) throw error;
    if (!rental || rental.id_usuario !== user.id_usuario || rental.id_status !== 1 || rental.id_armario !== Number(rawOldLockerId)) {
      throw new Error('Invalid exchange request');
    }
    operation = 'Troca de Armário';
    plan = 'N/A';
    value = Number(config.vl_taxa_troca ?? 20);
  } else if (/^UPG_\d+_2$/.test(correlationID)) {
    const [, rawRentalId] = correlationID.split('_');
    rentalId = Number(rawRentalId);

    const { data: rental, error } = await supabase.from('t_locacao').select('*').eq('id_locacao', rentalId).maybeSingle();
    if (error) throw error;
    if (!rental || rental.id_usuario !== user.id_usuario || rental.id_status !== 1) throw new Error('Invalid upgrade request');
    lockerId = rental.id_armario;
    operation = 'Upgrade de Plano';
    plan = 'ANUAL';
  } else if (/^\d+$/.test(correlationID)) {
    rentalId = Number(correlationID);
    const { data: rental, error } = await supabase.from('t_locacao').select('*').eq('id_locacao', rentalId).maybeSingle();
    if (error) throw error;
    if (!rental || rental.id_usuario !== user.id_usuario || rental.id_status !== 5) throw new Error('Invalid rental reservation');
    lockerId = rental.id_armario;
    operation = operationHint === 'renewal' ? 'Renovação de Contrato' : 'Locação';
    plan = Number(rental.id_tipo) === 1 ? 'SEMESTRAL' : 'ANUAL';

    if (operationHint === 'renewal') {
      const numericPreviousRentalId = Number(previousRentalId);
      if (!Number.isInteger(numericPreviousRentalId)) throw new Error('Invalid renewal request');

      const { data: previousRental, error: previousError } = await supabase
        .from('t_locacao')
        .select('id_locacao, id_usuario, id_armario, id_status')
        .eq('id_locacao', numericPreviousRentalId)
        .maybeSingle();
      if (previousError) throw previousError;
      if (!previousRental
        || previousRental.id_usuario !== user.id_usuario
        || previousRental.id_armario !== rental.id_armario
        || previousRental.id_status !== 4) {
        throw new Error('Invalid renewal request');
      }
    }
  } else {
    throw new Error('Unsupported payment operation');
  }

  const { data: locker, error: lockerError } = await supabase
    .from('v_armario')
    .select('id_armario, cd_armario, nm_tamanho, nm_local')
    .eq('id_armario', lockerId)
    .maybeSingle();
  if (lockerError) throw lockerError;
  if (!locker) throw new Error('Locker not found');

  const isSmall = String(locker.nm_tamanho || '').toLowerCase() === 'pequeno';
  if (operation === 'Upgrade de Plano') {
    const semester = Number(isSmall ? config.vl_pequeno_semestral : config.vl_grande_semestral);
    const annual = Number(isSmall ? config.vl_pequeno_anual : config.vl_grande_anual);
    value = Math.max(0, annual - semester);
  } else if (value === undefined) {
    value = Number(
      plan === 'SEMESTRAL'
        ? (isSmall ? config.vl_pequeno_semestral : config.vl_grande_semestral)
        : (isSmall ? config.vl_pequeno_anual : config.vl_grande_anual)
    );
  }

  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid configured payment value');

  const lockerNumber = String(locker.cd_armario).padStart(3, '0');
  return {
    rentalId,
    previousRentalId: operationHint === 'renewal' ? Number(previousRentalId) : null,
    value,
    operation,
    plan,
    locker,
    comment: `CAMUBOX: ${operation} Armário ${lockerNumber} (${user.nm_usuario || user.dc_email})`
  };
};

export default async function handler(req, res) {
  try {
    const supabase = createServerClient();

    if (req.method === 'POST') {
      const auth = await authenticate(supabase, req);
      if (auth.error) return res.status(auth.status).json({ error: auth.error });

      const correlationID = String(req.body?.correlationID || '').trim();
      if (!correlationID) return res.status(400).json({ error: 'Correlation ID is required' });

      const { data: existing, error: existingError } = await supabase
        .from('t_transacao')
        .select('*')
        .eq('dc_correlation_id', correlationID)
        .eq('dc_status', 'AGUARDANDO_PAGAMENTO')
        .eq('tp_meio_pagamento', 'PRESENCIAL')
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) return res.status(200).json({ payment: existing, reused: true });

      const operationHint = String(req.body?.operation || '').toLowerCase();
      const details = await resolveRequestDetails(
        supabase,
        correlationID,
        auth.user,
        operationHint,
        req.body?.previousRentalId
      );
      const expiresAt = new Date(Date.now() + (3 * 24 * 60 * 60 * 1000)).toISOString();
      const reference = `PRES_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
      const payload = {
        payment_method_id: 'in_person',
        requested_at: new Date().toISOString(),
        requested_by: auth.user.id_usuario,
        previous_rental_id: details.previousRentalId
      };

      const { data: payment, error: insertError } = await supabase
        .from('t_transacao')
        .insert([{
          id_locacao: details.rentalId,
          id_woovi_charge: reference,
          vl_transacao: details.value,
          dc_status: 'AGUARDANDO_PAGAMENTO',
          payload_webhook: payload,
          dc_correlation_id: correlationID,
          dc_comentario: details.comment,
          nm_usuario: auth.user.nm_usuario,
          dc_email: auth.user.dc_email,
          nr_celular: auth.user.nr_celular,
          cd_armario: String(details.locker.cd_armario).padStart(3, '0'),
          nm_tamanho: details.locker.nm_tamanho,
          nm_local: details.locker.nm_local,
          tp_operacao: details.operation,
          tp_plano: details.plan,
          tp_meio_pagamento: 'PRESENCIAL',
          dt_expiracao: expiresAt
        }])
        .select('*')
        .single();
      if (insertError) throw insertError;

      return res.status(201).json({ payment, reused: false });
    }

    if (req.method === 'GET') {
      const auth = await authenticate(supabase, req, true);
      if (auth.error) return res.status(auth.status).json({ error: auth.error });

      const { error: expirationError } = await supabase.rpc('expire_in_person_payment_requests');
      if (expirationError) throw expirationError;

      const { data, error } = await supabase
        .from('t_transacao')
        .select('*')
        .eq('dc_status', 'AGUARDANDO_PAGAMENTO')
        .eq('tp_meio_pagamento', 'PRESENCIAL')
        .order('dt_criacao', { ascending: true });
      if (error) throw error;

      return res.status(200).json({ payments: data || [] });
    }

    if (req.method === 'PATCH') {
      const auth = await authenticate(supabase, req, true);
      if (auth.error) return res.status(auth.status).json({ error: auth.error });

      const transactionId = String(req.body?.transactionId || '');
      const action = String(req.body?.action || '').toUpperCase();
      if (!transactionId || !['CONFIRM', 'CANCEL'].includes(action)) {
        return res.status(400).json({ error: 'Invalid resolution data' });
      }

      const { data, error } = await supabase.rpc('resolve_in_person_payment', {
        p_transaction_id: transactionId,
        p_admin_user_id: auth.user.id_usuario,
        p_action: action
      });
      if (error) throw error;

      if (data?.status === 'CANCELADO' && data?.reason === 'PAYMENT_REQUEST_EXPIRED') {
        return res.status(409).json({ error: 'Esta solicitação expirou e precisa ser refeita.' });
      }

      return res.status(200).json({ result: data });
    }

    res.setHeader('Allow', 'GET, POST, PATCH');
    return res.status(405).json({ error: 'Method Not Allowed' });
  } catch (error) {
    console.error('[In-person payment]', error);
    const knownConflict = [
      'LOCKER_ALREADY_OCCUPIED',
      'NEW_LOCKER_UNAVAILABLE',
      'ACTIVE_RENTAL_NOT_FOUND',
      'Invalid rental reservation',
      'Invalid exchange request',
      'Invalid upgrade request',
      'Invalid renewal request'
    ].some((code) => error.message?.includes(code));

    return res.status(knownConflict ? 409 : 500).json({
      error: knownConflict
        ? 'A operação não está mais disponível e precisa ser revisada.'
        : 'Não foi possível processar o pagamento presencial.'
    });
  }
}
