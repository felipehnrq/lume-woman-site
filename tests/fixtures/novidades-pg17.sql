-- Esquema sanitizado equivalente ao contrato informado; não é dump integral do Supabase.
create role anon nologin;
create role authenticated nologin;
create role authenticator login noinherit;
grant anon,authenticated to authenticator;
create schema auth;
create schema private;
create function auth.uid() returns uuid language sql stable as $$
 select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid
$$;
create table public.admin_users(user_id uuid primary key);
insert into public.admin_users values('00000000-0000-0000-0000-000000000001');
alter table public.admin_users enable row level security;
grant select on public.admin_users to authenticated;
create policy self_read on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.admin_users where user_id=(select auth.uid()))
$$;
grant usage on schema private,auth to authenticated;
create table public.produtos(
 id uuid primary key default gen_random_uuid(),codigo text unique not null,nome text not null,
 publicado boolean not null default false,categoria_id integer default 1,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create function private.set_updated_at() returns trigger language plpgsql security invoker set search_path='' as $$
begin NEW.updated_at = now(); RETURN NEW; end;$$;
create trigger produtos_set_updated_at before update on public.produtos for each row execute function private.set_updated_at();
insert into public.produtos(id,codigo,nome,publicado,created_at,updated_at) values
 ('10000000-0000-0000-0000-000000000001','LEGACY','Legado sintético',true,'2000-01-01','2000-01-02'),
 ('10000000-0000-0000-0000-000000000002','LEGACY-DRAFT','Rascunho legado sintético',false,'2000-01-01','2000-01-02');
alter table public.produtos enable row level security;
grant select on public.produtos to anon;
grant select,insert,update,delete on public.produtos to authenticated;
create policy leitura_anon on public.produtos for select to anon using(publicado);
create policy gerencia_admin on public.produtos for all to authenticated
 using((select private.is_admin())) with check((select private.is_admin()));
create table private.baseline as select * from public.produtos;
create table private.security_baseline as
 select c.relacl::text as acl,c.relrowsecurity,
 (select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename='produtos') as policies,
 pg_get_functiondef('private.set_updated_at()'::regprocedure) as updated_function,
 (select pg_get_triggerdef(oid) from pg_trigger where tgrelid=c.oid and tgname='produtos_set_updated_at') as updated_trigger
 from pg_class c where c.oid='public.produtos'::regclass;
create function public.ensaio_assert(ok boolean,message text) returns void language plpgsql as $$
begin if ok is not true then raise exception 'Ensaio: %',message;end if;end;$$;
