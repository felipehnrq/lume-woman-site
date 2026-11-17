-- PROPOSTA NÃO APLICADA. Revisar esquema real, triggers e permissões antes de promover.
-- Mantida FORA de supabase/migrations: não executar automaticamente.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';
-- O lock mantém a fronteira entre linhas legadas e cadastros novos até o commit.
lock table only public.produtos in access exclusive mode;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_class c
    where c.oid = 'public.produtos'::regclass and c.relkind = 'r'
      and not c.relispartition and c.relrowsecurity
  ) then
    raise exception 'Pré-requisito: produtos deve ser tabela comum, não particionada, com RLS habilitada';
  end if;
  if exists (
    select 1 from pg_catalog.pg_inherits
    where inhrelid = 'public.produtos'::regclass or inhparent = 'public.produtos'::regclass
  ) then
    raise exception 'Pré-requisito: produtos não pode participar de herança de tabelas';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_attribute a
    where a.attrelid = 'public.produtos'::regclass and a.attname = 'publicado'
      and a.atttypid = 'boolean'::regtype and not a.attisdropped and a.attgenerated = ''
  ) then
    raise exception 'Pré-requisito: produtos.publicado deve ser boolean editável';
  end if;
end;
$$;
-- Sem IF NOT EXISTS: conflito de nomes deve abortar, nunca assumir contrato compatível.
alter table public.produtos add column first_published_at timestamptz;
-- DEFAULT false nesta etapa marca todos os registros existentes como histórico desconhecido.
alter table public.produtos add column publication_tracked boolean not null default false;
alter table public.produtos alter column publication_tracked set default true;
alter table public.produtos add constraint lume_publicacao_coerente
  check (first_published_at is null or (publication_tracked and pg_catalog.isfinite(first_published_at)));
comment on column public.produtos.first_published_at is
  'Primeira publicação rastreada pelo banco. NULL significa histórico desconhecido ou ainda não publicado; nunca inferir por created_at.';
comment on column public.produtos.publication_tracked is
  'Marcador controlado por trigger. Legados permanecem false; novos cadastros true, inclusive rascunhos.';
-- Nenhum GRANT, REVOKE, CREATE POLICY ou alteração de RLS nesta proposta.
create function public.lume_primeira_publicacao() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.publication_tracked := true;
    NEW.first_published_at := case when NEW.publicado is true then pg_catalog.statement_timestamp() else null end;
  else
    NEW.publication_tracked := OLD.publication_tracked;
    NEW.first_published_at := OLD.first_published_at;
    if OLD.publication_tracked and OLD.first_published_at is null
       and OLD.publicado is not true and NEW.publicado is true then
      NEW.first_published_at := pg_catalog.statement_timestamp();
    end if;
  end if;
  return NEW;
end;
$$;
create trigger lume_primeira_publicacao before insert or update on public.produtos
for each row execute function public.lume_primeira_publicacao();
commit;
