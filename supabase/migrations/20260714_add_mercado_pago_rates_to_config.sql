-- Migration: Add Mercado Pago rates columns to t_configuracao
-- Description: Adds simplified columns to t_configuracao to store dynamic rates for Pix, Boleto, and Credit Card

ALTER TABLE t_configuracao 
ADD COLUMN IF NOT EXISTS mp_pix_fee NUMERIC DEFAULT 0.99,
ADD COLUMN IF NOT EXISTS mp_boleto_fee NUMERIC DEFAULT 3.49,
ADD COLUMN IF NOT EXISTS mp_card_fee NUMERIC DEFAULT 4.98;

COMMENT ON COLUMN t_configuracao.mp_pix_fee IS 'Taxa de transação para pagamentos via Pix (%)';
COMMENT ON COLUMN t_configuracao.mp_boleto_fee IS 'Taxa fixa por boleto pago (R$)';
COMMENT ON COLUMN t_configuracao.mp_card_fee IS 'Taxa de cartão de crédito à vista para liberação na hora D+0 (%)';
