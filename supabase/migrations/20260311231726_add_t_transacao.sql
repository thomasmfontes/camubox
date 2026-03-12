-- Migration: Adicionar tabela de transações para integração com Woovi
-- Descrição: Cria a tabela t_transacao e ajusta os enums se necessário.

-- Criar tipo Enum para o status da transação se não existir
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transacao_status') THEN
        CREATE TYPE transacao_status AS ENUM ('AGUARDANDO_PAGAMENTO', 'CONCLUIDO', 'EXPIRADO', 'CANCELADO');
    END IF;
END $$;

-- Criar a tabela t_transacao
CREATE TABLE IF NOT EXISTS public.t_transacao (
    id_transacao UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    id_locacao UUID NOT NULL REFERENCES public.t_locacao(id_locacao) ON DELETE CASCADE,
    id_woovi_charge VARCHAR(255) UNIQUE,
    vl_transacao NUMERIC(10, 2) NOT NULL,
    dc_status transacao_status DEFAULT 'AGUARDANDO_PAGAMENTO',
    dt_criacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    dt_pagamento TIMESTAMP WITH TIME ZONE,
    payload_webhook JSONB
);

-- Criar índices para busca rápida pelo charge ID da Woovi e pela locação
CREATE INDEX IF NOT EXISTS idx_transacao_woovi_charge ON public.t_transacao(id_woovi_charge);
CREATE INDEX IF NOT EXISTS idx_transacao_locacao ON public.t_transacao(id_locacao);

-- Ajustar políticas de RLS para t_transacao
ALTER TABLE public.t_transacao ENABLE ROW LEVEL SECURITY;

-- Permitir que a role authenticated (e functions) possam inserir transações
CREATE POLICY "Enable insert for authenticated users" ON public.t_transacao
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Permitir que o aluno acesse suas próprias transações através do join com locacao
CREATE POLICY "Enable read for users based on rental" ON public.t_transacao
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.t_locacao
            WHERE t_locacao.id_locacao = t_transacao.id_locacao
            AND t_locacao.id_usuario = auth.uid()
        )
    );

-- Permitir update pelo webhook (anônimo ou via service_role -> service role bypassa RLS, então não precisa de política específica pra ele)

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.dt_atualizacao = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

ALTER TABLE public.t_transacao ADD COLUMN IF NOT EXISTS dt_atualizacao TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

CREATE TRIGGER set_timestamp_t_transacao
BEFORE UPDATE ON public.t_transacao
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
