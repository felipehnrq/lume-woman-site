-- Proposta para revisão. Nenhuma execução automática ou publicação.
-- Esquema verificado: public.admin_users e private.is_admin() já existem.
-- Aplicar somente após revisão e escolha explícita do ambiente de destino.
create table public.loja_pagamentos (
  id smallint primary key default 1 check (id = 1),
  credito_parcelas smallint not null default 3 check (credito_parcelas between 1 and 12),
  credito_sem_juros boolean not null default true,
  pix_texto text not null default '' check (char_length(pix_texto) <= 240),
  credito_texto text not null default 'parcelas a confirmar' check (char_length(credito_texto) <= 240),
  debito_texto text not null default '' check (char_length(debito_texto) <= 240),
  aviso_geral text not null default 'A loja informará o total e cada parcela antes da confirmação.'
    check (char_length(trim(aviso_geral)) between 1 and 240)
);

alter table public.loja_pagamentos enable row level security;

-- Privilégios explícitos: nenhuma inserção ou exclusão pelo navegador.
revoke all on public.loja_pagamentos from public, anon, authenticated;
grant select on public.loja_pagamentos to anon, authenticated;
grant update (credito_parcelas, credito_sem_juros, pix_texto, credito_texto, debito_texto, aviso_geral)
  on public.loja_pagamentos to authenticated;

create policy "pagamentos: leitura publica" on public.loja_pagamentos
  for select to anon, authenticated using (true);

create policy "pagamentos: somente admin edita" on public.loja_pagamentos
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

insert into public.loja_pagamentos (id) values (1);
