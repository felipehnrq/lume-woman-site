/* Ensaio opcional isolado: Node + Docker local, sem credenciais ou dados reais. */
const {execFileSync,spawn}=require('node:child_process');
const {readFileSync,writeFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');
const {randomUUID,randomBytes,createHmac}=require('node:crypto');
const assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const images={postgres:'postgres:17.11@sha256:ff87138949ad9a46f32ff23bd6852b52ce024a13dffe9b4087be98292cdd3b4f',postgrest:'postgrest/postgrest:v12.2.3@sha256:729bf65c733b73f5b52777f0e4b853f22ed73aa67a22d38269d289779b0a8401'};
const prefix=`lume-ensaio-${randomUUID().slice(0,8)}`;
const network=`${prefix}-net`,pg=`${prefix}-pg`,rest=`${prefix}-rest`;
const created=[];
const report={images,checks:[],started_at:new Date().toISOString()};
const evidence=process.env.LUME_PG17_EVIDENCE_DIR||'/workspace/lume-ensaio17-evidence';
const docker=(args,input)=>{
 try{return execFileSync('docker',args,{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:4*1024*1024}).trim();}
 catch(e){throw new Error(`Docker ${args[0]} falhou: ${String(e.stderr||'').slice(0,1500)}`);}
};
const sql=input=>docker(['exec','-i',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],input);
const file=p=>readFileSync(path.join(root,p),'utf8');
const check=(name)=>{report.checks.push(name);console.log(`PASS ${name}`)};
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,label){for(let i=0;i<40;i++){try{if(await fn())return;}catch{}await pause(250);}throw new Error(`Sem prontidão: ${label}`)}
function asyncSql(input){
 const child=spawn('docker',['exec','-i','-e','PGAPPNAME=lume_ensaio_publicacao_A',pg,'psql','-X','-qAt','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres']);
 let stdout='',stderr='';child.stdout.on('data',d=>stdout+=d);child.stderr.on('data',d=>stderr+=d);child.stdin.end(input);
 return new Promise((resolve,reject)=>child.on('close',code=>code===0?resolve(stdout):reject(new Error(`Sessão concorrente falhou: ${stderr}`))));
}
async function main(){
 for(const img of Object.values(images))docker(['image','inspect',img]); // Não baixa imagens nem pede autenticação.
 docker(['network','create','--internal',network]);created.push('network');
 docker(['run','-d','--name',pg,'--network',network,'--network-alias','banco','--tmpfs','/var/lib/postgresql/data:rw','-e','POSTGRES_HOST_AUTH_METHOD=trust',images.postgres]);created.push(pg);
 await waitFor(()=>docker(['exec',pg,'pg_isready','-h','127.0.0.1','-U','postgres']).includes('accepting connections'),'PostgreSQL');
 report.postgres=sql('show server_version;');assert.equal(sql('show server_version_num;'),'170011');check('PostgreSQL 17.11 nativo confirmado');
 sql(file('tests/fixtures/novidades-pg17.sql'));check('esquema sintético com RLS, grants e trigger confirmado');
 const secret=randomBytes(48).toString('base64url'); // Só efêmero/local, nunca salvo em relatório ou logs.
 const jwt=sub=>{
  const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
  const unsigned=`${encode({alg:'HS256',typ:'JWT'})}.${encode({role:'authenticated',sub,exp:Math.floor(Date.now()/1000)+600})}`;
  return `${unsigned}.${createHmac('sha256',secret).update(unsigned).digest('base64url')}`;
 };
 docker(['run','-d','--name',rest,'--network',network,'--network-alias','api','-e','PGRST_DB_URI=postgres://authenticator@banco:5432/postgres','-e','PGRST_DB_SCHEMAS=public','-e','PGRST_DB_ANON_ROLE=anon','-e',`PGRST_JWT_SECRET=${secret}`,'-e','PGRST_DB_TX_END=commit-allow-override',images.postgrest]);created.push(rest);
 report.postgrest=docker(['exec',rest,'/bin/postgrest','--version']);
 // HTTP real dentro da rede interna: este Docker gerenciado não mapeia portas efêmeras.
 const request=async(method,url,token,body,prefer='return=representation')=>{
  const payload=body===undefined?'':JSON.stringify(body);
  const headers=['Host: api','Connection: close','Content-Type: application/json',`Prefer: ${prefer}`,`Content-Length: ${Buffer.byteLength(payload)}`];
  if(token)headers.push(`Authorization: Bearer ${token}`);
  const wire=`${method} ${url} HTTP/1.0\r\n${headers.join('\r\n')}\r\n\r\n${payload}`;
  const raw=docker(['exec','-i',pg,'timeout','5','bash','-c','exec 3<>/dev/tcp/api/3000; cat >&3; cat <&3'],wire);
  const split=raw.indexOf('\r\n\r\n');assert.ok(split>0,'resposta HTTP deve incluir headers');
  const lines=raw.slice(0,split).split('\r\n');const status=Number(lines.shift().split(' ')[1]);
  const parsed=new Headers(lines.map(line=>{const n=line.indexOf(':');return [line.slice(0,n),line.slice(n+1).trim()]}));
  let text=raw.slice(split+4);
  if(parsed.get('transfer-encoding')?.includes('chunked')){
   let data=Buffer.from(text),offset=0;const chunks=[];
   while(offset<data.length){const end=data.indexOf('\r\n',offset);const size=parseInt(data.subarray(offset,end).toString().split(';')[0],16);if(!size)break;offset=end+2;chunks.push(data.subarray(offset,offset+size));offset+=size+2;}
   text=Buffer.concat(chunks).toString();
  }
  return {status,headers:parsed,body:text?JSON.parse(text):null};
 };
 await waitFor(async()=>((await request('GET','/produtos?select=id')).status===200),'PostgREST');
 check('PostgREST HTTP real na rede interna, sem portas expostas');
 const missing=await request('GET','/produtos?select=id,first_published_at');assert.equal(missing.status,400);assert.equal(missing.body.code,'42703');check('API detecta coluna ausente antes da migração');
 sql(file('docs/novidades/proposta/inspecao-somente-leitura.sql'));
 sql(file('docs/novidades/proposta/primeira-publicacao.sql'));
 sql(file('docs/novidades/proposta/validacao-pos-migracao.sql'));
 sql(file('tests/fixtures/novidades-pg17-validacao.sql'));
 check('SQL nativo: primeira publicação, edição, republicação, legado e rollback');
 check('dados originais, ACLs, RLS, policies e trigger updated_at preservados');
 sql("notify pgrst,'reload schema';");
 await waitFor(async()=>((await request('GET','/produtos?publicado=eq.true&select=id,first_published_at&order=id.asc')).status===200),'coluna no PostgREST após reload local');
 check('PostgREST lê first_published_at após migração/reload local');
 const admin=jwt('00000000-0000-0000-0000-000000000001'),common=jwt('00000000-0000-0000-0000-000000000002');
 const id='30000000-0000-0000-0000-000000000001',url=`/produtos?id=eq.${id}`;
 let r=await request('POST','/produtos',admin,{id,codigo:'API-DRAFT',nome:'Produto exclusivamente sintético',publicado:false,first_published_at:'2100-01-01',publication_tracked:false});
 assert.equal(r.status,201);assert.equal(r.body[0].first_published_at,null);assert.equal(r.body[0].publication_tracked,true);
 assert.deepEqual((await request('GET',url+'&select=id,first_published_at')).body,[]);
 check('API: rascunho novo sem data e invisível para anon');
 r=await request('PATCH',url,admin,{publicado:true,first_published_at:'2100-01-01'});assert.equal(r.status,200);
 const first=r.body[0].first_published_at;assert.ok(first);assert.ok(Date.parse(first)<Date.parse('2100-01-01'));
 assert.deepEqual((await request('GET',url+'&select=id,first_published_at')).body,[{id,first_published_at:first}]);
 assert.deepEqual((await request('GET','/produtos?codigo=eq.LEGACY&select=first_published_at')).body,[{first_published_at:null}]);
 for(const patch of [{nome:'Edição sintética',categoria_id:2},{publicado:false,first_published_at:null,publication_tracked:false},{publicado:true}]){
  r=await request('PATCH',url,admin,patch);assert.equal(r.status,200);assert.equal(r.body[0].first_published_at,first);
  if(patch.publicado===false)assert.deepEqual((await request('GET',url+'&select=id,first_published_at')).body,[]);
 }
 check('API: publicação, categoria, edição e republicação preservam primeira data');
 const anonWrite=await request('PATCH',url,undefined,{first_published_at:null});assert.ok([401,403].includes(anonWrite.status));
 const commonWrite=await request('PATCH',url,common,{first_published_at:null});assert.equal(commonWrite.status,200);assert.deepEqual(commonWrite.body,[]);
 r=await request('DELETE',url,common);assert.equal(r.status,200);assert.deepEqual(r.body,[]);
 r=await request('POST','/produtos',common,{codigo:'INTRUSO',nome:'Sem permissão',publicado:true});assert.equal(r.status,403);
 assert.equal((await request('GET',url,admin)).body[0].first_published_at,first);
 check('API: anon/conta comum não sobrescrevem, inserem ou excluem produtos');
 r=await request('PATCH',url,admin,{publicado:false},'tx=rollback,return=representation');assert.equal(r.status,200);assert.match(r.headers.get('preference-applied'),/tx=rollback/);
 assert.equal((await request('GET',url,admin)).body[0].publicado,true);check('API: rollback explícito não persiste mudança');
 sql("insert into public.produtos(id,codigo,nome) values('40000000-0000-0000-0000-000000000001','CONCURRENT','Concorrência sintética');");
 const a=asyncSql("begin;update public.produtos set publicado=true where codigo='CONCURRENT' returning extract(epoch from first_published_at);select pg_sleep(3);commit;");
 await waitFor(()=>sql("select count(*) from pg_stat_activity where application_name='lume_ensaio_publicacao_A' and wait_event='PgSleep';")==='1','sessão A mantém lock após publicação');
 const b=sql("update public.produtos set publicado=true,first_published_at='2100-01-01' where codigo='CONCURRENT' returning extract(epoch from first_published_at);");
 const outA=await a;const firstA=outA.split(/\r?\n/).find(x=>/^\d+\.\d+$/.test(x));assert.ok(firstA);assert.equal(b,firstA);
 check('duas sessões concorrentes preservam data da primeira publicação');
 report.status='passed';
}
(async()=>{
 try{await main();}
 catch(e){report.status='failed';report.failure=e.message;console.error(e.message);process.exitCode=1;}
 finally{
  for(const item of created.reverse()){
   try{if(item==='network')docker(['network','rm',network]);else docker(['rm','-f',item]);}
   catch{report.cleanup_failed=true;process.exitCode=1;}
  }
  report.finished_at=new Date().toISOString();mkdirSync(evidence,{recursive:true});writeFileSync(path.join(evidence,'resultado.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Resultado: ${report.status}; ${report.checks.length} verificações. Evidência: ${path.join(evidence,'resultado.json')}`);
 }
})();
