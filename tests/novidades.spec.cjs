const {test,expect}=require('@playwright/test');
async function mock(page,featured=['product-4','product-1','product-0','product-3'],count=24){
  const rows=Array.from({length:count},(_,i)=>({
    id:'product-'+i,codigo:'LW-'+i,nome:'Peça '+i,preco:120,categoria_id:1,
    publicado:true,created_at:new Date(Date.now()-i*86400000).toISOString()
  }));
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
    const rawUrl=route.request().url();
    if(!/^https?:\/\//i.test(rawUrl))return route.continue();
    const url=new URL(rawUrl);
    if(url.hostname==='127.0.0.1')return route.continue();
    if(!url.hostname.endsWith('.supabase.co'))return route.fulfill({body:'',contentType:'text/css'});
    if(url.pathname.includes('/storage/'))return route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#f1e8e1"/></svg>'});
    const table=url.pathname.split('/').pop();
    const data=table==='produtos'?rows:table==='categorias'?[{id:1,nome:'Casual'}]:
      table==='produto_tamanhos'?rows.map(p=>({produto_id:p.id,tamanho:'M',ordem:0})):
      table==='produto_imagens'?rows.map(p=>({produto_id:p.id,caminho:'teste/'+p.id+'.jpg',ordem:0})):
      table==='loja_tema'?[{produtos_destaque:featured}]:[];
    const offset=Math.max(0,Number(url.searchParams.get('offset')||0));
    const limit=Math.max(1,Number(url.searchParams.get('limit')||500));
    const paginated=url.searchParams.has('offset');
    const selected=paginated?data.slice(offset,offset+limit):data;
    const range=selected.length?`${offset}-${offset+selected.length-1}/${data.length}`:`*/${data.length}`;
    return route.fulfill({contentType:'application/json',headers:{'content-range':range},body:JSON.stringify(selected)});
  });
  return errors;
}
for(const width of [390,1440])test('vitrine curta sem repetir peças e catálogo completo '+width,async({page})=>{
  await page.setViewportSize({width,height:900});
  const errors=await mock(page);
  await page.goto('/');
  await expect(page.locator('#featured-grid .product-card')).toHaveCount(4);
  await expect(page.locator('#new-products .product-card')).toHaveCount(4);
  await expect(page.locator('#products .product-card')).toHaveCount(10);
  const groups=await page.locator('#featured-grid .product-title,#new-products .product-title,#products .product-title').allTextContents();
  expect(new Set(groups).size).toBe(18);
  await expect(page.locator('#new-arrivals-title')).toHaveText('Acabaram de chegar');
  await expect(page.locator('.collection-all-link a')).toHaveAttribute('href','catalogo.html');
  await page.locator('.collection-all-link a').click();
  await expect(page).toHaveURL(/catalogo\.html/);
  await expect(page.locator('#products .product-card')).toHaveCount(24);
  await expect(page.locator('#featured-products')).toBeHidden();
  await expect(page.locator('#new-arrivals')).toBeHidden();
  await expect(page.locator('.catalog-return')).toBeVisible();
  expect(errors).toEqual([]);
});
test('sem destaques, mantém quatro novidades e dez outras peças',async({page})=>{
  await mock(page,[]);
  await page.goto('/');
  await expect(page.locator('#featured-products')).toBeHidden();
  await expect(page.locator('#new-products .product-card')).toHaveCount(4);
  await expect(page.locator('#products .product-card')).toHaveCount(10);
  const names=await page.locator('#new-products .product-title,#products .product-title').allTextContents();
  expect(new Set(names).size).toBe(14);
});
test('catálogo preserva filtros e navegação de volta',async({page})=>{
  await mock(page,[]);
  await page.goto('/catalogo.html');
  await expect(page.locator('#products .product-card')).toHaveCount(24);
  await page.locator('#search').fill('Peça 21');
  await expect(page.locator('#products .product-title')).toHaveText(['Peça 21']);
  await page.locator('.catalog-return').click();
  await expect(page).toHaveURL(/\/index\.html$/);
});
test('Sobre a Lume mantém fundo branco da versão existente',async({page})=>{
  await mock(page,[]);
  await page.goto('/');
  const colors=await page.evaluate(()=>({sobre:getComputedStyle(document.querySelector('#sobre'),'::before').backgroundColor,body:getComputedStyle(document.body).backgroundColor}));
  expect(colors.sobre).toBe('rgb(255, 255, 255)');
  expect(colors.body).not.toBe('rgb(255, 255, 255)');
});
