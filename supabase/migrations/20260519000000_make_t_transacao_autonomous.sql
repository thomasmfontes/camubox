-- Migration: Tornar t_transacao autônoma e desnormalizada
-- Descrição: Altera a chave estrangeira de id_locacao para ON DELETE SET NULL, torna o campo anulável e adiciona colunas desnormalizadas para auditoria independente.

-- 1. Remover a FK antiga se ela existir e recriar com ON DELETE SET NULL
ALTER TABLE public.t_transacao DROP CONSTRAINT IF EXISTS t_transacao_id_locacao_fkey;
ALTER TABLE public.t_transacao ALTER COLUMN id_locacao DROP NOT NULL;
ALTER TABLE public.t_transacao ADD CONSTRAINT t_transacao_id_locacao_fkey 
  FOREIGN KEY (id_locacao) REFERENCES public.t_locacao(id_locacao) ON DELETE SET NULL;

-- 2. Adicionar as novas colunas desnormalizadas
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS dc_correlation_id VARCHAR(255);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS dc_comentario VARCHAR(255);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS nm_usuario VARCHAR(255);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS dc_email VARCHAR(255);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS nr_celular VARCHAR(50);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS cd_armario VARCHAR(50);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS nm_tamanho VARCHAR(50);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS nm_local VARCHAR(100);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS tp_operacao VARCHAR(100);
ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS tp_plano VARCHAR(50);
