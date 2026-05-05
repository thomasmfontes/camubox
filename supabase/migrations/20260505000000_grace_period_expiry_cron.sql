-- =============================================================================
-- MIGRATION: Grace Period Expiry Automation
-- 
-- Esta migration cria:
--   1. A função process_expired_grace_periods() que:
--      - Encontra locações com id_status = 1 (ATIVA) cujo dt_termino
--        ficou mais de 15 dias no passado (carência expirada)
--      - Encerra essas locações (id_status = 2)
--      - Coloca o armário em Vistoria (id_status = 2 na t_armario)
--
--   2. Um job pg_cron que executa essa função diariamente à meia-noite
-- =============================================================================

-- Habilitar extensão pg_cron (já disponível no Supabase hosted)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- =============================================================================
-- FUNÇÃO: Processar expiração da carência de 15 dias
-- =============================================================================
CREATE OR REPLACE FUNCTION process_expired_grace_periods()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_rental RECORD;
    v_processed INT := 0;
BEGIN
    -- Busca locações cujo prazo de carência de 15 dias expirou:
    --   id_status = 1 (ATIVA no banco, mas data já passou + 15 dias)
    --   dt_termino < CURRENT_DATE - 15 dias
    FOR v_rental IN
        SELECT
            id_locacao,
            id_armario,
            id_usuario,
            dt_termino
        FROM t_locacao
        WHERE
            id_status = 1
            AND dt_termino < (CURRENT_DATE - INTERVAL '15 days')
    LOOP
        -- 1. Encerrar a locação
        UPDATE t_locacao
        SET
            id_status = 2,
            dc_status_locacao = 'ENCERRADA'
        WHERE id_locacao = v_rental.id_locacao;

        -- 2. Colocar o armário em Vistoria (id_status = 2)
        UPDATE t_armario
        SET id_status = 2
        WHERE id_armario = v_rental.id_armario;

        -- 3. (Opcional) Criar notificação para o usuário informando que o prazo expirou
        INSERT INTO t_notificacao (id_usuario, dc_titulo, dc_mensagem, is_lida, dt_criacao)
        VALUES (
            v_rental.id_usuario,
            'Prazo de carência encerrado',
            'O prazo de renovação prioritária do seu armário expirou após 15 dias. O armário foi liberado e está disponível para outros alunos.',
            false,
            NOW()
        )
        ON CONFLICT DO NOTHING;

        v_processed := v_processed + 1;
    END LOOP;

    -- Log no PostgreSQL (visível em Supabase > Logs > Postgres)
    IF v_processed > 0 THEN
        RAISE NOTICE '[CAMUBOX CRON] % locações encerradas por expiração de carência em %',
            v_processed,
            CURRENT_TIMESTAMP;
    END IF;
END;
$$;

-- Conceder permissão de execução ao role postgres (usado pelo pg_cron)
GRANT EXECUTE ON FUNCTION process_expired_grace_periods() TO postgres;

-- =============================================================================
-- CRON JOB: Executa diariamente à meia-noite (horário UTC → 21h00 BRT)
-- Para ajustar o horário: cron '0 3 * * *' = 03:00 UTC = 00:00 BRT
-- =============================================================================
SELECT cron.schedule(
    'camubox-grace-period-expiry',   -- nome único do job
    '0 3 * * *',                      -- todo dia às 03:00 UTC (00:00 BRT)
    'SELECT process_expired_grace_periods()'
);

-- =============================================================================
-- COMENTÁRIO: Para verificar/gerenciar os jobs pg_cron:
--
--   Ver todos os jobs:
--     SELECT * FROM cron.job;
--
--   Ver histórico de execuções:
--     SELECT * FROM cron.job_run_details ORDER BY start_time DESC LIMIT 20;
--
--   Remover o job (se necessário):
--     SELECT cron.unschedule('camubox-grace-period-expiry');
--
--   Executar manualmente para testar:
--     SELECT process_expired_grace_periods();
-- =============================================================================
