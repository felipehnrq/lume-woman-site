-- PROPOSTA NÃO APLICADA. Revisar esquema real, triggers e permissões antes de promover.
-- Mantida FORA de supabase/migrations: não executar automaticamente.
begin;
alter table public.produtos add column first_published_at timestamptz;
-- DEFAULT false nesta etapa marca todos os registros existentes como histórico desconhecido.
alter table public.produtos add column publication_tracked boolean not null default false;
alter table public.produtos alter column publication_tracked set default true;
create function public.lume_primeira_publicacao() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    NEW.publication_tracked := true;
    NEW.first_published_at := case when NEW.publicado is true then statement_timestamp() else null end;
  else
    NEW.publication_tracked := OLD.publication_tracked;
    NEW.first_published_at := OLD.first_published_at;
    if OLD.publication_tracked and OLD.first_published_at is null
       and OLD.publicado is not true and NEW.publicado is true then
      NEW.first_published_at := statement_timestamp();
    end if;
  end if;
  return NEW;
end;
$$;
create trigger lume_primeira_publicacao before insert or update on public.produtos
for each row execute function public.lume_primeira_publicacao();
commit;
