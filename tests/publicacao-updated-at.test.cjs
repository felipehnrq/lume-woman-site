/* Modelo local do esquema informado pelo usuário; corpo remoto do trigger não foi fornecido. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync(path.join(__dirname,'../docs/novidades/proposta/primeira-publicacao.sql'),'utf8');
test('coexistência com produtos_set_updated_at, RLS e grants de tabela informados',async()=>{
 const db=await PGlite.create();
 const rows=async sql=>(await db.query(sql)).rows;
 const as=async(role,claim='')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[claim]);await db.exec(`set role ${role}`)};
 try{
  await db.exec(`
   create role anon;create role authenticated;create schema private;
   create table public.admin_users(user_id text primary key);
   insert into public.admin_users values('admin-fixture');
   create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
    select exists(select 1 from public.admin_users where user_id=current_setting('request.jwt.claim.sub',true))
   $$;
   grant usage on schema private to authenticated;
   create table public.produtos(id text primary key,publicado boolean not null default false,
    nome text default 'Teste local',created_at timestamptz not null default now(),updated_at timestamptz not null default now());
   create function private.set_updated_at() returns trigger language plpgsql set search_path='' as $$
   begin NEW.updated_at:=pg_catalog.now();return NEW;end;$$;
   create trigger produtos_set_updated_at before update on public.produtos for each row execute function private.set_updated_at();
   insert into public.produtos(id,publicado,created_at,updated_at) values('legado',true,'2000-01-01','2000-01-02');
   alter table public.produtos enable row level security;
   grant select on public.produtos to anon;
   grant select,insert,update,delete on public.produtos to authenticated;
   create policy leitura_anon on public.produtos for select to anon using(publicado);
   create policy gerencia_admin on public.produtos for all to authenticated
    using((select private.is_admin())) with check((select private.is_admin()));
  `);
  const before=await rows('select * from public.produtos');
  const acl=await rows("select relacl::text,relrowsecurity from pg_class where oid='public.produtos'::regclass");
  const policies=await rows("select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='produtos' order by policyname");
  const existingTrigger=()=>rows("select tgname,tgenabled,pg_get_triggerdef(oid) as def from pg_trigger where tgrelid='public.produtos'::regclass and tgname='produtos_set_updated_at'");
  const triggerBefore=await existingTrigger();
  const functionBefore=await rows("select pg_get_functiondef('private.set_updated_at()'::regprocedure) as def");
  await db.exec(migration);
  assert.deepEqual(await rows('select id,publicado,nome,created_at,updated_at from public.produtos'),before);
  assert.deepEqual(await rows("select relacl::text,relrowsecurity from pg_class where oid='public.produtos'::regclass"),acl);
  assert.deepEqual(await rows("select policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename='produtos' order by policyname"),policies);
  assert.deepEqual(await existingTrigger(),triggerBefore);
  assert.deepEqual(await rows("select pg_get_functiondef('private.set_updated_at()'::regprocedure) as def"),functionBefore);
  assert.deepEqual((await rows("select tgname from pg_trigger where tgrelid='public.produtos'::regclass and not tgisinternal order by tgname")).map(r=>r.tgname),['lume_primeira_publicacao','produtos_set_updated_at']);
  await as('authenticated','admin-fixture');
  await db.exec("insert into public.produtos(id,publicado,created_at) values('novo',false,'2001-01-01')");
  assert.equal((await rows("select first_published_at from public.produtos where id='novo'"))[0].first_published_at,null);
  assert.deepEqual(await rows("update public.produtos set publicado=true,first_published_at='2100-01-01',updated_at='2000-01-01' where id='novo' returning first_published_at=statement_timestamp() as first_ok,updated_at=now() as updated_ok,created_at='2001-01-01'::timestamptz as created_ok"),[{first_ok:true,updated_ok:true,created_ok:true}]);
  const first=(await rows("select first_published_at from public.produtos where id='novo'"))[0].first_published_at;
  for(const published of [false,true,true]){
   assert.deepEqual(await rows(`update public.produtos set publicado=${published},nome='Editado',first_published_at=null,publication_tracked=false,updated_at='2000-01-01' where id='novo' returning updated_at=now() as updated_ok`),[{updated_ok:true}]);
   assert.deepEqual((await rows("select first_published_at from public.produtos where id='novo'"))[0].first_published_at,first);
  }
  await db.exec("update public.produtos set publicado=false where id='legado';update public.produtos set publicado=true,first_published_at=now(),publication_tracked=true where id='legado'");
  assert.deepEqual(await rows("select first_published_at,publication_tracked from public.produtos where id='legado'"),[{first_published_at:null,publication_tracked:false}]);
  await as('anon');assert.equal((await rows("select first_published_at from public.produtos where id='novo'" )).length,1);
  await assert.rejects(db.exec("update public.produtos set first_published_at=now()"),/permission denied/);
  await as('authenticated','common-fixture');
  assert.equal((await rows("update public.produtos set first_published_at=now() returning id")).length,0);
  assert.equal((await rows("delete from public.produtos returning id")).length,0);
  await assert.rejects(db.exec("insert into public.produtos(id,publicado) values('intruso',true)"),/row-level security/);
 }finally{await db.close()}
});
