-- Adds auditable in-person payments and an atomic admin confirmation flow.

ALTER TABLE public.t_transacao
  ADD COLUMN IF NOT EXISTS tp_meio_pagamento VARCHAR(30),
  ADD COLUMN IF NOT EXISTS dt_expiracao TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dt_confirmacao_manual TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS id_usuario_confirmacao BIGINT REFERENCES public.t_usuario(id_usuario);

CREATE INDEX IF NOT EXISTS idx_t_transacao_in_person_pending
  ON public.t_transacao (dt_expiracao, dt_criacao DESC)
  WHERE dc_status = 'AGUARDANDO_PAGAMENTO'
    AND tp_meio_pagamento = 'PRESENCIAL';

CREATE UNIQUE INDEX IF NOT EXISTS uq_t_transacao_in_person_pending_correlation
  ON public.t_transacao (dc_correlation_id)
  WHERE dc_status = 'AGUARDANDO_PAGAMENTO'
    AND tp_meio_pagamento = 'PRESENCIAL';

CREATE OR REPLACE FUNCTION public.cancel_expired_in_person_payment()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_previous_rental_id BIGINT;
BEGIN
  IF OLD.id_status = 5 AND NEW.id_status = 3 THEN
    SELECT NULLIF(payload_webhook ->> 'previous_rental_id', '')::BIGINT
      INTO v_previous_rental_id
    FROM public.t_transacao
    WHERE dc_correlation_id = NEW.id_locacao::TEXT
      AND dc_status = 'AGUARDANDO_PAGAMENTO'
      AND tp_meio_pagamento = 'PRESENCIAL'
    ORDER BY dt_criacao DESC
    LIMIT 1;

    UPDATE public.t_transacao
    SET dc_status = 'CANCELADO',
        payload_webhook = COALESCE(payload_webhook, '{}'::JSONB) || jsonb_build_object(
          'automatic_action', 'reservation_expired',
          'automatic_action_at', NOW()
        )
    WHERE dc_correlation_id = NEW.id_locacao::TEXT
      AND dc_status = 'AGUARDANDO_PAGAMENTO'
      AND tp_meio_pagamento = 'PRESENCIAL';

    IF v_previous_rental_id IS NOT NULL THEN
      UPDATE public.t_locacao
      SET id_status = 1
      WHERE id_locacao = v_previous_rental_id
        AND id_usuario = OLD.id_usuario
        AND id_armario = OLD.id_armario
        AND id_status = 4
        AND NOT EXISTS (
          SELECT 1
          FROM public.t_locacao active_rental
          WHERE active_rental.id_armario = OLD.id_armario
            AND active_rental.id_status = 1
            AND active_rental.id_locacao <> v_previous_rental_id
        );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_cancel_expired_in_person_payment ON public.t_locacao;
CREATE TRIGGER tr_cancel_expired_in_person_payment
AFTER UPDATE OF id_status ON public.t_locacao
FOR EACH ROW
EXECUTE FUNCTION public.cancel_expired_in_person_payment();

CREATE OR REPLACE FUNCTION public.resolve_in_person_payment(
  p_transaction_id UUID,
  p_admin_user_id BIGINT,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.t_transacao%ROWTYPE;
  v_rental public.t_locacao%ROWTYPE;
  v_confirmation JSONB;
  v_parts TEXT[];
  v_rental_id BIGINT;
  v_old_locker_id BIGINT;
  v_new_locker_id BIGINT;
  v_new_type_id INTEGER;
  v_previous_rental_id BIGINT;
  v_admin_is_valid BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.t_usuario
    WHERE id_usuario = p_admin_user_id
      AND is_adm = true
  ) INTO v_admin_is_valid;

  IF auth.role() <> 'service_role' OR NOT v_admin_is_valid THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ADMIN_REQUIRED';
  END IF;

  IF upper(p_action) NOT IN ('CONFIRM', 'CANCEL') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_ACTION';
  END IF;

  SELECT *
    INTO v_tx
  FROM public.t_transacao
  WHERE id_transacao = p_transaction_id
  FOR UPDATE;

  IF NOT FOUND OR v_tx.tp_meio_pagamento <> 'PRESENCIAL' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'IN_PERSON_PAYMENT_NOT_FOUND';
  END IF;

  IF v_tx.dc_status <> 'AGUARDANDO_PAGAMENTO' THEN
    RETURN jsonb_build_object(
      'resolved', true,
      'already_resolved', true,
      'status', v_tx.dc_status
    );
  END IF;

  v_previous_rental_id := NULLIF(v_tx.payload_webhook ->> 'previous_rental_id', '')::BIGINT;

  IF v_tx.dt_expiracao IS NOT NULL AND v_tx.dt_expiracao <= NOW() THEN
    IF v_tx.dc_correlation_id ~ '^[0-9]+$' THEN
      v_rental_id := v_tx.dc_correlation_id::BIGINT;

      SELECT * INTO v_rental
      FROM public.t_locacao
      WHERE id_locacao = v_rental_id
      FOR UPDATE;

      IF FOUND AND v_rental.id_status = 5 THEN
        UPDATE public.t_locacao
        SET id_status = 3,
            dt_expiracao_reserva = NULL
        WHERE id_locacao = v_rental_id;

        UPDATE public.t_armario
        SET id_status = CASE
          WHEN EXISTS (
            SELECT 1 FROM public.t_locacao
            WHERE id_armario = v_rental.id_armario
              AND id_status = 5
              AND dt_expiracao_reserva > NOW()
          ) OR EXISTS (
            SELECT 1 FROM public.t_fila_espera
            WHERE id_armario = v_rental.id_armario
              AND id_status = 2
          ) THEN 5
          ELSE 1
        END
        WHERE id_armario = v_rental.id_armario;
      END IF;
    END IF;

    UPDATE public.t_transacao
    SET dc_status = 'CANCELADO',
        payload_webhook = COALESCE(payload_webhook, '{}'::JSONB) || jsonb_build_object(
          'automatic_action', 'request_expired',
          'automatic_action_at', NOW()
        )
    WHERE id_transacao = p_transaction_id;

    RETURN jsonb_build_object('resolved', true, 'status', 'CANCELADO', 'reason', 'PAYMENT_REQUEST_EXPIRED');
  END IF;

  IF upper(p_action) = 'CANCEL' THEN
    IF v_tx.dc_correlation_id ~ '^[0-9]+$' THEN
      v_rental_id := v_tx.dc_correlation_id::BIGINT;

      SELECT * INTO v_rental
      FROM public.t_locacao
      WHERE id_locacao = v_rental_id
      FOR UPDATE;

      IF FOUND AND v_rental.id_status = 5 THEN
        UPDATE public.t_locacao
        SET id_status = 3,
            dt_expiracao_reserva = NULL
        WHERE id_locacao = v_rental_id;

        UPDATE public.t_armario
        SET id_status = CASE
          WHEN EXISTS (
            SELECT 1 FROM public.t_locacao
            WHERE id_armario = v_rental.id_armario
              AND id_status = 5
              AND dt_expiracao_reserva > NOW()
          ) OR EXISTS (
            SELECT 1 FROM public.t_fila_espera
            WHERE id_armario = v_rental.id_armario
              AND id_status = 2
          ) THEN 5
          ELSE 1
        END
        WHERE id_armario = v_rental.id_armario;
      END IF;

      IF v_previous_rental_id IS NOT NULL THEN
        UPDATE public.t_locacao
        SET id_status = 1
        WHERE id_locacao = v_previous_rental_id
          AND id_usuario = v_rental.id_usuario
          AND id_armario = v_rental.id_armario
          AND id_status = 4
          AND NOT EXISTS (
            SELECT 1
            FROM public.t_locacao active_rental
            WHERE active_rental.id_armario = v_rental.id_armario
              AND active_rental.id_status = 1
              AND active_rental.id_locacao <> v_previous_rental_id
          );
      END IF;
    END IF;

    UPDATE public.t_transacao
    SET dc_status = 'CANCELADO',
        dt_confirmacao_manual = NOW(),
        id_usuario_confirmacao = p_admin_user_id,
        payload_webhook = COALESCE(payload_webhook, '{}'::JSONB) || jsonb_build_object(
          'manual_action', 'cancelled',
          'manual_action_at', NOW(),
          'manual_action_by', p_admin_user_id
        )
    WHERE id_transacao = p_transaction_id;

    RETURN jsonb_build_object('resolved', true, 'status', 'CANCELADO');
  END IF;

  IF v_tx.dc_correlation_id LIKE 'EXC\_%' ESCAPE '\' THEN
    v_parts := string_to_array(v_tx.dc_correlation_id, '_');
    v_rental_id := v_parts[2]::BIGINT;
    v_old_locker_id := v_parts[3]::BIGINT;
    v_new_locker_id := v_parts[4]::BIGINT;

    PERFORM public.move_rental_safely(v_rental_id, v_old_locker_id, v_new_locker_id);
  ELSIF v_tx.dc_correlation_id LIKE 'UPG\_%' ESCAPE '\' THEN
    v_parts := string_to_array(v_tx.dc_correlation_id, '_');
    v_rental_id := v_parts[2]::BIGINT;
    v_new_type_id := v_parts[3]::INTEGER;

    IF v_new_type_id <> 2 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'INVALID_UPGRADE_TYPE';
    END IF;

    SELECT * INTO v_rental
    FROM public.t_locacao
    WHERE id_locacao = v_rental_id
    FOR UPDATE;

    IF NOT FOUND OR v_rental.id_status <> 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ACTIVE_RENTAL_NOT_FOUND';
    END IF;

    UPDATE public.t_locacao
    SET id_tipo = 2,
        dt_termino = (dt_inicio + INTERVAL '1 year')::DATE
    WHERE id_locacao = v_rental_id;
  ELSIF v_tx.dc_correlation_id ~ '^[0-9]+$' THEN
    v_rental_id := v_tx.dc_correlation_id::BIGINT;
    SELECT public.confirm_regular_rental_payment(v_rental_id) INTO v_confirmation;

    IF NOT COALESCE((v_confirmation ->> 'confirmed')::BOOLEAN, false) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = COALESCE(v_confirmation ->> 'reason', 'PAYMENT_CONFIRMATION_FAILED');
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'UNSUPPORTED_CORRELATION_ID';
  END IF;

  UPDATE public.t_transacao
  SET dc_status = 'CONCLUIDO',
      dt_pagamento = NOW(),
      dt_confirmacao_manual = NOW(),
      id_usuario_confirmacao = p_admin_user_id,
      payload_webhook = COALESCE(payload_webhook, '{}'::JSONB) || jsonb_build_object(
        'manual_action', 'confirmed',
        'manual_action_at', NOW(),
        'manual_action_by', p_admin_user_id
      )
  WHERE id_transacao = p_transaction_id;

  IF v_rental_id IS NOT NULL THEN
    SELECT * INTO v_rental
    FROM public.t_locacao
    WHERE id_locacao = v_rental_id;

    IF FOUND THEN
      INSERT INTO public.t_notificacao (
        id_usuario,
        dc_titulo,
        dc_mensagem,
        tp_entidade,
        id_entidade
      ) VALUES (
        v_rental.id_usuario,
        'Pagamento presencial confirmado! ✅',
        'O recebimento presencial foi confirmado pela equipe CAMUBOX.',
        'armario',
        COALESCE(v_new_locker_id, v_rental.id_armario)
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('resolved', true, 'status', 'CONCLUIDO');
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_in_person_payment(UUID, BIGINT, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_in_person_payment(UUID, BIGINT, TEXT)
  TO service_role;

CREATE OR REPLACE FUNCTION public.expire_in_person_payment_requests()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx public.t_transacao%ROWTYPE;
  v_processed INTEGER := 0;
BEGIN
  IF auth.role() NOT IN ('service_role', 'postgres') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SERVICE_ROLE_REQUIRED';
  END IF;

  -- Expire regular locker reservations first. Its trigger also closes the
  -- matching in-person transaction and restores a previous renewal contract.
  PERFORM public.expire_payment_reservations();

  FOR v_tx IN
    SELECT *
    FROM public.t_transacao
    WHERE dc_status = 'AGUARDANDO_PAGAMENTO'
      AND tp_meio_pagamento = 'PRESENCIAL'
      AND dt_expiracao <= NOW()
    ORDER BY dt_expiracao
    FOR UPDATE SKIP LOCKED
  LOOP
    IF v_tx.dc_correlation_id ~ '^[0-9]+$' THEN
      UPDATE public.t_locacao
      SET id_status = 3,
          dt_expiracao_reserva = NULL
      WHERE id_locacao = v_tx.dc_correlation_id::BIGINT
        AND id_status = 5;
    END IF;

    UPDATE public.t_transacao
    SET dc_status = 'CANCELADO',
        payload_webhook = COALESCE(payload_webhook, '{}'::JSONB) || jsonb_build_object(
          'automatic_action', 'request_expired',
          'automatic_action_at', NOW()
        )
    WHERE id_transacao = v_tx.id_transacao;

    v_processed := v_processed + 1;
  END LOOP;

  RETURN v_processed;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_in_person_payment_requests()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_in_person_payment_requests()
  TO postgres, service_role;

DO $$
DECLARE
  v_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'cron') THEN
    SELECT jobid INTO v_job_id
    FROM cron.job
    WHERE jobname = 'camubox-in-person-payment-expiry';

    IF v_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(v_job_id);
    END IF;

    PERFORM cron.schedule(
      'camubox-in-person-payment-expiry',
      '*/5 * * * *',
      'SELECT public.expire_in_person_payment_requests()'
    );
  END IF;
END;
$$;
