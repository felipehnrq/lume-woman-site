-- PARA EXECUÇÃO HUMANA EM AMBIENTE EXPRESSAMENTE AUTORIZADO. Não executado remotamente.
-- Não altera dados, schema, roles, policies, grants ou configuração persistente.
begin read only;
select current_database() as banco, current_user as executor,
       current_setting('server_version') as postgres;
select c.oid::regclass as tabela,c.relkind,c.relispartition,c.relrowsecurity,c.relforcerowsecurity,
       pg_get_userbyid(c.relowner) as dono,c.relacl
from pg_class c where c.oid=to_regclass('public.produtos');
select inhrelid::regclass as filha,inhparent::regclass as pai
from pg_inherits where inhrelid=to_regclass('public.produtos') or inhparent=to_regclass('public.produtos');
select a.attname,format_type(a.atttypid,a.atttypmod) as tipo,a.attnotnull,a.attgenerated,
       pg_get_expr(d.adbin,d.adrelid) as padrao,a.attacl
from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
where a.attrelid=to_regclass('public.produtos') and a.attnum>0 and not a.attisdropped order by a.attnum;
select conname,pg_get_constraintdef(oid) as definicao
from pg_constraint where conrelid=to_regclass('public.produtos');
select policyname,permissive,roles,cmd,qual,with_check
from pg_policies where schemaname='public' and tablename='produtos' order by policyname;
select r.rolname,r.rolsuper,r.rolbypassrls,r.rolinherit,
       has_table_privilege(r.oid,c.oid,'SELECT') as select_tabela,
       has_table_privilege(r.oid,c.oid,'INSERT') as insert_tabela,
       has_table_privilege(r.oid,c.oid,'UPDATE') as update_tabela,
       has_table_privilege(r.oid,c.oid,'DELETE') as delete_tabela,
       has_table_privilege(r.oid,c.oid,'TRIGGER') as cria_trigger,
       has_table_privilege(r.oid,c.oid,'TRUNCATE') as trunca_tabela
from pg_roles r cross join pg_class c
where r.rolname in ('anon','authenticated','authenticator','service_role')
  and c.oid=to_regclass('public.produtos');
select r.rolname,n.nspname,n.nspacl,
       has_schema_privilege(r.oid,n.oid,'USAGE') as usa_schema,
       has_schema_privilege(r.oid,n.oid,'CREATE') as cria_no_schema
from pg_roles r cross join pg_namespace n
where r.rolname in ('anon','authenticated') and n.nspname in ('public','private','auth');
select r.rolname,p.oid::regprocedure as funcao,has_function_privilege(r.oid,p.oid,'EXECUTE') as executa
from pg_roles r cross join pg_proc p join pg_namespace n on n.oid=p.pronamespace
where r.rolname in ('anon','authenticated')
  and ((n.nspname='private' and p.proname='is_admin') or (n.nspname='auth' and p.proname='uid'));
select member.rolname as membro,role.rolname as papel_concedido,m.admin_option
from pg_auth_members m join pg_roles member on member.oid=m.member
join pg_roles role on role.oid=m.roleid order by membro,papel_concedido;
select r.rolname,a.attname,
       has_column_privilege(r.oid,a.attrelid,a.attnum,'SELECT') as leitura,
       has_column_privilege(r.oid,a.attrelid,a.attnum,'INSERT') as insercao,
       has_column_privilege(r.oid,a.attrelid,a.attnum,'UPDATE') as alteracao
from pg_roles r cross join pg_attribute a
where r.rolname in ('anon','authenticated') and a.attrelid=to_regclass('public.produtos')
  and a.attnum>0 and not a.attisdropped order by r.rolname,a.attnum;
select t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as trigger,
       p.oid::regprocedure as funcao,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as corpo
from pg_trigger t join pg_proc p on p.oid=t.tgfoid
where t.tgrelid=to_regclass('public.produtos') and not t.tgisinternal order by t.tgname;
select n.nspname,p.proname,p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid) as corpo
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where (n.nspname='private' and p.proname='is_admin')
   or (n.nspname='auth' and p.proname='uid')
   or (n.nspname='public' and p.proname='lume_primeira_publicacao');
select rulename,pg_get_ruledef(oid,true) as regra from pg_rewrite
where ev_class=to_regclass('public.produtos');
-- Só agregados, sem nomes, códigos, fotos, preços ou registros de clientes.
-- Executar esta última consulta apenas se a tabela e publicado boolean existirem.
select count(*) as total,
       count(*) filter(where publicado is true) as publicados,
       count(*) filter(where publicado is not true) as nao_publicados
from public.produtos;
commit;
