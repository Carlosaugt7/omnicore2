-- ================================================================
-- OmniCore — Migration: Campo de Usuário do Cliente no Painel Externo
-- Data: 2026-11-27
-- ================================================================

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS panel_username text;
