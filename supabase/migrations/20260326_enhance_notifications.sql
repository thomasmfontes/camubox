-- 1. Add entity management columns to t_notificacao
ALTER TABLE t_notificacao ADD COLUMN IF NOT EXISTS id_entidade TEXT;
ALTER TABLE t_notificacao ADD COLUMN IF NOT EXISTS tp_entidade TEXT;

-- 2. Update the waiting list process function to include locker details
CREATE OR REPLACE FUNCTION fn_processar_fila_espera()
RETURNS TRIGGER AS $$
DECLARE
    v_proximo_fila RECORD;
    v_cd_armario TEXT;
BEGIN
    -- Check if locker became DISPONIVEL (id_status = 1)
    IF (NEW.id_status = 1 AND (OLD.id_status != 1 OR OLD.id_status IS NULL)) THEN
        -- Get the locker code first
        SELECT cd_armario INTO v_cd_armario FROM t_armario WHERE id_armario = NEW.id_armario;

        -- Check if there is someone in the queue for this locker
        SELECT * INTO v_proximo_fila 
        FROM t_fila_espera 
        WHERE id_armario = NEW.id_armario 
          AND id_status = 1 -- AGUARDANDO
        ORDER BY dt_entrada ASC 
        LIMIT 1;

        IF FOUND THEN
            -- Update locker status to RESERVADO (5)
            NEW.id_status := 5;

            -- Update queue record to RESERVADO (2)
            UPDATE t_fila_espera 
            SET id_status = 2,
                dt_notificacao = NOW(),
                dt_expiracao_reserva = NOW() + INTERVAL '24 hours'
            WHERE id_fila = v_proximo_fila.id_fila;

            -- Create a notification for the user with entity ID for deep-linking
            INSERT INTO t_notificacao (id_usuario, dc_titulo, dc_mensagem, is_lida, dt_criacao, id_entidade, tp_entidade)
            VALUES (
                v_proximo_fila.id_usuario,
                'Armário Liberado! 📦',
                'O armário ' || v_cd_armario || ' que você queria foi liberado e está reservado para você por 24 horas.',
                FALSE,
                NOW(),
                NEW.id_armario::TEXT,
                'armario'
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
