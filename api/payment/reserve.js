import { createClient } from '@supabase/supabase-js';

const RESERVATION_MINUTES = {
  pix: 30,
  credit_card: 60,
  boleto: 4 * 24 * 60
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return res.status(500).json({ error: 'Supabase server configuration missing' });
  }

  const { lockerId, typeId, previousRentalId, paymentMethod } = req.body || {};
  const numericLockerId = Number(lockerId);
  const numericTypeId = Number(typeId);
  const numericPreviousRentalId = previousRentalId ? Number(previousRentalId) : null;

  if (!Number.isInteger(numericLockerId) || ![1, 2].includes(numericTypeId)) {
    return res.status(400).json({ error: 'Invalid reservation data' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  try {
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData?.user?.email) {
      return res.status(401).json({ error: 'Invalid session' });
    }

    const { data: dbUser, error: userError } = await supabase
      .from('t_usuario')
      .select('id_usuario')
      .ilike('dc_email', authData.user.email)
      .maybeSingle();

    if (userError) throw userError;
    if (!dbUser) {
      return res.status(403).json({ error: 'CAMUBOX user not found' });
    }

    const reservationMinutes = RESERVATION_MINUTES[paymentMethod] || 60;
    const { data, error } = await supabase.rpc('reserve_locker_for_payment', {
      p_user_id: dbUser.id_usuario,
      p_locker_id: numericLockerId,
      p_type_id: numericTypeId,
      p_previous_rental_id: numericPreviousRentalId,
      p_reservation_minutes: reservationMinutes
    });

    if (error) {
      const knownConflict = [
        'LOCKER_ALREADY_OCCUPIED',
        'LOCKER_ALREADY_RESERVED',
        'LOCKER_RESERVED_FOR_ANOTHER_USER',
        'LOCKER_PHYSICALLY_UNAVAILABLE',
        'INVALID_RENEWAL_RENTAL'
      ].some((code) => error.message?.includes(code));

      if (knownConflict) {
        return res.status(409).json({
          error: 'Este armário não está mais disponível. Escolha outra unidade.'
        });
      }
      throw error;
    }

    return res.status(200).json({ reservation: data });
  } catch (error) {
    console.error('Error reserving locker for payment:', error);
    return res.status(500).json({ error: 'Failed to reserve locker' });
  }
}
