-- SOMENTE LEITURA. Operador autorizado após aplicar a proposta e antes de ativar a flag.
-- Só é válido imediatamente após migração, com escritas da aplicação pausadas.
begin read only;
select current_setting('server_version') as postgres;
select count(*) as total,
       count(*) filter(where not publication_tracked) as legados,
       count(*) filter(where publication_tracked) as novos_rastreados,
       count(*) filter(where not publication_tracked and first_published_at is not null) as legados_com_data_indevida,
       count(*) filter(where first_published_at is not null and not isfinite(first_published_at)) as datas_nao_finitas
from public.produtos;
select a.attname,format_type(a.atttypid,a.atttypmod) as tipo,a.attnotnull,pg_get_expr(d.adbin,d.adrelid) as padrao
from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid='public.produtos'::regclass and a.attname in ('first_published_at','publication_tracked');
select tgname,tgenabled,pg_get_triggerdef(oid,true) as definicao from pg_trigger
where tgrelid='public.produtos'::regclass and not tgisinternal order by tgname;
select p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as definicao
from pg_proc p where p.oid='public.lume_primeira_publicacao()'::regprocedure;
select conname,convalidated,pg_get_constraintdef(oid) as definicao from pg_constraint
where conrelid='public.produtos'::regclass and conname='lume_publicacao_coerente';
select r.rolname,
       has_column_privilege(r.oid,'public.produtos','id','SELECT') as le_id,
       has_column_privilege(r.oid,'public.produtos','publicado','SELECT') as le_publicado,
       has_column_privilege(r.oid,'public.produtos','first_published_at','SELECT') as le_primeira_publicacao
from pg_roles r where r.rolname in ('anon','authenticated');
commit;
