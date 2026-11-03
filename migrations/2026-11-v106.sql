-- Execute no SQL Editor do Supabase APENAS depois de revisar as políticas existentes.
-- Colunas opcionais: preservam os valores e as permissões da tabela loja_tema.
alter table public.loja_tema add column if not exists banner_zoom integer not null default 100;
alter table public.loja_tema add column if not exists banner_x integer not null default 50;
alter table public.loja_tema add column if not exists banner_y integer not null default 50;
alter table public.loja_tema add column if not exists sobre_titulo text not null default 'Conheça a Lume Woman';
alter table public.loja_tema add column if not exists sobre_texto text not null default 'Uma loja de moda feminina com curadoria e atendimento próximo.';
alter table public.loja_tema add column if not exists sobre_foto_caminho text;
alter table public.loja_tema add column if not exists depoimentos jsonb not null default '[]'::jsonb;
