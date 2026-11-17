const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const policyPath=require('node:path').join(__dirname,'../catalogo-politica.js');
const policy=()=>{assert.ok(fs.existsSync(policyPath),'política de catálogo deve existir');return require(policyPath);};
const now=Date.parse('2026-11-17T12:00:00Z'), day=86400000;
const row=(id,age=0)=>({id,publicado:true,created_at:new Date(now-age).toISOString()});
test('novidade dura exatamente sete períodos de 24h, sem datas futuras',()=>{
 const {isNew}=policy();
 for(const [age,expected] of [[0,true],[7*day-1,true],[7*day,false],[7*day+1,false],[-1,false]])assert.equal(isNew(row('a',age),now),expected,`idade ${age}`);
});
test('exige data de cadastro válida e não reabre prazo ao mudar categoria',()=>{
 const {isNew}=policy();
 for(const date of [undefined,null,'','invalid','2026-11-17','2026-11-17T11:00:00',123])assert.equal(isNew({...row('a'),created_at:date},now),false);
 assert.equal(isNew({...row('a'),publicado:false},now),false);
 assert.equal(isNew({...row('a',8*day),categoria:'Social'},now),false);
 assert.equal(isNew({...row('a',day),categoria:'Social'},now),true);
 assert.deepEqual(policy().newProducts([],now),[]);
});
test('catálogo ordena cadastro desc, data desconhecida por último e id asc nos empates sem mutar origem',()=>{
 const input=[{id:'z'},row('b',day),row('c'),row('a',day),{id:'y',created_at:'invalid'}];
 assert.deepEqual(policy().sortProducts(input).map(p=>p.id),['c','a','b','y','z']);
 assert.equal(input[0].id,'z');
});
test('novidades usam somente cadastro e excluem despublicados',()=>{
 const input=[row('b',day),{...row('old',8*day),first_published_at:new Date(now).toISOString()},row('a'),{...row('off'),publicado:false}];
 assert.deepEqual(policy().newProducts(input,now).map(p=>p.id),['a','b']);
});
async function load({failPage=false,cap=500,noRange=false,noPhotos=false}={}){
 const calls=[];
 const rows=Array.from({length:501},(_,i)=>({...row(String(i).padStart(3,'0'),i*1000),codigo:`LW-${i}`,nome:`Peça ${i}`,preco:10,categoria_id:1}));
 const context={window:{LUME_SUPABASE:{url:'https://example.supabase.co',publishableKey:'sb_publishable_test'},LumeCatalogPolicy:policy()},URLSearchParams,AbortSignal,fetch:async(endpoint,options)=>{
  const url=new URL(endpoint),table=url.pathname.split('/').pop(),params=url.searchParams;
  calls.push({table,params,options});
  if(table==='produto_imagens'){
   const photos=noPhotos?[]:rows.map(p=>({produto_id:p.id,caminho:`teste/${p.id}.jpg`,ordem:0}));
   const offset=Number(params.get('offset'));
   const page=photos.slice(offset,offset+Number(params.get('limit')));
   return {ok:true,headers:{get:()=>page.length?`${offset}-${offset+page.length-1}/${photos.length}`:`*/${photos.length}`},json:async()=>page};
  }
  if(table==='produtos'){
   const offset=Number(params.get('offset')||0);
   if(offset&&failPage)return {ok:false,status:503};
   return {ok:true,headers:{get:()=>noRange?null:`${offset}-${Math.min(offset+cap,rows.length)-1}/${rows.length}`},json:async()=>rows.slice(offset,offset+Math.min(cap,Number(params.get('limit')||1000)))};
  }
  return {ok:true,headers:{get:()=>table==='categorias'?'0-0/1':'*/0'},json:async()=>table==='categorias'?[{id:1,nome:'Casual'}]:[]};
 }};
 vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../catalogo-supabase.js'),'utf8'),context);
 return {result:await context.window.LUME_CATALOG_READY,calls};
}
test('loader pagina todas as relações e usa ordem total; usa apenas o cadastro para novidades',async()=>{
 const {result,calls}=await load();assert.ifError(result.error);assert.equal(result.data.length,501);
 assert.equal(result.data[0].id,'LW-0');assert.equal(result.data[0].created_at,'2026-11-17T12:00:00.000Z');
 assert.equal(policy().newProducts(result.data,now).length,501);
 assert.equal(calls.filter(c=>c.table==='produtos').length,2);
 const columns=calls[0].params.get('select').split(',');
 assert.ok(columns.includes('created_at'));
 assert.ok(!columns.includes('first_published_at'));
 assert.equal(calls[0].params.get('order'),'created_at.desc.nullslast,id.asc');
 assert.ok(calls.every(c=>c.options.method==='GET'));
});
test('vitrine não exibe produtos publicados sem fotografia cadastrada',async()=>{
 const {result}=await load({noPhotos:true});assert.ifError(result.error);assert.equal(result.data.length,0);
});
test('página obrigatória incompleta rejeita catálogo',async()=>{
 assert.ok((await load({failPage:true})).result.error);
});

test('rejeita dias inexistentes que Date.parse normaliza',()=>{
 assert.equal(policy().isNew({...row('a'),created_at:'2026-02-30T12:00:00Z'},Date.parse('2026-03-02T12:00:00Z')),false);
});

test('limite imposto pela API menor que a página solicitada não trunca catálogo',async()=>{
 const {result}=await load({cap:200});assert.ifError(result.error);assert.equal(result.data.length,501);
});

test('sem Content-Range avança por quantidade efetiva até página vazia',async()=>{
 const {result}=await load({cap:200,noRange:true});assert.ifError(result.error);assert.equal(result.data.length,501);
});
