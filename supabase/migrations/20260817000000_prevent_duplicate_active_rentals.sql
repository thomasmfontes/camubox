-- Prevent two users from holding the same locker and align rental status semantics.

-- Status 5 is intentionally separate from t_armario_status 5. Both represent a
-- reservation, but each belongs to its own status table.
INSERT INTO public.t_locacao_status (
  id_locacao_status,
  nm_locacao_status,
  nr_ordem,
  is_ativo
)
VALUES (5, 'AGUARDANDO_PAGAMENTO', 5, true)
ON CONFLICT (id_locacao_status) DO UPDATE
SET nm_locacao_status = EXCLUDED.nm_locacao_status,
    nr_ordem = EXCLUDED.nr_ordem,
    is_ativo = true;

ALTER TABLE public.t_locacao
  ADD COLUMN IF NOT EXISTS dt_expiracao_reserva TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transacao_status')
     AND NOT EXISTS (
       SELECT 1
       FROM pg_enum e
       JOIN pg_type t ON t.oid = e.enumtypid
       WHERE t.typname = 'transacao_status'
         AND e.enumlabel = 'CONFLITO'
     ) THEN
    ALTER TYPE public.transacao_status ADD VALUE 'CONFLITO';
  END IF;
END $$;

-- This is the final safety net against concurrent callbacks or application bugs.
-- Existing duplicates must be resolved before applying this migration.
CREATE UNIQUE INDEX IF NOT EXISTS uq_t_locacao_one_active_per_locker
  ON public.t_locacao (id_armario)
  WHERE id_status = 1;

CREATE INDEX IF NOT EXISTS idx_t_locacao_pending_expiration
  ON public.t_locacao (dt_expiracao_reserva)
  WHERE id_status = 5;

CREATE OR REPLACE FUNCTION public.reserve_locker_for_payment(
  p_user_id BIGINT,
  p_locker_id BIGINT,
  p_type_id INTEGER,
  p_previous_rental_id BIGINT DEFAULT NULL,
  p_reservation_minutes INTEGER DEFAULT 60
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id BIGINT;
  v_existing_expiration TIMESTAMPTZ;
  v_new_id BIGINT;
  v_expiration TIMESTAMPTZ;
  v_locker_status INTEGER;
  v_previous RECORD;
BEGIN
  IF p_user_id IS NULL OR p_locker_id IS NULL OR p_type_id NOT IN (1, 2) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_RESERVATION_DATA';
  END IF;

  -- Serialize every decision concerning this physical locker.
  PERFORM pg_advisory_xact_lock(p_locker_id);

  SELECT id_status
    INTO v_locker_status
  FROM public.t_armario
  WHERE id_armario = p_locker_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'LOCKER_NOT_FOUND';
  END IF;

  -- Expire stale payment reservations for this locker before checking it.
  UPDATE public.t_locacao
  SET id_status = 3,
      dt_expiracao_reserva = NULL
  WHERE id_armario = p_locker_id
    AND id_status = 5
    AND dt_expiracao_reserva <= NOW();

  SELECT id_locacao, dt_expiracao_reserva
    INTO v_existing_id, v_existing_expiration
  FROM public.t_locacao
  WHERE id_armario = p_locker_id
    AND id_usuario = p_user_id
    AND id_status = 5
    AND dt_expiracao_reserva > NOW()
  ORDER BY id_locacao DESC
  LIMIT 1
  FOR UPDATE;

  IF v_existing_id IS NOT NULL THEN
    UPDATE public.t_armario SET id_status = 5 WHERE id_armario = p_locker_id;
    RETURN jsonb_build_object(
      'id_locacao', v_existing_id,
      'dt_expiracao_reserva', v_existing_expiration,
      'reused', true
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.t_locacao
    WHERE id_armario = p_locker_id
      AND id_status = 1
      AND (p_previous_rental_id IS NULL OR id_locacao <> p_previous_rental_id)
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LOCKER_ALREADY_OCCUPIED';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.t_locacao
    WHERE id_armario = p_locker_id
      AND id_status = 5
      AND dt_expiracao_reserva > NOW()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LOCKER_ALREADY_RESERVED';
  END IF;

  -- Respect reservations created by the waiting-list workflow. A locker in
  -- status RESERVADO may only proceed for the user who owns that reservation.
  IF v_locker_status = 5 AND EXISTS (
    SELECT 1
    FROM public.t_fila_espera
    WHERE id_armario = p_locker_id
      AND id_status = 2
      AND id_usuario <> p_user_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LOCKER_RESERVED_FOR_ANOTHER_USER';
  END IF;

  IF v_locker_status NOT IN (1, 5) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'LOCKER_PHYSICALLY_UNAVAILABLE';
  END IF;

  IF p_previous_rental_id IS NOT NULL THEN
    SELECT *
      INTO v_previous
    FROM public.t_locacao
    WHERE id_locacao = p_previous_rental_id
    FOR UPDATE;

    IF NOT FOUND
       OR v_previous.id_usuario <> p_user_id
       OR v_previous.id_armario <> p_locker_id
       OR v_previous.id_status <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'INVALID_RENEWAL_RENTAL';
    END IF;

    UPDATE public.t_locacao
    SET id_status = 4
    WHERE id_locacao = p_previous_rental_id;
  END IF;

  v_expiration := NOW() + make_interval(mins => GREATEST(5, LEAST(p_reservation_minutes, 10080)));

  INSERT INTO public.t_locacao (
    id_armario,
    id_usuario,
    id_tipo,
    id_status,
    dt_inicio,
    dt_termino,
    dt_expiracao_reserva
  )
  VALUES (
    p_locker_id,
    p_user_id,
    p_type_id,
    5,
    CURRENT_DATE,
    CASE WHEN p_type_id = 1 THEN CURRENT_DATE + INTERVAL '6 months'
         ELSE CURRENT_DATE + INTERVAL '1 year' END,
    v_expiration
  )
  RETURNING id_locacao INTO v_new_id;

  UPDATE public.t_armario
  SET id_status = 5
  WHERE id_armario = p_locker_id;

  RETURN jsonb_build_object(
    'id_locacao', v_new_id,
    'dt_expiracao_reserva', v_expiration,
    'reused', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_locker_for_payment(BIGINT, BIGINT, INTEGER, BIGINT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_locker_for_payment(BIGINT, BIGINT, INTEGER, BIGINT, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.confirm_regular_rental_payment(p_rental_id BIGINT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental RECORD;
  v_conflicting_rental BIGINT;
BEGIN
  SELECT *
    INTO v_rental
  FROM public.t_locacao
  WHERE id_locacao = p_rental_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('confirmed', false, 'reason', 'RENTAL_NOT_FOUND');
  END IF;

  PERFORM pg_advisory_xact_lock(v_rental.id_armario);

  SELECT id_locacao
    INTO v_conflicting_rental
  FROM public.t_locacao
  WHERE id_armario = v_rental.id_armario
    AND id_status = 1
    AND id_locacao <> p_rental_id
  ORDER BY id_locacao
  LIMIT 1
  FOR UPDATE;

  IF v_conflicting_rental IS NOT NULL THEN
    RETURN jsonb_build_object(
      'confirmed', false,
      'reason', 'LOCKER_ALREADY_OCCUPIED',
      'conflicting_rental_id', v_conflicting_rental,
      'locker_id', v_rental.id_armario
    );
  END IF;

  IF v_rental.id_status = 1 THEN
    RETURN jsonb_build_object(
      'confirmed', true,
      'already_confirmed', true,
      'locker_id', v_rental.id_armario,
      'user_id', v_rental.id_usuario
    );
  END IF;

  IF v_rental.id_status <> 5 THEN
    RETURN jsonb_build_object(
      'confirmed', false,
      'reason', 'RENTAL_NOT_AWAITING_PAYMENT',
      'rental_status', v_rental.id_status,
      'locker_id', v_rental.id_armario
    );
  END IF;

  UPDATE public.t_locacao
  SET id_status = 1,
      dt_expiracao_reserva = NULL
  WHERE id_locacao = p_rental_id;

  UPDATE public.t_armario
  SET id_status = 1
  WHERE id_armario = v_rental.id_armario;

  RETURN jsonb_build_object(
    'confirmed', true,
    'already_confirmed', false,
    'locker_id', v_rental.id_armario,
    'user_id', v_rental.id_usuario
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object(
      'confirmed', false,
      'reason', 'LOCKER_ALREADY_OCCUPIED',
      'locker_id', v_rental.id_armario
    );
END;
$$;

REVOKE ALL ON FUNCTION public.confirm_regular_rental_payment(BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_regular_rental_payment(BIGINT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.move_rental_safely(
  p_rental_id BIGINT,
  p_old_locker_id BIGINT,
  p_new_locker_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rental RECORD;
  v_history_id BIGINT;
  v_old_has_active BOOLEAN;
BEGIN
  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1
    FROM public.t_usuario
    WHERE lower(dc_email) = lower(auth.jwt() ->> 'email')
      AND is_adm = true
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ADMIN_REQUIRED';
  END IF;

  IF p_old_locker_id = p_new_locker_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SAME_LOCKER';
  END IF;

  -- Stable lock order prevents deadlocks when two swaps cross each other.
  PERFORM pg_advisory_xact_lock(LEAST(p_old_locker_id, p_new_locker_id));
  PERFORM pg_advisory_xact_lock(GREATEST(p_old_locker_id, p_new_locker_id));

  SELECT *
    INTO v_rental
  FROM public.t_locacao
  WHERE id_locacao = p_rental_id
  FOR UPDATE;

  IF NOT FOUND OR v_rental.id_armario <> p_old_locker_id OR v_rental.id_status <> 1 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVE_RENTAL_NOT_FOUND';
  END IF;

  PERFORM 1 FROM public.t_armario WHERE id_armario = p_new_locker_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'NEW_LOCKER_NOT_FOUND';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.t_locacao
    WHERE id_armario = p_new_locker_id
      AND id_status IN (1, 5)
      AND (id_status = 1 OR dt_expiracao_reserva > NOW())
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'NEW_LOCKER_UNAVAILABLE';
  END IF;

  INSERT INTO public.t_locacao (
    id_armario,
    id_usuario,
    dt_inicio,
    dt_termino,
    id_tipo,
    id_status,
    cd_senha,
    dt_expiracao_reserva
  )
  VALUES (
    v_rental.id_armario,
    v_rental.id_usuario,
    v_rental.dt_inicio,
    CURRENT_DATE,
    v_rental.id_tipo,
    4,
    v_rental.cd_senha,
    NULL
  )
  RETURNING id_locacao INTO v_history_id;

  UPDATE public.t_locacao
  SET id_armario = p_new_locker_id
  WHERE id_locacao = p_rental_id;

  SELECT EXISTS (
    SELECT 1 FROM public.t_locacao
    WHERE id_armario = p_old_locker_id
      AND id_status = 1
  ) INTO v_old_has_active;

  UPDATE public.t_armario
  SET id_status = CASE WHEN v_old_has_active THEN 1 ELSE 2 END
  WHERE id_armario = p_old_locker_id;

  UPDATE public.t_armario
  SET id_status = 1
  WHERE id_armario = p_new_locker_id;

  RETURN jsonb_build_object(
    'moved', true,
    'history_rental_id', v_history_id,
    'old_locker_has_active_rental', v_old_has_active
  );
END;
$$;

REVOKE ALL ON FUNCTION public.move_rental_safely(BIGINT, BIGINT, BIGINT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.move_rental_safely(BIGINT, BIGINT, BIGINT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expire_payment_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_locker_id BIGINT;
  v_processed INTEGER := 0;
  v_affected INTEGER := 0;
BEGIN
  FOR v_locker_id IN
    SELECT DISTINCT id_armario
    FROM public.t_locacao
    WHERE id_status = 5
      AND dt_expiracao_reserva <= NOW()
  LOOP
    PERFORM pg_advisory_xact_lock(v_locker_id);

    UPDATE public.t_locacao
    SET id_status = 3,
        dt_expiracao_reserva = NULL
    WHERE id_armario = v_locker_id
      AND id_status = 5
      AND dt_expiracao_reserva <= NOW();

    GET DIAGNOSTICS v_affected = ROW_COUNT;
    v_processed := v_processed + v_affected;

    UPDATE public.t_armario
    SET id_status = CASE
      WHEN EXISTS (
        SELECT 1 FROM public.t_locacao
        WHERE id_armario = v_locker_id AND id_status = 5 AND dt_expiracao_reserva > NOW()
      ) OR EXISTS (
        SELECT 1 FROM public.t_fila_espera
        WHERE id_armario = v_locker_id AND id_status = 2
      ) THEN 5
      ELSE 1
    END
    WHERE id_armario = v_locker_id;
  END LOOP;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_payment_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_payment_reservations() TO postgres, service_role;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'camubox-payment-reservation-expiry';
    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'camubox-payment-reservation-expiry',
      '*/5 * * * *',
      'SELECT public.expire_payment_reservations()'
    );
  END IF;
END;
$$;
