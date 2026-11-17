/* Contrato sintético: não é uma cópia nem uma conexão com o banco remoto. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../docs/novidades/proposta/primeira-publicacao.sql'),'utf8');
const admin='00000000-0000-0000-0000-000000000001';
const common='00000000-0000-0000-0000-000000000002';
async function fixture(){
 const db=await PGlite.create();
 await db.exec(`
  create role anon;
  create role authenticated;
  create schema auth;
  create schema private;
  create function auth.uid() returns uuid language sql stable as $$
   select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
  $$;
  create table public.admin_users(user_id uuid primary key);
  insert into public.admin_users values ('${admin}');
  alter table public.admin_users enable row level security;
  grant select on public.admin_users to authenticated;
  create policy self_read on public.admin_users for select to authenticated using(user_id=(select auth.uid()));
  create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
   select exists(select 1 from public.admin_users where user_id=(select auth.uid()))
  $$;
  grant usage on schema auth,private to authenticated;
  create table public.produtos(
   id text primary key,codigo text,nome text not null default 'Peça sintética',
   publicado boolean not null default false,categoria_id integer default 1,
   created_at timestamptz not null default statement_timestamp()
  );
  create function public.fixture_codigo() returns trigger language plpgsql as $$
  begin NEW.codigo:=coalesce(NEW.codigo,'LW-'||NEW.id);return NEW;end;$$;
  create trigger fixture_codigo before insert on public.produtos for each row execute function public.fixture_codigo();
  insert into public.produtos(id,publicado,created_at) values
   ('legacy-live',true,'2000-01-01'),('legacy-draft',false,'2000-01-02');
  alter table public.produtos enable row level security;
  grant select on public.produtos to anon,authenticated;
  grant insert(id,codigo,nome,publicado,categoria_id),update(nome,publicado,categoria_id) on public.produtos to authenticated;
  create policy public_read on public.produtos for select to anon,authenticated using(publicado);
  create policy admin_write on public.produtos for all to authenticated
   using((select private.is_admin())) with check((select private.is_admin()));
 `);
 return db;
}
test('primeira publicação sob RLS e privilégios reais de papéis locais',async t=>{
 const db=await fixture();
 const rows=async sql=>(await db.query(sql)).rows;
 const owner=()=>db.exec('reset role');
 const role=async(name,sub='')=>{await owner();await db.query("select set_config('request.jwt.claim.sub',$1,false)",[sub]);await db.exec(`set role ${name}`)};
 const snapshot=()=>rows(`select c.relrowsecurity,c.relforcerowsecurity,c.relacl::text,
  (select jsonb_agg(jsonb_build_object('name',p.polname,'cmd',p.polcmd,'qual',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname) from pg_policy p where p.polrelid=c.oid) policies
  from pg_class c where c.oid='public.produtos'::regclass`);
 try{
  const original=await rows('select id,codigo,nome,publicado,categoria_id,created_at from public.produtos order by id');
  const security=await snapshot();
  await db.exec(migration);
  await t.test('DDL preserva dados antigos, RLS, policies e ACLs',async()=>{
   assert.deepEqual(await rows('select id,codigo,nome,publicado,categoria_id,created_at from public.produtos order by id'),original);
   assert.deepEqual(await snapshot(),security);
   assert.deepEqual(await rows('select distinct first_published_at,publication_tracked from public.produtos'),[{first_published_at:null,publication_tracked:false}]);
  });
  await t.test('anon lê somente publicados e não grava',async()=>{
   await role('anon');
   assert.deepEqual(await rows('select id,first_published_at from public.produtos order by id'),[{id:'legacy-live',first_published_at:null}]);
   await assert.rejects(db.exec("update public.produtos set publicado=true"),/permission denied/);
   await assert.rejects(db.exec("insert into public.produtos(id) values('anon')"),/permission denied/);
   await assert.rejects(db.exec('delete from public.produtos'),/permission denied/);
  });
  await t.test('conta comum não publica, não insere e não lê rascunho',async()=>{
   await role('authenticated',common);
   assert.equal((await rows("select id from public.produtos where id='legacy-draft'")).length,0);
   assert.equal((await rows("update public.produtos set publicado=true where id='legacy-draft' returning id")).length,0);
   assert.equal((await rows("update public.produtos set nome='Intrusão' where id='legacy-live' returning id")).length,0);
   await assert.rejects(db.exec("insert into public.produtos(id,publicado) values('common',true)"),/row-level security/);
  });
  await t.test('rascunho novo permanece sem data até primeira publicação pelo painel',async()=>{
   await role('authenticated',admin);
   await db.exec("insert into public.produtos(id,publicado) values('draft',false)");
   assert.deepEqual(await rows("select first_published_at,publication_tracked,codigo from public.produtos where id='draft'"),[{first_published_at:null,publication_tracked:true,codigo:'LW-draft'}]);
   await db.exec("update public.produtos set nome='Rascunho editado',categoria_id=2 where id='draft'");
   assert.equal((await rows("select first_published_at from public.produtos where id='draft'"))[0].first_published_at,null);
   assert.deepEqual(await rows("update public.produtos set publicado=true where id='draft' returning first_published_at=statement_timestamp() as server_time"),[{server_time:true}]);
  });
  let first;
  await t.test('edição, despublicação e republicação não reiniciam janela',async()=>{
   first=(await rows("select first_published_at from public.produtos where id='draft'"))[0].first_published_at;
   await db.exec("update public.produtos set categoria_id=1,nome='Editado',publicado=false where id='draft'");
   assert.deepEqual((await rows("select first_published_at from public.produtos where id='draft'"))[0].first_published_at,first);
   await role('anon');assert.equal((await rows("select id,first_published_at from public.produtos where id='draft'")).length,0);
   await role('authenticated',admin);await db.exec("update public.produtos set publicado=true where id='draft'");
   assert.deepEqual((await rows("select first_published_at from public.produtos where id='draft'"))[0].first_published_at,first);
   await role('anon');assert.deepEqual((await rows("select first_published_at from public.produtos where id='draft'"))[0].first_published_at,first);
  });
  await t.test('grants por coluna impedem cliente de enviar campos controlados',async()=>{
   await role('authenticated',admin);
   await assert.rejects(db.exec("update public.produtos set first_published_at='2100-01-01' where id='draft'"),/permission denied/);
   await assert.rejects(db.exec("insert into public.produtos(id,publicado,first_published_at) values('forged',true,'2000-01-01')"),/permission denied/);
  });
  await t.test('mesmo com grant amplo trigger neutraliza datas forjadas e marcador',async()=>{
   await owner();await db.exec('grant insert,update on public.produtos to authenticated');
   await role('authenticated',admin);
   await db.exec("update public.produtos set first_published_at='2100-01-01',publication_tracked=false where id='draft'");
   assert.deepEqual((await rows("select first_published_at from public.produtos where id='draft'"))[0].first_published_at,first);
   await db.exec("update public.produtos set first_published_at=null where id='draft'");
   assert.deepEqual((await rows("select first_published_at from public.produtos where id='draft'"))[0].first_published_at,first);
   await db.exec("insert into public.produtos(id,publicado,first_published_at,publication_tracked) values('forged-draft',false,'2100-01-01',false)");
   assert.deepEqual(await rows("select first_published_at,publication_tracked from public.produtos where id='forged-draft'"),[{first_published_at:null,publication_tracked:true}]);
   assert.deepEqual(await rows("insert into public.produtos(id,publicado,first_published_at) values('direct',true,'2000-01-01') returning first_published_at=statement_timestamp() as server_time"),[{server_time:true}]);
  });
  await t.test('rascunho legado e republicação de legado nunca inventam primeira data',async()=>{
   await db.exec("update public.produtos set publicado=false where id='legacy-live';update public.produtos set publicado=true,first_published_at=now(),publication_tracked=true where id in ('legacy-live','legacy-draft')");
   assert.deepEqual(await rows("select distinct first_published_at,publication_tracked from public.produtos where id like 'legacy-%'"),[{first_published_at:null,publication_tracked:false}]);
  });
  await t.test('upsert não reinicia primeira publicação nem promove legado',async()=>{
   await db.exec("insert into public.produtos(id,publicado) values('draft',true) on conflict(id) do update set publicado=excluded.publicado,first_published_at=excluded.first_published_at,publication_tracked=excluded.publication_tracked");
   assert.deepEqual((await rows("select first_published_at from public.produtos where id='draft'"))[0].first_published_at,first);
   await db.exec("insert into public.produtos(id,publicado) values('legacy-live',true) on conflict(id) do update set first_published_at=excluded.first_published_at,publication_tracked=excluded.publication_tracked");
   assert.equal((await rows("select first_published_at from public.produtos where id='legacy-live'"))[0].first_published_at,null);
  });
  await t.test('rollback de publicação não deixa data; revogação de admin vale imediatamente',async()=>{
   await db.exec("insert into public.produtos(id,publicado) values('rollback',false)");
   await db.exec("begin;update public.produtos set publicado=true where id='rollback';rollback");
   assert.deepEqual(await rows("select publicado,first_published_at from public.produtos where id='rollback'"),[{publicado:false,first_published_at:null}]);
   await owner();await db.exec('delete from public.admin_users');await role('authenticated',admin);
   assert.equal((await rows("update public.produtos set publicado=true where id='rollback' returning id")).length,0);
   await assert.rejects(db.exec("insert into public.produtos(id) values('removed-admin')"),/row-level security/);
  });

 }finally{await db.close()}
});

test('tipo incompatível aborta migração atomicamente',async()=>{
 const db=await PGlite.create();
 try{
  await db.exec('create table public.produtos(id text primary key,publicado text);alter table public.produtos enable row level security');
  await assert.rejects(db.exec(migration),/boolean editável/);await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='produtos' and column_name='first_published_at'")).rows[0].n,0);
 }finally{await db.close()}
});

test('migração mantém grants estreitos; leitura da nova coluna exige revisão separada',async()=>{
 const db=await fixture();
 try{
  await db.exec('revoke select on public.produtos from anon;grant select(id,publicado) on public.produtos to anon');
  const acl=(await db.query("select relacl::text from pg_class where oid='public.produtos'::regclass")).rows;
  await db.exec(migration);
  assert.deepEqual((await db.query("select relacl::text from pg_class where oid='public.produtos'::regclass")).rows,acl);
  await db.exec('set role anon');
  assert.equal((await db.query('select id from public.produtos')).rows.length,1);
  await assert.rejects(db.exec('select id,first_published_at from public.produtos'),/permission denied/);
 }finally{await db.close()}
});

test('reexecução e conflito de função abortam sem redefinir contrato existente',async()=>{
 const db=await fixture();
 try{
  await db.exec("create function public.lume_primeira_publicacao() returns trigger language plpgsql as $$begin return NEW;end;$$");
  await assert.rejects(db.exec(migration),/already exists/);await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='produtos' and column_name='first_published_at'")).rows[0].n,0);
  await db.exec('drop function public.lume_primeira_publicacao()');await db.exec(migration);
  await assert.rejects(db.exec(migration),/already exists/);await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int n from public.produtos where first_published_at is null and publication_tracked=false")).rows[0].n,2);
 }finally{await db.close()}
});

test('scripts de inspeção e validação executam em READ ONLY sem alterar dados ou permissões',async()=>{
 const db=await fixture();
 const inspect=fs.readFileSync(path.join(__dirname,'../docs/novidades/proposta/inspecao-somente-leitura.sql'),'utf8');
 const validate=fs.readFileSync(path.join(__dirname,'../docs/novidades/proposta/validacao-pos-migracao.sql'),'utf8');
 const security=()=>db.query("select relrowsecurity,relacl::text from pg_class where oid='public.produtos'::regclass");
 try{
  const beforeData=(await db.query('select * from public.produtos order by id')).rows;
  const beforeACL=(await security()).rows;
  await db.exec(inspect);
  assert.deepEqual((await db.query('select * from public.produtos order by id')).rows,beforeData);
  await db.exec(migration);
  const afterData=(await db.query('select * from public.produtos order by id')).rows;
  await db.exec(validate);await db.exec(inspect);
  assert.deepEqual((await db.query('select * from public.produtos order by id')).rows,afterData);
  assert.deepEqual((await security()).rows,beforeACL);
 }finally{await db.close()}
});

for(const relation of ['parent','child'])test(`herança clássica (${relation}) aborta sem alterar tabela ou descendentes`,async()=>{
 const db=await PGlite.create();
 try{
  if(relation==='parent')await db.exec('create table public.produtos(id text,publicado boolean);create table public.filho() inherits(public.produtos)');
  else await db.exec('create table public.base(id text,publicado boolean);create table public.produtos() inherits(public.base)');
  await db.exec('alter table public.produtos enable row level security');
  await assert.rejects(db.exec(migration),/herança/);await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and column_name in ('first_published_at','publication_tracked')")).rows[0].n,0);
 }finally{await db.close()}
});

for(const relation of ['parent','child'])test(`particionamento (${relation}) exige desenho separado`,async()=>{
 const db=await PGlite.create();
 try{
  if(relation==='parent')await db.exec('create table public.produtos(id int,publicado boolean) partition by range(id);create table public.filho partition of public.produtos for values from(0) to(10)');
  else await db.exec('create table public.base(id int,publicado boolean) partition by range(id);create table public.produtos partition of public.base for values from(0) to(10)');
  await db.exec('alter table public.produtos enable row level security');
  await assert.rejects(db.exec(migration),/não particionada/);await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_schema='public' and column_name in ('first_published_at','publication_tracked')")).rows[0].n,0);
 }finally{await db.close()}
});
