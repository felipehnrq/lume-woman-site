const {test, expect} = require('@playwright/test');
const path = require('node:path');

const userId = '00000000-0000-0000-0000-000000000001';
const productId = '10000000-0000-0000-0000-000000000001';
const defaults = {
  pix_ativo:true, credito_ativo:true, debito_ativo:true,
  id: 1, credito_parcelas: 3, credito_sem_juros: true, pix_texto: '',
  credito_texto: 'parcelas a confirmar', debito_texto: '',
  aviso_geral: 'A loja informará o total e cada parcela antes da confirmação.'
};
const delivery = {
  id: 1, correios_ativo: true, local_ativo: true, retirada_ativa: true,
  regiao_local: 'Louveira', taxa_local: 10, referencia_correios: null,
  texto_local: 'Entrega a combinar.', texto_correios: 'Frete pelo CEP.',
  texto_retirada: 'Horário a combinar.', aviso_geral: 'Confirme frete e prazo com a loja.'
};
const sizes = [{id:'size-1', produto_id:productId, tamanho:'M', estoque:2, ordem:0}, {id:'size-2', produto_id:productId, tamanho:'G', estoque:1, ordem:1}];
const products = [{
  id: productId, codigo:'LW-001', nome:'Vestido de teste', preco:120,
  destaque:'Caimento leve', descricao:'Foto de corpo inteiro', etiqueta:'Novo',
  categoria_id:1, publicado:true, created_at:'2026-11-01',
  categorias:{nome:'Casual'}, produto_tamanhos:sizes
}, {
  id:'10000000-0000-0000-0000-000000000002', codigo:'LW-002', nome:'Peça sem estoque',
  preco:90, categoria_id:1, publicado:true, categorias:{nome:'Casual'}, produto_tamanhos:[]
}];
const photos = ['portrait','landscape','square'].map((name, ordem) => ({id:name, produto_id:productId, caminho:`tests/${name}.svg`, ordem}));
const user = {id:userId, email:'owner@example.test', role:'authenticated', aud:'authenticated', app_metadata:{}, user_metadata:{}};

async function setup(page, options = {}) {
  const state = {payments:{...defaults, ...options.payments}, writes:[], denySave:false, emptySave:false,
    admin: options.admin !== false, failPayments: !!options.failPayments, failDelivery: !!options.failDelivery, delaySave:0, sizes:structuredClone(sizes), failSizes:false, sizeReads:0, stockRows:structuredClone(options.stockRows || products), stockReads:[], failStock:false, stockGate:null};
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__opened = [];
    window.open = url => { window.__opened.push(url); return null; };
  });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.hostname === '127.0.0.1') return route.continue();
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({
      path:path.join(__dirname, '../node_modules/@supabase/supabase-js/dist/umd/supabase.js'), contentType:'text/javascript'
    });
    const json = (body, status=200) => route.fulfill({status, contentType:'application/json', body:JSON.stringify(body)});
    if (!url.hostname.endsWith('.supabase.co')) return route.fulfill({body:'', contentType:'text/css'});
    if (url.pathname.includes('/storage/')) {
      const width = url.pathname.includes('landscape') ? 1600 : 800;
      const height = url.pathname.includes('portrait') ? 1600 : 800;
      return route.fulfill({contentType:'image/svg+xml', body:`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect x="8" y="8" width="${width-16}" height="${height-16}" fill="#d6b4a5" stroke="#44312a" stroke-width="16"/><text x="50%" y="50%" text-anchor="middle" font-size="60">Foto inteira</text></svg>`});
    }
    if (url.pathname.includes('/auth/v1/token')) {
      if (request.postDataJSON().password !== 'correct-password') return json({msg:'Invalid login credentials', error_code:'invalid_credentials'},400);
      const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
      const access_token = `${encode({alg:'HS256',typ:'JWT'})}.${encode({sub:userId,role:'authenticated',aud:'authenticated',exp:Math.floor(Date.now()/1000)+3600})}.test`;
      return json({access_token, refresh_token:'test-refresh-token', token_type:'bearer', expires_in:3600, user});
    }
    if (url.pathname.includes('/auth/v1/user')) return json(user);
    if (url.pathname.includes('/auth/v1/logout')) return json({});
    const table = url.pathname.split('/').pop();
    if (table === 'loja_pagamentos') {
      if (state.failPayments) return json({message:'Not found'},404);
      if (request.method() === 'PATCH') {
        state.writes.push(request.postDataJSON());
        if (state.delaySave) await new Promise(resolve => setTimeout(resolve, state.delaySave));
        if (state.denySave) return json({code:'42501',message:'permission denied'},403);
        if (state.emptySave) return json([]);
        Object.assign(state.payments, request.postDataJSON());
      }
      return json([state.payments]);
    }
    if (table === 'loja_entregas') return state.failDelivery ? json({message:'Unavailable'},503) : json([delivery]);
    if (table === 'admin_users') return json(state.admin ? [{user_id:userId, nome:'Administradora'}] : []);
    if (table === 'produtos' && url.searchParams.get('select') === 'id,codigo,nome,publicado,produto_tamanhos(tamanho,estoque,ordem)') {
      const offset=Number(url.searchParams.get('offset')||0), limit=Number(url.searchParams.get('limit')||200);
      state.stockReads.push({offset,limit,method:request.method(),authorization:request.headers().authorization});
      const rows=structuredClone(state.stockRows.slice(offset,offset+limit));
      if(state.stockGate)await state.stockGate;
      if(state.failStock==='network')return route.abort('internetdisconnected');
      if(state.failStock || offset===state.failStockOffset)return json({message:'Unavailable'},503);
      return json(rows);
    }
    if (table === 'produtos') return json(url.searchParams.has('id') ? [products[0]] : products);
    if (table === 'categorias') return json([{id:1,nome:'Casual',ordem:0,ativa:true}]);
    if (table === 'produto_tamanhos') {
      state.sizeReads++;
      return state.failSizes ? json({message:'Unavailable'},503) : json(state.sizes);
    }
    if (table === 'produto_imagens') return json(photos);
    if (table === 'loja_tema') return json([{id:1,depoimentos:[]}]);
    if (table === 'vendas_manuais') return json([]);
    return json({message:'Unexpected endpoint'},404);
  });
  return {state, errors};
}
async function addToCart(page) {
  await page.locator('[data-open="LW-001"]').click();
  await page.locator('[data-size="M"]').click();
  await page.locator('#confirm-add').click();
  await expect(page.locator('#cart-drawer')).toHaveClass(/open/);
}
async function login(page) {
  await page.locator('#email').fill('owner@example.test');
  await page.locator('#password').fill('correct-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('#view-panel')).toBeVisible();
}

test('atualização leve retira tamanho, preserva carrinho e impede WhatsApp com tamanho indisponível', async ({page}) => {
  const {state, errors} = await setup(page);
  const requests=[];
  page.on('request',r=>{if(r.url().includes('/rest/v1/produto_tamanhos'))requests.push(r);});
  await page.clock.install();
  await page.goto('/'); await addToCart(page);
  state.sizes=state.sizes.filter(s=>s.tamanho!=='M');
  await page.clock.fastForward(60000);
  await expect(page.locator('#availability-status')).toContainText('atualizada');
  await expect(page.locator('#cart-count')).toHaveText('1');
  await page.locator('#checkout').click();
  await expect(page.locator('#toast')).toContainText('não está mais disponível');
  expect(await page.evaluate(()=>window.__opened)).toEqual([]);
  expect(JSON.parse(await page.evaluate(()=>localStorage.getItem('lume_cart_v1')))).toEqual([{id:'LW-001',size:'M',qty:1}]);
  expect(state.sizeReads).toBe(2);
  for(const request of requests){
    expect(request.method()).toBe('GET');
    expect(new URL(request.url()).searchParams.get('select')).toBe('produto_id,tamanho,ordem');
    expect(request.headers().authorization).toBeUndefined();
  }
  await page.locator('[data-remove="0"]').click();
  await expect(page.locator('#cart-count')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('rede indisponível não significa saldo zero; retorno à aba atualiza com intervalo mínimo', async ({page}) => {
  const {state}=await setup(page);
  await page.clock.install(); await page.goto('/'); await addToCart(page);
  state.failSizes=true;
  await page.clock.fastForward(60000);
  await expect(page.locator('#availability-status')).toContainText('Não foi possível');
  await expect(page.locator('#cart-count')).toHaveText('1');
  await page.locator('#close-cart').click();
  await page.locator('[data-open="LW-001"]').click();
  await expect(page.locator('[data-size="M"]')).toBeEnabled();
  await page.locator('[data-size="M"]').click();
  state.failSizes=false;
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  expect(state.sizeReads).toBe(2);
  await page.clock.fastForward(16000);
  state.sizes=[];
  await page.evaluate(()=>document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.locator('[data-size="M"]')).toBeDisabled();
  await expect(page.locator('[data-size="G"]')).toBeDisabled();
  await page.locator('#confirm-add').click();
  await expect(page.locator('#toast')).toContainText('Selecione um tamanho');
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-open="LW-001"]')).toHaveCount(0);
  await expect(page.locator('#cart-count')).toHaveText('1');
});

test('aba oculta não consulta; atualizações não se sobrepõem e dados inválidos são descartados', async ({page}) => {
  const {state}=await setup(page);
  await page.clock.install(); await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(2);
  await page.evaluate(()=>Object.defineProperty(document,'hidden',{configurable:true,value:true}));
  await page.clock.fastForward(120000);
  expect(state.sizeReads).toBe(1);
  await page.evaluate(()=>{window.LUME_REFRESH_SIZES=()=>new Promise(resolve=>{window.__resolveSizes=resolve;window.__refreshCalls=(window.__refreshCalls||0)+1;});Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.fastForward(120000);
  expect(await page.evaluate(()=>window.__refreshCalls)).toBe(1);
  await page.evaluate(()=>window.__resolveSizes([{unexpected:true}]));
  await expect(page.locator('#availability-status')).toContainText('Não foi possível');
  await page.locator('[data-open="LW-001"]').click();
  await expect(page.locator('[data-size="M"]')).toBeEnabled();
});

test('consulta pública pagina tamanhos sem ler quantidade nem aceitar resposta parcial', async ({page}) => {
  await setup(page);
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(2);
  const offsets=[];
  let failSecond=false;
  await page.route('**/rest/v1/produto_tamanhos?*',route=>{
    const url=new URL(route.request().url());
    expect(url.searchParams.get('select')).toBe('produto_id,tamanho,ordem');
    const offset=url.searchParams.get('offset');offsets.push(offset);
    if(offset==='500'&&failSecond)return route.fulfill({status:503,body:'Unavailable'});
    const rows=offset==='0'?Array.from({length:500},(_,i)=>({produto_id:'another-'+i,tamanho:'P',ordem:0})):sizes;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(rows)});
  });
  const rows=await page.evaluate(()=>window.LUME_REFRESH_SIZES());
  expect(rows).toHaveLength(502);
  expect(offsets).toEqual(['0','500']);
  failSecond=true;
  expect(await page.evaluate(()=>window.LUME_REFRESH_SIZES().then(()=>false,()=>true))).toBe(true);
});

test('menu mobile por teclado, largura e movimento reduzido', async ({page}) => {
  await setup(page);
  await page.setViewportSize({width:320,height:568});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await expect(page.locator('.product-card')).toHaveCount(2);
  const menu=page.locator('#menu-toggle'),nav=page.locator('#primary-nav');
  await expect(nav).toBeHidden();
  await menu.focus();await menu.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded','true');
  await expect(nav).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();await expect(menu).toBeFocused();
  await menu.click();await nav.locator('a').first().click();
  await expect(nav).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.locator('html')).toHaveCSS('scroll-behavior','auto');
  await expect(page.locator('.hero-copy')).toHaveCSS('animation-name','none');
  await page.locator('#search').fill('Vestido');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toBeVisible();
  await page.setViewportSize({width:1440,height:900});
  await expect(nav).toBeVisible();await expect(menu).toBeHidden();
});

test('tema administrativo e enquadramento continuam prevalecendo no editorial', async ({page}) => {
  await setup(page);
  await page.route('**/rest/v1/loja_tema?*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([{
    cor_destaque:'#804030',cor_fundo:'#faf5ee',cor_texto:'#302520',fonte:'moderno',grade:4,
    titulo_linha1:'Título editado',titulo_linha2:'No painel',subtitulo:'Descrição editada',chamada:'Chamada editada',
    banner_zoom:125,banner_x:20,banner_y:65,depoimentos:[]
  }])}));
  await page.setViewportSize({width:1440,height:900});
  await page.goto('/');
  await expect(page.locator('#tema-titulo1')).toHaveText('Título editado');
  await expect(page.locator('#tema-descricao')).toHaveText('Descrição editada');
  await expect(page.locator('body')).toHaveClass(/tema-moderno/);
  await expect(page.locator('#products')).toHaveClass(/tema-grade-4/);
  await expect(page.locator('#tema-banner')).toHaveCSS('object-position','20% 65%');
  await expect(page.locator('#tema-banner')).toHaveCSS('transform','matrix(1.25, 0, 0, 1.25, 0, 0)');
  expect(await page.locator('html').evaluate(el=>el.style.getPropertyValue('--clay'))).toBe('#804030');
});

const stockFixture = () => [
  ...[0,1,2,3,4].map((qty,i) => ({
    id:'20000000-0000-0000-0000-'+String(i+1).padStart(12,'0'),
    codigo:'ST-'+qty, nome:'Peça com '+qty+' unidades', publicado:qty%2===0,
    produto_tamanhos:[{tamanho:'M',estoque:qty,ordem:0}]
  })),
  {id:'20000000-0000-0000-0000-000000000006',codigo:'ST-MIX',nome:'Tamanhos mistos',publicado:true,
    produto_tamanhos:[{tamanho:'P',estoque:0,ordem:0},{tamanho:'G',estoque:4,ordem:2},{tamanho:'M',estoque:2,ordem:1}]},
  {id:'20000000-0000-0000-0000-000000000007',codigo:'ST-NONE',nome:'Sem grade',publicado:false,produto_tamanhos:[]},
  {id:'20000000-0000-0000-0000-000000000008',codigo:'ST-SUM',nome:'Soma dos tamanhos',publicado:true,
    produto_tamanhos:[{tamanho:'P',estoque:2,ordem:0},{tamanho:'M',estoque:2,ordem:1}]}
];
const stockCard = (page,code) => page.locator('.stock-card').filter({has:page.locator('.prod-code',{hasText:new RegExp('^'+code+'$')})});

test('central: sessão autenticada, resumo, totais por produto e situação de cada tamanho', async ({page}) => {
  const {state,errors}=await setup(page,{stockRows:stockFixture()});
  await page.goto('/admin/#estoque');
  await expect(page.locator('#view-login')).toBeVisible();
  expect(state.stockReads).toHaveLength(0);
  await login(page);
  await expect(page.locator('.stock-card')).toHaveCount(8);
  await expect(page.locator('#stock-units')).toHaveText('20');
  await expect(page.locator('#stock-low')).toHaveText('5');
  await expect(page.locator('#stock-empty')).toHaveText('1');
  await expect(page.locator('#stock-no-sizes')).toHaveText('1');
  for(const [qty,status] of [[0,'Esgotado'],[1,'Disponível'],[2,'Disponível'],[3,'Disponível'],[4,'Disponível']]){
    await expect(stockCard(page,'ST-'+qty).locator('.stock-state')).toHaveText(status);
    await expect(stockCard(page,'ST-'+qty).locator('.stock-size')).toContainText('M: '+qty);
  }
  const mixed=stockCard(page,'ST-MIX');
  await expect(mixed.locator('.stock-total')).toContainText('Total: 6 unidades');
  await expect(mixed.locator('.stock-state')).toHaveText('Disponível');
  await expect(mixed.locator('.stock-size')).toHaveText(['P: 0Esgotado','M: 2Estoque baixo','G: 4Disponível']);
  await expect(stockCard(page,'ST-NONE')).toContainText('Sem tamanhos cadastrados');
  await expect(stockCard(page,'ST-NONE').locator('.stock-state')).toHaveText('Sem tamanhos cadastrados');
  await expect(stockCard(page,'ST-NONE').locator('.badge')).toHaveText('Desativado');
  await expect(mixed.locator('.badge')).toHaveText('Publicado');
  await expect(stockCard(page,'ST-SUM').locator('.stock-state')).toHaveText('Disponível');
  expect(state.stockReads).toHaveLength(1);
  expect(state.stockReads[0].method).toBe('GET');
  expect(state.stockReads[0].authorization).toMatch(/^Bearer /);
  expect(errors).toEqual([]);
});

test('central: busca, filtros acessíveis e edição pelo formulário existente sem gravar', async ({page}) => {
  const {state}=await setup(page,{stockRows:stockFixture()});
  await page.goto('/admin/#estoque');await login(page);
  await expect(page.locator('.stock-card')).toHaveCount(8);
  await page.getByRole('button',{name:'Estoque baixo por tamanho',exact:true}).click();
  await expect(page.locator('.stock-card')).toHaveCount(5);
  await expect(page.getByRole('button',{name:'Estoque baixo por tamanho',exact:true})).toHaveAttribute('aria-pressed','true');
  await page.locator('#stock-search').fill('ST-2');
  await expect(page.locator('.stock-card')).toHaveCount(1);
  await expect(page.locator('#stock-units')).toHaveText('20');
  await page.locator('#stock-search').fill('não existe');
  await expect(page.locator('#stock-list')).toContainText('Nenhum produto encontrado');
  await page.locator('#stock-search').fill('');
  await page.getByRole('button',{name:'Esgotados',exact:true}).click();
  await expect(page.locator('.stock-card')).toHaveCount(1);
  await expect(page.locator('.stock-state')).toHaveText('Esgotado');
  await page.getByRole('button',{name:'Sem tamanhos',exact:true}).click();
  await expect(page.locator('.stock-card')).toHaveCount(1);
  await expect(page.locator('.stock-state')).toHaveText('Sem tamanhos cadastrados');
  await page.getByRole('button',{name:'Disponíveis',exact:true}).click();
  await expect(page.locator('.stock-card')).toHaveCount(6);
  await page.getByRole('button',{name:'Todos os produtos',exact:true}).click();
  await page.locator('#stock-search').fill('TAMANHOS MISTOS');
  await expect(page.locator('.stock-card')).toHaveCount(1);
  expect(state.stockReads).toHaveLength(1);
  await page.locator('#stock-search').fill('');
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('ST-MIX');
  // Usa um ID já servido pelo mock da edição original.
  await page.route('**/rest/v1/produtos?*id=eq.*',route=>route.fulfill({contentType:'application/json',body:JSON.stringify([products[0]])}));
  await stockCard(page,'ST-4').getByRole('link',{name:/Editar produto/}).click();
  await expect(page.locator('#form-title')).toHaveText('Editar produto');
  await expect(page.locator('#prod-form')).toBeVisible();
  expect(state.writes).toEqual([]);
  await page.locator('[data-nav="estoque"]').click();
  await expect(page.locator('.stock-card')).toHaveCount(8);
  expect(state.stockReads).toHaveLength(2);
});

test('central: visitante e conta sem autorização não consultam quantidades', async ({page}) => {
  const {state}=await setup(page,{admin:false,stockRows:stockFixture()});
  await page.goto('/admin/#estoque');
  await expect(page.locator('#view-login')).toBeVisible();
  await page.locator('#email').fill('owner@example.test');await page.locator('#password').fill('correct-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('#login-message')).toContainText('não tem permissão');
  await expect(page.locator('#view-panel')).toBeHidden();
  expect(state.stockReads).toHaveLength(0);
  await expect(page.locator('#stock-list')).toBeEmpty();
});

test('central: falha de rede, tentativa novamente e ausência de produtos', async ({page}) => {
  const {state}=await setup(page,{stockRows:stockFixture()});state.failStock=true;
  await page.goto('/admin/#estoque');await login(page);
  await expect(page.locator('#stock-status')).toContainText('Não foi possível');
  await expect(page.locator('#stock-content')).toBeHidden();
  state.failStock='network';
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await expect.poll(()=>state.stockReads.length).toBe(2);
  await expect(page.locator('#stock-status')).toContainText('Não foi possível');
  state.failStock=false;state.stockRows=[];
  await page.getByRole('button',{name:'Tentar novamente',exact:true}).click();
  await expect(page.locator('#stock-list')).toContainText('Nenhum produto cadastrado.');
  await expect(page.locator('#stock-units')).toHaveText('0');
  await expect(page.locator('#stock-empty')).toHaveText('0');
  state.stockRows=[{...stockFixture()[0],produto_tamanhos:[{tamanho:'M',estoque:null}]}];
  await page.locator('#stock-reload').click();
  await expect(page.locator('#stock-status')).toContainText('Não foi possível');
  await expect(page.locator('#stock-content')).toBeHidden();
});

test('central: logout limpa interface e respostas antigas não voltam após novo login', async ({page}) => {
  const {state}=await setup(page,{stockRows:stockFixture()});
  await page.goto('/admin/#estoque');await login(page);
  await expect(page.locator('.stock-card')).toHaveCount(8);
  await page.locator('#stock-search').fill('ST-4');
  let release;
  state.stockGate=new Promise(resolve=>{release=resolve;});
  await page.locator('#stock-reload').click();
  await expect.poll(()=>state.stockReads.length).toBe(2);
  await page.locator('#logout').click();
  await expect(page.locator('#view-login')).toBeVisible();
  await expect(page.locator('#stock-list')).toBeEmpty();
  await expect(page.locator('#stock-units')).toBeEmpty();
  await expect(page.locator('#stock-search')).toHaveValue('');
  await expect(page.locator('#stock-updated')).toBeEmpty();
  await expect(page.locator('#stock-no-sizes')).toBeEmpty();
  state.stockGate=null;state.stockRows=[];
  await login(page);
  await expect(page.locator('#stock-list')).toContainText('Nenhum produto cadastrado.');
  release();
  await expect(page.locator('.stock-card')).toHaveCount(0);
  await expect(page.locator('#stock-units')).toHaveText('0');
  const stored=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));
  expect(stored).not.toContain('ST-4');
});

test('central: consulta única durante carregamento e paginação completa', async ({page}) => {
  const rows=Array.from({length:201},(_,i)=>({...stockFixture()[4],id:'30000000-0000-0000-0000-'+String(i).padStart(12,'0'),codigo:'PG-'+i}));
  const {state}=await setup(page,{stockRows:rows});
  let release;state.stockGate=new Promise(resolve=>{release=resolve;});
  await page.goto('/admin/#estoque');await login(page);
  await expect(page.locator('#stock-status')).toContainText('Carregando');
  await expect(page.locator('#stock-reload')).toBeDisabled();
  await expect(page.locator('#stock-updated')).toBeEmpty();
  await page.evaluate(()=>window.dispatchEvent(new HashChangeEvent('hashchange')));
  expect(state.stockReads).toHaveLength(1);
  state.stockGate=null;release();
  await expect(page.locator('.stock-card')).toHaveCount(201);
  expect(state.stockReads.map(r=>r.offset)).toEqual([0,200]);
  await expect(page.locator('#stock-units')).toHaveText('804');
});

test('central: falha na segunda página não apresenta resumo ou listagem parcial', async ({page}) => {
  const rows=Array.from({length:201},(_,i)=>({...stockFixture()[4],id:'30000000-0000-0000-0000-'+String(i).padStart(12,'0'),codigo:'PG-'+i}));
  const {state}=await setup(page,{stockRows:rows});state.failStockOffset=200;
  await page.goto('/admin/#estoque');await login(page);
  await expect(page.locator('#stock-status')).toContainText('Não foi possível');
  await expect(page.locator('#stock-content')).toBeHidden();
  await expect(page.locator('.stock-card')).toHaveCount(0);
  expect(state.stockReads.map(r=>r.offset)).toEqual([0,200]);
  state.failStockOffset=undefined;
  await page.locator('#stock-reload').click();
  await expect(page.locator('.stock-card')).toHaveCount(201);
  await expect(page.locator('#stock-units')).toHaveText('804');
});

test.describe('horário do navegador', () => {
  test.use({timezoneId:'America/Sao_Paulo'});

test('central: horário local muda só após consulta completa, é preservado no erro e limpo no logout', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  const {state}=await setup(page,{stockRows:stockFixture()});
  await page.clock.install({time:new Date('2026-11-06T17:32:00Z')});
  await page.goto('/admin/#estoque');await login(page);
  await expect(page.locator('.stock-card')).toHaveCount(8);
  const expected=await page.evaluate(()=>'Última consulta concluída às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.');
  expect(expected).toBe('Última consulta concluída às 14:32.');
  await expect(page.locator('#stock-updated')).toHaveText(expected);
  state.failStock=true;
  await page.clock.setSystemTime(new Date('2026-11-06T17:45:00Z'));
  await page.locator('#stock-reload').click();
  await expect(page.locator('#stock-status')).toContainText('Não foi possível');
  await expect(page.locator('#stock-updated')).toHaveText(expected);
  await expect(page.locator('#stock-content')).toBeHidden();
  // O horário anterior também deve sobreviver a uma falha de página posterior.
  state.failStock=false;
  state.stockRows=Array.from({length:201},(_,i)=>({...stockFixture()[4],id:'30000000-0000-0000-0000-'+String(i).padStart(12,'0'),codigo:'PG-'+i}));
  state.failStockOffset=200;
  await page.locator('#stock-reload').click();
  await expect(page.locator('#stock-status')).toContainText('Não foi possível');
  await expect(page.locator('#stock-updated')).toHaveText(expected);
  state.failStockOffset=undefined;
  let release;state.stockGate=new Promise(resolve=>{release=resolve;});
  await page.locator('#stock-reload').click();
  await expect(page.locator('#stock-status')).toContainText('Carregando');
  await expect(page.locator('#stock-updated')).toHaveText(expected);
  state.stockGate=null;release();
  await expect(page.locator('.stock-card')).toHaveCount(201);
  const updated=await page.evaluate(()=>'Última consulta concluída às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.');
  await expect(page.locator('#stock-updated')).toHaveText(updated);
  expect(updated).toBe('Última consulta concluída às 14:45.');
  expect(updated).not.toBe(expected);
  expect(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}))).not.toContain('Última consulta');
  await page.locator('#logout').click();
  await expect(page.locator('#view-login')).toBeVisible();
  await expect(page.locator('#stock-updated')).toBeEmpty();
  await expect(page.locator('#stock-list')).toBeEmpty();
});

});

for (const width of [320,375,390]) {
  test('navegação administrativa acessível sem sobreposição em '+width+' px', async ({page}) => {
    const {errors}=await setup(page,{stockRows:stockFixture()});
    await page.setViewportSize({width,height:568});
    await page.goto('/admin/#estoque');await login(page);
    await expect(page.locator('.stock-card')).toHaveCount(8);
    const links=page.locator('.panel-nav a');
    await expect(links).toHaveCount(8);
    const measurements=await links.evaluateAll(nodes=>nodes.map(node=>{
      const bounds=node.getBoundingClientRect(),icon=node.querySelector('span').getBoundingClientRect();
      const text=Array.from(node.childNodes).find(n=>n.nodeType===Node.TEXT_NODE&&n.textContent.trim());
      const range=document.createRange();range.setStart(text,text.textContent.search(/\S/));range.setEnd(text,text.textContent.trimEnd().length);
      return {box:{x:bounds.x,y:bounds.y,right:bounds.right,bottom:bounds.bottom,width:bounds.width,height:bounds.height},
        icon:{x:icon.x,y:icon.y,right:icon.right,bottom:icon.bottom},font:parseFloat(getComputedStyle(node).fontSize),
        labels:Array.from(range.getClientRects()).map(r=>({x:r.x,y:r.y,right:r.right,bottom:r.bottom}))};
    }));
    for(const measurement of measurements){
      const {box,icon,labels,font}=measurement;
      expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);expect(box.right).toBeLessThanOrEqual(width);
      expect(font).toBeGreaterThanOrEqual(11);
      for(const rect of [icon,...labels]){
        expect(rect.x).toBeGreaterThanOrEqual(box.x-1);expect(rect.right).toBeLessThanOrEqual(box.right+1);
        expect(rect.y).toBeGreaterThanOrEqual(box.y-1);expect(rect.bottom).toBeLessThanOrEqual(box.bottom+1);
      }
    }
    for(let i=0;i<measurements.length;i++)for(let j=i+1;j<measurements.length;j++){
      const a=measurements[i].box,b=measurements[j].box;
      expect(Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x))*Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y))).toBe(0);
    }
    for(const route of ['inicio','produtos','vendas','estoque','fotografias','personalizar','entregas','pagamentos']){
      const link=page.locator('[data-nav="'+route+'"]');
      await link.focus();await page.keyboard.press('Enter');
      await expect(page.locator('[data-screen="'+route+'"]')).toBeVisible();
      await expect(link).toHaveAttribute('aria-current','page');
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test('central: texto seguro e layout mobile', async ({page}) => {
  const rows=stockFixture();rows[0].nome='<img src=x onerror=alert(1)> Peça '+ 'longa '.repeat(15);
  const {state}=await setup(page,{stockRows:rows});await page.setViewportSize({width:320,height:568});
  await page.goto('/admin/#estoque');await login(page);
  await expect(page.locator('.stock-card')).toHaveCount(8);
  await expect(page.locator('.stock-card img')).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Estoque baixo por tamanho',exact:true}).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.stock-card')).toHaveCount(5);
  if(process.env.LUME_STOCK_EVIDENCE_DIR){
    state.stockRows=stockFixture();
    await page.locator('#stock-reload').click();
    await expect(page.locator('.stock-card')).toHaveCount(5);
    await page.getByRole('button',{name:'Todos os produtos',exact:true}).click();
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(process.env.LUME_STOCK_EVIDENCE_DIR,'estoque-mobile.png'),fullPage:false});
    await stockCard(page,'ST-MIX').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(process.env.LUME_STOCK_EVIDENCE_DIR,'estoque-mobile-tamanhos.png'),fullPage:false});
    await page.setViewportSize({width:1440,height:900});
    await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
    await page.screenshot({path:path.join(process.env.LUME_STOCK_EVIDENCE_DIR,'estoque-desktop.png'),fullPage:true});
  }
});

for (const viewport of [{width:320,height:568}, {width:390,height:844}, {width:844,height:390}, {width:1440,height:900}]) {
  test(`fotografias completas e galeria em ${viewport.width}x${viewport.height}`, async ({page}) => {
    const {errors} = await setup(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.product-card')).toHaveCount(2);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    if(process.env.LUME_EVIDENCE_DIR){
      await page.locator('#products').scrollIntoViewIfNeeded();
      await expect.poll(()=>page.locator('.product-img-wrap img').first().evaluate(el=>el.complete&&el.naturalWidth>0)).toBe(true);
      await page.evaluate(()=>window.scrollTo({top:0,behavior:'instant'}));
      await page.screenshot({path:path.join(process.env.LUME_EVIDENCE_DIR,'vitrine-'+viewport.width+'.png'),fullPage:true});
    }
    const cardImage = page.locator('.product-img-wrap img').first();
    await expect(cardImage).toHaveCSS('object-fit','contain');
    await cardImage.hover();
    await expect(cardImage).toHaveCSS('transform','none');
    const imageBox = await cardImage.boundingBox(), buttonBox = await page.locator('[data-open="LW-001"]').boundingBox();
    expect(imageBox.y+imageBox.height).toBeLessThanOrEqual(buttonBox.y);
    await page.locator('[data-open="LW-001"]').click();
    const image = page.locator('.detail-main-img');
    await expect(image).toHaveCSS('object-fit','contain');
    await expect(page.locator('.detail-thumb')).toHaveCount(3);
    for (let index=0; index<3; index++) {
      const thumbnail = page.locator(`[data-photo="${index}"]`);
      await thumbnail.focus(); await thumbnail.press('Enter');
      await expect(thumbnail).toHaveAttribute('aria-pressed','true');
      await expect(image).toHaveAttribute('src',new RegExp(photos[index].caminho));
      await expect.poll(() => image.evaluate(el => el.complete && el.naturalWidth > 0)).toBe(true);
      expect(await image.evaluate(el => el.clientWidth <= el.parentElement.clientWidth)).toBe(true);
    }
    const dialog = page.locator('#product-dialog');
    const box = await dialog.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y+box.height).toBeLessThanOrEqual(viewport.height+1);
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.locator('#confirm-add').click();
    await expect(page.locator('#toast')).toContainText('Selecione um tamanho');
    await page.locator('[data-size="G"]').click(); await page.locator('#confirm-add').click();
    await expect(page.locator('#cart-count')).toHaveText('1');
    await page.locator('#close-cart').click();
    await page.locator('#search').fill('sem estoque');
    await expect(page.locator('.product-card')).toHaveCount(1);
    await expect(page.locator('.quick-add')).toBeDisabled();
    await page.locator('#search').fill('');
    await page.locator('[data-open="LW-001"]').click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#product-dialog')).toHaveAttribute('aria-hidden','true');
    expect(errors).toEqual([]);
  });
}

test('padrões, carrinho persistido, CEP e três preferências no WhatsApp', async ({page}) => {
  const {errors} = await setup(page);
  await page.goto('/'); await addToCart(page);
  await expect(page.locator('[data-payment-credit]')).toHaveText('Crédito • até 3x sem juros');
  await expect(page.locator('#payment-help')).toHaveText('Escolha sua preferência. Crédito em até 3x sem juros. A loja informará o total e cada parcela antes da confirmação. Não envie número completo, CVV ou senha do cartão pelo WhatsApp.');
  await page.locator('[data-inc="0"]').click();
  await expect(page.locator('#cart-count')).toHaveText('2');
  await page.reload(); await page.locator('#open-cart').click();
  await expect(page.locator('#cart-count')).toHaveText('2');
  await expect(page.locator('input[name="forma-pagamento"]')).toHaveCount(3);
  await page.locator('#checkout').click();
  await expect(page.locator('#toast')).toContainText('CEP');
  await page.locator('#entrega-cep').fill('13290000');
  await page.locator('#checkout').click();
  await expect(page.locator('#toast')).toContainText('Selecione uma das formas de pagamento disponíveis');
  for (const [method, label] of Object.entries({pix:'Pix',credito:'Cartão de crédito (até 3x sem juros; parcelas a confirmar)',debito:'Cartão de débito'})) {
    await page.locator(`input[name="forma-pagamento"][value="${method}"]`).check();
    await page.locator('#checkout').click();
    const url = new URL(await page.evaluate(() => window.__opened.at(-1)));
    expect(url.hostname).toBe('wa.me');
    expect(url.searchParams.get('text')).toContain('TESTE DO SITE');
    expect(url.searchParams.get('text')).toContain('2x Vestido de teste');
    expect(url.searchParams.get('text')).toContain('13290-000');
    expect(url.searchParams.get('text')).toContain(`Preferência de pagamento: ${label}`);
  }
  await page.locator('[data-dec="0"]').click();
  await expect(page.locator('#cart-count')).toHaveText('1');
  await page.locator('[data-remove="0"]').click();
  await expect(page.locator('#cart-count')).toHaveText('0');
  expect(errors).toEqual([]);
});

test('login, edição, persistência, vitrine, política e WhatsApp usam as condições salvas', async ({page}, testInfo) => {
  const {state, errors} = await setup(page);
  await page.goto('/admin/#pagamentos');
  await expect(page.locator('#view-login')).toBeVisible();
  await page.locator('#email').fill('owner@example.test'); await page.locator('#password').fill('wrong');
  await page.locator('#login-submit').click();
  await expect(page.locator('#login-message')).toContainText('E-mail ou senha incorretos');
  await login(page);
  await expect(page.locator('#pag-form')).toBeVisible();
  await expect(page.locator('#pag-credito_parcelas')).toHaveValue('3');
  await page.locator('#pag-credito_parcelas').fill('6');
  await page.locator('#pag-credito_sem_juros').uncheck();
  await page.locator('#pag-pix_texto').fill('Desconto a combinar');
  await page.locator('#pag-credito_texto').fill('Taxa e parcelas a confirmar');
  await page.locator('#pag-debito_texto').fill('Pagamento à vista');
  await page.locator('#pag-aviso_geral').fill('Confirme as condições com a equipe.');
  await page.locator('#pag-save').click();
  await expect(page.locator('#pag-status')).toContainText('Condições salvas');
  expect(state.writes).toHaveLength(1); expect(state.payments.credito_parcelas).toBe(6);
  await page.reload(); await expect(page.locator('#pag-credito_parcelas')).toHaveValue('6');
  await page.screenshot({path:testInfo.outputPath('pagamentos-admin.png'),fullPage:true});
  await page.goto('/'); await addToCart(page);
  await expect(page.locator('[data-payment-credit]')).toHaveText('Crédito • até 6x com juros');
  await expect(page.locator('#payment-help')).toContainText('Confirme as condições com a equipe.');
  for (const method of ['pix','credito','debito']) {
    await page.locator(`input[name="forma-pagamento"][value="${method}"]`).check();
    await page.locator('input[name="entrega"][value="retirada"]').check();
    await page.locator('#checkout').click();
    const message = new URL(await page.evaluate(() => window.__opened.at(-1))).searchParams.get('text');
    expect(message).toContain(state.payments[method+'_texto']);
    if (method === 'credito') expect(message).toContain('até 6x com juros');
  }
  await page.goto('/politicas/pagamentos.html');
  await expect(page.locator('[data-payment-summary]')).toContainText('até 6x com juros');
  await expect(page.locator('[data-payment-policy]')).toContainText('até 6x com juros');
  await expect(page.locator('[data-payment-text="pix"]')).toContainText('Desconto a combinar');
  await expect(page.locator('[data-payment-notice]')).toHaveText(state.payments.aviso_geral);
  await page.goto('/admin/#pagamentos'); await expect(page.locator('#pag-form')).toBeVisible();
  await page.locator('#logout').click();
  await expect(page.locator('#view-login')).toBeVisible();
  await expect(page.locator('#pag-pix_texto')).toHaveValue('');
  expect(errors).toEqual([]);
});

test('conta sem permissão não abre o painel', async ({page}) => {
  const {errors} = await setup(page,{admin:false});
  await page.goto('/admin/#pagamentos');
  await page.locator('#email').fill('owner@example.test'); await page.locator('#password').fill('correct-password');
  await page.locator('#login-submit').click();
  await expect(page.locator('#login-message')).toContainText('não tem permissão');
  await expect(page.locator('#view-panel')).toBeHidden();
  expect(errors).toEqual([]);
});

test('resposta de gravação após logout não repõe dados na tela de login', async ({page}) => {
  const {state, errors} = await setup(page);
  await page.goto('/admin/#pagamentos'); await login(page);
  await expect(page.locator('#pag-form')).toBeVisible();
  state.delaySave = 500;
  await page.locator('#pag-pix_texto').fill('Instrução de teste');
  await page.locator('#pag-save').click();
  await expect(page.locator('#pag-save')).toBeDisabled();
  await page.locator('#logout').click();
  await expect(page.locator('#view-login')).toBeVisible();
  await expect.poll(() => state.payments.pix_texto).toBe('Instrução de teste');
  await expect(page.locator('#pag-pix_texto')).toHaveValue('');
  await expect(page.locator('#pag-status')).toBeEmpty();
  expect(errors).toEqual([]);
});

test('gravação negada e zero linhas não geram confirmação de sucesso; restaurar só preenche', async ({page}) => {
  const {state, errors} = await setup(page);
  await page.goto('/admin/#pagamentos'); await login(page);
  await expect(page.locator('#pag-form')).toBeVisible();
  await page.locator('#pag-credito_parcelas').fill('6');
  for (const failure of ['denySave','emptySave']) {
    state[failure] = true;
    await page.locator('#pag-save').click();
    await expect(page.locator('#pag-message')).toContainText('A gravação não foi confirmada');
    expect(state.payments.credito_parcelas).toBe(3);
    state[failure] = false;
  }
  const writes = state.writes.length;
  await page.locator('#pag-defaults').click();
  await expect(page.locator('#pag-credito_parcelas')).toHaveValue('3');
  expect(state.writes).toHaveLength(writes);
  expect(errors).toEqual([]);
});

test('erro de leitura no painel oculta o formulário e permite recarregar', async ({page}) => {
  const {state, errors} = await setup(page,{failPayments:true});
  await page.goto('/admin/#pagamentos'); await login(page);
  await expect(page.locator('#pag-status')).toContainText('Não foi possível carregar');
  await expect(page.locator('#pag-form')).toBeHidden();
  state.failPayments = false; await page.locator('#pag-reload').click();
  await expect(page.locator('#pag-form')).toBeVisible();
  expect(errors).toEqual([]);
});

test('sem configurações a vitrine não oferece métodos desconhecidos e mantém o WhatsApp', async ({page}) => {
  const {errors} = await setup(page,{failPayments:true});
  await page.goto('/'); await addToCart(page);
  await expect(page.locator('[data-payment-status]')).toContainText('Não foi possível consultar');
  await expect(page.locator('.payment-option:visible')).toHaveCount(0);
  await expect(page.locator('#payment-help')).not.toContainText('3x');
  await page.locator('input[name="entrega"][value="local"]').check();
  await page.locator('#checkout').click();
  expect(await page.evaluate(() => window.__opened.length)).toBe(1);
  expect(new URL(await page.evaluate(() => window.__opened[0])).searchParams.get('text')).toContain('Preferência de pagamento: A combinar pelo WhatsApp');
  expect(errors).toEqual([]);
});

test('textos administrativos são texto puro; resposta inválida não reativa métodos', async ({page}) => {
  const injection = '<img src=x onerror="window.__injected=true">';
  const {state, errors} = await setup(page,{payments:{pix_texto:injection}});
  await page.goto('/'); await addToCart(page);
  await expect(page.locator('[data-payment-text="pix"]')).toContainText(injection);
  await expect(page.locator('[data-payment-text="pix"] img')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injected)).toBeUndefined();
  state.payments.credito_parcelas = 0; await page.reload(); await page.locator('#open-cart').click();
  await expect(page.locator('.payment-option:visible')).toHaveCount(0);
  await expect(page.locator('[data-payment-status]')).toContainText('Não foi possível consultar');
  expect(errors).toEqual([]);
});

test('entregas indisponíveis continuam bloqueando o pedido', async ({page}) => {
  const {errors} = await setup(page,{failDelivery:true});
  await page.goto('/'); await addToCart(page);
  await expect(page.locator('#checkout')).toBeDisabled();
  expect(await page.evaluate(() => window.__opened.length)).toBe(0);
  expect(errors).toEqual([]);
});

test('navegação de produtos, estoque, fotografias, entregas, vendas e tema permanece disponível', async ({page}) => {
  const {errors} = await setup(page);
  await page.goto('/admin/#pagamentos'); await login(page);
  for (const route of ['produtos','estoque','fotografias','entregas','vendas','personalizar','pagamentos']) {
    await page.locator(`[data-nav="${route}"]`).click();
    await expect(page.locator(`[data-screen="${route}"]`)).toBeVisible();
    if (route === 'produtos') await expect(page.locator('#prod-list')).toContainText('Vestido de teste');
    if (route === 'entregas') await expect(page.locator('#ent-form')).toBeVisible();
    if (route === 'personalizar') await expect(page.locator('#tema-form')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

for (let mask=0; mask<8; mask++) {
  const methods = ['pix','credito','debito'];
  const active = methods.filter((method,index) => mask & (1 << index));
  test(`seleção de pagamentos: ${active.join(', ') || 'nenhum método exibido'}`, async ({page}) => {
    const payments = Object.fromEntries(methods.map(method => [method+'_ativo',active.includes(method)]));
    const {errors} = await setup(page,{payments});
    await page.setViewportSize({width:390,height:844});
    await page.goto('/'); await addToCart(page);
    await expect(page.locator('.payment-option:visible')).toHaveCount(active.length);
    await page.locator('input[name="entrega"][value="retirada"]').check();
    for (const method of methods) {
      const input = page.locator(`input[name="forma-pagamento"][value="${method}"]`);
      if (active.includes(method)) {
        await expect(input).toBeVisible(); await expect(input).toBeEnabled();
      } else {
        await expect(input).toBeHidden(); await expect(input).toBeDisabled();
        expect(await page.evaluate(method => window.LumePagamentos.getPedido(method),method)).toBeNull();
      }
    }
    if (!active.includes('credito')) {
      await expect(page.locator('#payment-help')).not.toContainText('3x');
      await expect(page.locator('[data-payment-text="credito"]')).toBeHidden();
    }
    if (active.length) await page.locator(`input[name="forma-pagamento"][value="${active[0]}"]`).check();
    await page.locator('#checkout').click();
    expect(await page.evaluate(() => window.__opened.length)).toBe(1);
    const message = new URL(await page.evaluate(() => window.__opened.at(-1))).searchParams.get('text');
    if (!active.length) expect(message).toContain('Preferência de pagamento: A combinar pelo WhatsApp');
    for (const method of methods.filter(method => !active.includes(method))) {
      expect(message).not.toContain({pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito'}[method]);
    }
    // Alterar o HTML pelo navegador não torna um meio desativado aceitável.
    const disabled = methods.find(method => !active.includes(method));
    if (active.length && disabled) {
      await page.locator(`input[name="forma-pagamento"][value="${disabled}"]`).evaluate(el => {el.disabled=false;el.checked=true;});
      await page.locator('#checkout').click();
      expect(await page.evaluate(() => window.__opened.length)).toBe(1);
      await expect(page.locator('#toast')).toContainText('Selecione uma das formas de pagamento disponíveis');
    }
    await page.goto('/politicas/pagamentos.html');
    const summary = page.locator('[data-payment-summary]');
    for (const method of methods) {
      const label = {pix:'Pix',credito:'Cartão de crédito',debito:'Cartão de débito'}[method];
      if (active.includes(method)) await expect(summary).toContainText(label);
      else await expect(summary).not.toContainText(label);
    }
    expect(errors).toEqual([]);
  });
}

test('administradora escolhe os métodos, salva, recarrega e vê somente os habilitados', async ({page}, testInfo) => {
  const {state,errors} = await setup(page);
  await page.goto('/admin/#pagamentos'); await login(page);
  await expect(page.locator('#pag-form')).toBeVisible();
  for (const method of ['pix','credito','debito']) await expect(page.locator('#pag-'+method+'_ativo')).toBeChecked();
  await page.locator('#pag-credito_ativo').uncheck(); await page.locator('#pag-debito_ativo').uncheck();
  await page.locator('#pag-save').click();
  await expect(page.locator('#pag-status')).toContainText('Condições salvas');
  expect(state.payments.pix_ativo).toBe(true);
  expect(state.payments.credito_ativo).toBe(false); expect(state.payments.debito_ativo).toBe(false);
  await page.reload();
  await expect(page.locator('#pag-credito_ativo')).not.toBeChecked();
  await expect(page.locator('#pag-debito_ativo')).not.toBeChecked();
  await page.locator('#pag-form > fieldset').first().screenshot({path:testInfo.outputPath('pagamentos-selecao.png')});
  await page.goto('/'); await addToCart(page);
  await expect(page.locator('.payment-option:visible')).toHaveCount(1);
  await expect(page.locator('input[value="pix"]')).toBeVisible();
  await expect(page.locator('#payment-help')).not.toContainText('3x');
  await page.goto('/admin/#pagamentos');
  await expect(page.locator('#pag-form')).toBeVisible();
  await page.locator('#pag-defaults').click();
  for (const method of ['pix','credito','debito']) await expect(page.locator('#pag-'+method+'_ativo')).toBeChecked();
  // Restaurar os padrões não grava sem a confirmação pelo botão Salvar.
  expect(state.payments.credito_ativo).toBe(false);
  await page.locator('#pag-save').click();
  await expect(page.locator('#pag-status')).toContainText('Condições salvas');
  await page.goto('/'); await addToCart(page);
  await expect(page.locator('.payment-option:visible')).toHaveCount(3);
  expect(errors).toEqual([]);
});
