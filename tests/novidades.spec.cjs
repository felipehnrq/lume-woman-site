const {test,expect}=require('@playwright/test');
async function mock(page,ids=['product-4','product-1','product-0','product-3']){
 const rows=Array.from({length:6},(_,i)=>({id:'product-'+i,codigo:'LW-'+i,nome:'Peça '+i,preco:120,categoria_id:1,publicado:true,created_at:new Date(Date.now()-i*86400000).toISOString()}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
   const rawUrl=route.request().url();
   if(!/^https?:\/\//i.test(rawUrl))return route.continue();
   const url=new URL(rawUrl);
   if(url.hostname==='127.0.0.1')return route.continue();
   if(!url.hostname.endsWith('.supabase.co'))return route.fulfill({body:'',contentType:'text/css'});
   const table=url.pathname.split('/').pop();
   const data=table==='produtos'?rows:table==='categorias'?[{id:1,nome:'Casual'}]:
     table==='produto_tamanhos'?rows.map(p=>({produto_id:p.id,tamanho:'M',ordem:0})):
     table==='produto_imagens'?rows.map(p=>({produto_id:p.id,caminho:'teste/'+p.id+'.jpg',ordem:0})):
     table==='loja_tema'?[{produtos_destaque:ids}]:[];
   const offset=Math.max(0,Number(url.searchParams.get('offset')||0));
   const limit=Math.max(1,Number(url.searchParams.get('limit')||500));
   const paginated=url.searchParams.has('offset');
   const page=paginated?data.slice(offset,offset+limit):data;
   const range=page.length?`${offset}-${offset+page.length-1}/${data.length}`:`*/${data.length}`;
   return route.fulfill({contentType:'application/json',headers:{'content-range':range},body:JSON.stringify(page)});
 });
 return errors;
}
for(const width of [390,1440])test('quatro destaques em ordem manual sem alterar coleção '+width,async({page})=>{
 await page.setViewportSize({width,height:900});const errors=await mock(page);
 await page.goto('/');
 await expect(page.locator('#new-products .product-title')).toHaveText(['Peça 4','Peça 1','Peça 0','Peça 3']);
 await expect(page.locator('#products .product-title')).toHaveText(['Peça 0','Peça 1','Peça 2','Peça 3','Peça 4','Peça 5']);
 await expect(page.locator('#new-arrivals-title')).toHaveText('Destaques da vitrine');
 expect(errors).toEqual([]);
});
test('sem destaques seção oculta e catálogo preservado',async({page})=>{
 await mock(page,[]);await page.goto('/');
 await expect(page.locator('#new-arrivals')).toBeHidden();
 await expect(page.locator('#products .product-card')).toHaveCount(6);
});
test('ignora produto inexistente e duplicações',async({page})=>{
 await mock(page,['product-2','product-2','inexistente','product-0']);
 await page.goto('/');
 await expect(page.locator('#new-products .product-title')).toHaveText(['Peça 2','Peça 0']);
});
