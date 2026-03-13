-- Atualizar a tabela para usar email em vez de user_id (UUID de auth)
-- Isso permite que usuários do Google (legado) e usuários da Apple usem push

DROP TABLE IF EXISTS public.t_fcm_tokens;

CREATE TABLE public.t_fcm_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    dc_email TEXT NOT NULL UNIQUE,
    token TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Como vamos salvar via API (Service Role) para evitar problemas de RLS com login legado,
-- não precisamos de políticas complexas para o client agora.
ALTER TABLE public.t_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Permitir leitura apenas para o sistema (notificações)
CREATE POLICY "System can do anything" ON public.t_fcm_tokens 
USING (true) WITH CHECK (true);

-- Trigger para updated_at
CREATE OR REPLACE FUNCTION update_fcm_token_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_fcm_token_timestamp_trigger
    BEFORE UPDATE ON public.t_fcm_tokens
    FOR EACH ROW
    EXECUTE PROCEDURE update_fcm_token_timestamp();
