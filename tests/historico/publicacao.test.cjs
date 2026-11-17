const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
test('proposta SQL registra primeira publicação, preserva republicação e não inventa histórico legado',async()=>{
 const sqlPath=path.join(__dirname,'../../docs/novidades/proposta/primeira-publicacao.sql');
 assert.ok(fs.existsSync(sqlPath),'proposta SQL deve existir');
 const db=await PGlite.create();
 try{
  await db.exec('create table public.produtos(id text primary key, publicado boolean not null default false, categoria_id int); insert into public.produtos values (\'legado\',true,1), (\'rascunho-legado\',false,1)');
  await db.exec('alter table public.produtos enable row level security');
  await db.exec(fs.readFileSync(sqlPath,'utf8'));
  const row=async id=>(await db.query('select * from public.produtos where id=$1',[id])).rows[0];
  await db.exec("update public.produtos set publicado=false where id='legado'; update public.produtos set publicado=true, first_published_at=now(), publication_tracked=true where id in ('legado','rascunho-legado')");
  assert.equal((await row('legado')).first_published_at,null);assert.equal((await row('rascunho-legado')).first_published_at,null);
  await db.exec("insert into public.produtos(id,publicado,first_published_at,publication_tracked) values ('novo',false,now(),false)");
  assert.equal((await row('novo')).first_published_at,null);
  await db.exec("update public.produtos set publicado=true where id='novo'");
  const first=(await row('novo')).first_published_at;assert.ok(first);
  await db.exec("update public.produtos set publicado=false,categoria_id=2,first_published_at=null,publication_tracked=false where id='novo'; update public.produtos set publicado=true,first_published_at='2000-01-01' where id='novo'");
  assert.deepEqual((await row('novo')).first_published_at,first);
  await db.exec("insert into public.produtos(id,publicado,first_published_at) values ('direto',true,'2000-01-01')");
  assert.ok((await row('direto')).first_published_at>new Date('2026-01-01'));
 }finally{await db.close()}
});

test('migração recusa tabela sem RLS e não deixa alteração parcial',async()=>{
 const db=await PGlite.create();
 try{
  await db.exec('create table public.produtos(id text primary key, publicado boolean)');
  await assert.rejects(db.exec(fs.readFileSync(path.join(__dirname,'../../docs/novidades/proposta/primeira-publicacao.sql'),'utf8')),/RLS/);
  await db.exec('rollback');
  assert.equal((await db.query("select count(*)::int as n from information_schema.columns where table_schema='public' and table_name='produtos' and column_name='first_published_at'")).rows[0].n,0);
 }finally{await db.close()}
});
