-- Continuação da configuração de pagamentos; não altera os métodos existentes.
-- Os três meios permanecem visíveis por padrão. Nenhuma publicação automática.
alter table public.loja_pagamentos
  add column pix_ativo boolean not null default true,
  add column credito_ativo boolean not null default true,
  add column debito_ativo boolean not null default true;

-- A política administrativa da migração anterior protege também estes campos.
grant update (pix_ativo, credito_ativo, debito_ativo)
  on public.loja_pagamentos to authenticated;
