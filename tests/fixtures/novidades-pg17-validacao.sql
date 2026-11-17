select public.ensaio_assert(not exists(
 (select id,codigo,nome,publicado,categoria_id,created_at,updated_at from public.produtos except select * from private.baseline)
 union all (select * from private.baseline except select id,codigo,nome,publicado,categoria_id,created_at,updated_at from public.produtos)
),'dados legados preservados');
select public.ensaio_assert((select bool_and(first_published_at is null and not publication_tracked) from public.produtos),'legados sem datas inventadas');
select public.ensaio_assert((select b.acl=c.relacl::text and b.relrowsecurity=c.relrowsecurity
 and b.policies=(select jsonb_agg(to_jsonb(p) order by p.policyname) from pg_policies p where p.schemaname='public' and p.tablename='produtos')
 and b.updated_function=pg_get_functiondef('private.set_updated_at()'::regprocedure)
 and b.updated_trigger=(select pg_get_triggerdef(oid) from pg_trigger where tgrelid=c.oid and tgname='produtos_set_updated_at')
 from private.security_baseline b cross join pg_class c where c.oid='public.produtos'::regclass),'ACL/RLS/policies/função/trigger preservados');
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}',false);
insert into public.produtos(id,codigo,nome,publicado,first_published_at,publication_tracked) values
 ('20000000-0000-0000-0000-000000000001','NATIVE','Rascunho novo sintético',false,'2100-01-01',false);
select public.ensaio_assert((select first_published_at is null and publication_tracked from public.produtos where codigo='NATIVE'),'rascunho novo rastreado sem data');
update public.produtos set publicado=true,first_published_at='2100-01-01' where codigo='NATIVE';
select public.ensaio_assert((select first_published_at is not null and first_published_at < '2100-01-01' and updated_at >= created_at from public.produtos where codigo='NATIVE'),'publicação com horário do banco, trigger updated_at ativo');
reset role;
create table private.first_baseline as select first_published_at from public.produtos where codigo='NATIVE';
set role authenticated;
update public.produtos set nome='Editado sintético',categoria_id=2,publicado=false,first_published_at=null,publication_tracked=false where codigo='NATIVE';
update public.produtos set publicado=true,first_published_at='2100-01-01' where codigo='NATIVE';
update public.produtos set publicado=false where codigo='LEGACY';
update public.produtos set publicado=true,first_published_at=now(),publication_tracked=true where codigo in ('LEGACY','LEGACY-DRAFT');
reset role;
select public.ensaio_assert((select p.first_published_at=b.first_published_at from public.produtos p cross join private.first_baseline b where p.codigo='NATIVE'),'edição e republicação preservam primeira data');
select public.ensaio_assert((select bool_and(first_published_at is null and not publication_tracked) from public.produtos where codigo like 'LEGACY%'),'legados republicados não promovidos');
insert into public.produtos(id,codigo,nome,publicado) values('20000000-0000-0000-0000-000000000002','ROLLBACK','Rollback sintético',false);
-- Comandos enviados separadamente por psql; insert anterior já está commitado.
begin;
update public.produtos set publicado=true where codigo='ROLLBACK';
rollback;
select public.ensaio_assert((select not publicado and first_published_at is null from public.produtos where codigo='ROLLBACK'),'rollback não grava publicação');
set role anon;
select public.ensaio_assert(not exists(select 1 from public.produtos where publicado is false),'anon não vê rascunhos');
reset role;
set role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-0000-0000-000000000002","role":"authenticated"}',false);
select public.ensaio_assert(not exists(select 1 from public.produtos),'conta comum não gerencia catálogo');
reset role;
