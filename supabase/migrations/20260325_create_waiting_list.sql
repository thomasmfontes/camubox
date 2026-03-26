-- 1. Create the waiting list table
CREATE TABLE IF NOT EXISTS t_fila_espera (
    id_fila UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    id_armario INT NOT NULL REFERENCES t_armario(id_armario) ON DELETE CASCADE,
    id_usuario INT NOT NULL REFERENCES t_usuario(id_usuario) ON DELETE CASCADE,
    dt_entrada TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    id_status INT DEFAULT 1, -- 1: AGUARDANDO, 2: RESERVADO/NOTIFICADO, 3: CONCLUIDO, 4: EXPIRADO/CANCELADO
    dt_notificacao TIMESTAMP WITH TIME ZONE,
    dt_expiracao_reserva TIMESTAMP WITH TIME ZONE,
    UNIQUE(id_armario, id_usuario, id_status) -- Prevent same user in same queue wait status
);

-- 2. Add description for statuses (If you have a status lookup table for the queue)
-- CREATE TABLE IF NOT EXISTS t_fila_espera_status (id_status INT PRIMARY KEY, nm_status TEXT);
-- INSERT INTO t_fila_espera_status VALUES (1, 'AGUARDANDO'), (2, 'RESERVADO'), (3, 'CONCLUIDO'), (4, 'EXPIRADO');

-- 3. Add the RESERVADO_FILA status to t_armario_status
-- Assuming the next available ID is 5. If not, please adjust.
INSERT INTO t_armario_status (id_status, nm_status) 
OVERRIDING SYSTEM VALUE
VALUES (5, 'RESERVADO')
ON CONFLICT (id_status) DO NOTHING;

-- 4. Function to handle automatic reservation when a locker becomes available
CREATE OR REPLACE FUNCTION fn_processar_fila_espera()
RETURNS TRIGGER AS $$
DECLARE
    v_proximo_fila RECORD;
BEGIN
    -- Check if locker became DISPONIVEL (id_status = 1)
    IF (NEW.id_status = 1 AND (OLD.id_status != 1 OR OLD.id_status IS NULL)) THEN
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

            -- Create a notification for the user
            INSERT INTO t_notificacao (id_usuario, dc_titulo, dc_mensagem, is_lida, dt_criacao)
            VALUES (
                v_proximo_fila.id_usuario,
                'Armário Liberado!',
                'O armário ' || (SELECT nr_armario FROM t_armario WHERE id_armario = NEW.id_armario) || ' que você queria foi liberado e está reservado para você por 24 horas.',
                FALSE,
                NOW()
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger on t_armario
DROP TRIGGER IF EXISTS tr_armario_fila_espera ON t_armario;
CREATE TRIGGER tr_armario_fila_espera
BEFORE UPDATE ON t_armario
FOR EACH ROW
EXECUTE FUNCTION fn_processar_fila_espera();

-- 6. Function to clean up expired reservations (can be called by a cron or manually)
CREATE OR REPLACE FUNCTION fn_limpar_reservas_expiradas()
RETURNS VOID AS $$
DECLARE
    v_reserva RECORD;
BEGIN
    FOR v_reserva IN 
        SELECT * FROM t_fila_espera 
        WHERE id_status = 2 AND dt_expiracao_reserva < NOW()
    LOOP
        -- Move to expired status
        UPDATE t_fila_espera SET id_status = 4 WHERE id_fila = v_reserva.id_fila;
        
        -- Set locker back to available (which will re-trigger the queue for the next person)
        UPDATE t_armario SET id_status = 1 WHERE id_armario = v_reserva.id_armario;
    END LOOP;
END;
$$ LANGUAGE plpgsql;
