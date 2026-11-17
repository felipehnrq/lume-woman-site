const {test,expect}=require('@playwright/test');
const fs=require('node:fs');
const path=require('node:path');
const now=Date.parse('2026-11-17T12:00:00Z');
async function setup(page,{enabled=true,empty=false,failDates=false,nearlyExpired=false,oneExpiring=false,twoExpiring=false}={}){
 await page.clock.install({time:now-10000});
 await page.clock.pauseAt(now);
 const rows=Array.from({length:6},(_,i)=>({id:`product-${i}`,codigo:`NEW-${i}`,nome:`Peça ${i}`,preco:120,categoria_id:i%2+1,publicado:true,created_at:new Date(now-i*1000).toISOString(),first_published_at:empty?null:new Date(now-i*86400000).toISOString()}));
 if(nearlyExpired)rows.forEach(p=>p.first_published_at=new Date(now-7*86400000+1).toISOString());
 if(twoExpiring)rows[3].first_published_at=new Date(now-7*86400000+1).toISOString();
 if(oneExpiring || twoExpiring)rows[4].first_published_at=new Date(now-7*86400000+1).toISOString();
 rows.push({...rows[0],id:'off',codigo:'OFF',publicado:false});
 const writes=[],errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.hostname==='127.0.0.1'){
   if(url.pathname==='/config.js')return route.fulfill({contentType:'text/javascript',body:fs.readFileSync(path.join(__dirname,'../config.js'),'utf8').replace('novidadesPublicacaoConfiavel: false',`novidadesPublicacaoConfiavel: ${enabled}`)});
   return route.continue();
  }
  if(request.method()!=='GET')writes.push(request.method());
  const json=body=>route.fulfill({headers:Array.isArray(body)?{'access-control-expose-headers':'content-range','content-range':`0-${body.length-1}/${body.length}`}:{},contentType:'application/json',body:JSON.stringify(body)});
  if(!url.hostname.endsWith('.supabase.co'))return route.fulfill({body:'',contentType:'text/css'});
  const table=url.pathname.split('/').pop();
  if(table==='produtos'){
   if(failDates&&url.searchParams.get('select')==='id,first_published_at')return route.fulfill({status:400,body:'{}'});
   return json(rows);
  }
  if(table==='categorias')return json([{id:1,nome:'Casual'},{id:2,nome:'Social'}]);
  if(table==='produto_tamanhos')return json(rows.map(p=>({produto_id:p.id,tamanho:'M',ordem:0})));
  return json([]);
 });
 return {writes,errors};
}
for(const width of [320,390,1440])test(`novidades responsivas, expansão e catálogo preservado em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});
 const state=await setup(page);await page.goto('/');
 await expect(page.locator('#new-arrivals')).toBeVisible();
 await expect(page.locator('#new-products .product-card')).toHaveCount(4);
 await expect(page.locator('#products .product-card')).toHaveCount(6);
 await expect(page.locator('#new-products .product-title')).toHaveText(['Peça 0','Peça 1','Peça 2','Peça 3']);
 await page.locator('#all-new-arrivals').click();
 await expect(page.locator('#new-products .product-card')).toHaveCount(6);
 await expect(page.locator('#all-new-arrivals')).toHaveAttribute('aria-expanded','true');
 await page.locator('[data-filter="Social"]').click();
 await expect(page.locator('#products .product-card')).toHaveCount(3);
 await expect(page.locator('#new-products .product-card')).toHaveCount(6);
 await page.locator('#search').fill('Peça 3');
 await expect(page.locator('#products .product-title')).toHaveText(['Peça 3']);
 await page.locator('#new-products [data-open="NEW-0"]').click();
 await page.locator('[data-size="M"]').click();await page.locator('#confirm-add').click();
 await expect(page.locator('#cart-count')).toHaveText('1');
 await page.locator('#close-cart').click();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(state.writes).toEqual([]);expect(state.errors).toEqual([]);
 if(process.env.LUME_NEWS_EVIDENCE_DIR){
  await page.locator('#all-new-arrivals').click();
  await page.locator('[data-filter="Todas"]').click();
  await page.locator('#search').fill('');
  await page.clock.runFor(4000);
  await page.evaluate(()=>window.scrollTo(0,0));
  fs.mkdirSync(process.env.LUME_NEWS_EVIDENCE_DIR,{recursive:true});
  await page.screenshot({path:path.join(process.env.LUME_NEWS_EVIDENCE_DIR,`novidades-${width}.png`),fullPage:true});
 }
});
for(const [name,options] of [['sem datas',{empty:true}],['flag desligada',{enabled:false}],['coluna indisponível',{failDates:true}]])test(`zero novidades: ${name}`,async({page})=>{
 await setup(page,options);await page.goto('/');await expect(page.locator('#products .product-card')).toHaveCount(6);
 await expect(page.locator('#new-arrivals')).toBeHidden();
});
test('expira com página aberta; produto continua no catálogo',async({page})=>{
 await setup(page);await page.goto('/');await expect(page.locator('#new-products .product-card')).toHaveCount(4);
 await page.clock.fastForward(7*86400000);
 await expect(page.locator('#new-arrivals')).toBeHidden();
 await expect(page.locator('#products .product-card')).toHaveCount(6);
});

test('remove destaque no milissegundo de expiração sem perder foco em recálculo',async({page})=>{
 await setup(page,{nearlyExpired:true});await page.goto('/');
 await expect(page.locator('#new-products .product-card')).toHaveCount(4);
 await page.locator('#new-products [data-open="NEW-0"]').focus();
 await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
 await expect(page.locator('#new-products [data-open="NEW-0"]')).toBeFocused();
 await page.clock.runFor(1);
 await expect(page.locator('#new-arrivals')).toBeHidden();
 await expect(page.locator('#products .product-card')).toHaveCount(6);
});

test('expiração de outra peça preserva foco do card ainda válido',async({page})=>{
 await setup(page,{oneExpiring:true});await page.goto('/');await page.locator('#all-new-arrivals').click();
 await page.locator('#new-products [data-open="NEW-0"]').focus();await page.clock.runFor(1);
 await expect(page.locator('#new-products .product-card')).toHaveCount(5);
 await expect(page.locator('#new-products [data-open="NEW-0"]')).toBeFocused();
});
test('controle em card expirado recebe destino de foco previsível',async({page})=>{
 await setup(page,{oneExpiring:true});await page.goto('/');await page.locator('#all-new-arrivals').click();
 await page.locator('#new-products [data-open="NEW-4"]').focus();await page.clock.runFor(1);
 await expect(page.locator('#new-products [data-open="NEW-0"]')).toBeFocused();
});

test('expiração que oculta botão de expansão transfere foco ao card visível',async({page})=>{
 await setup(page,{twoExpiring:true});await page.goto('/');
 await page.locator('#all-new-arrivals').focus();await page.clock.runFor(1);
 await expect(page.locator('#all-new-arrivals')).toBeHidden();
 await expect(page.locator('#new-products [data-open="NEW-0"]')).toBeFocused();
});
