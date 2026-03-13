-- Execute este SQL no painel de controle do Supabase (SQL Editor)

CREATE TABLE IF NOT EXISTS public.t_fcm_tokens (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ativar RLS
ALTER TABLE public.t_fcm_tokens ENABLE ROW LEVEL SECURITY;

-- Permitir que usuários insiram seus próprios tokens
CREATE POLICY "Users can insert their own tokens" 
ON public.t_fcm_tokens FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Permitir que usuários vejam seus próprios tokens
CREATE POLICY "Users can view their own tokens" 
ON public.t_fcm_tokens FOR SELECT 
USING (auth.uid() = user_id);

-- Permitir que usuários atualizem seus próprios tokens
CREATE POLICY "Users can update their own tokens" 
ON public.t_fcm_tokens FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger para atualizar o updated_at
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
