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
    admin: options.admin !== false, failPayments: !!options.failPayments, failDelivery: !!options.failDelivery, delaySave:0};
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
    if (table === 'produtos') return json(url.searchParams.has('id') ? [products[0]] : products);
    if (table === 'categorias') return json([{id:1,nome:'Casual',ordem:0,ativa:true}]);
    if (table === 'produto_tamanhos') return json(sizes);
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

for (const viewport of [{width:320,height:568}, {width:390,height:844}, {width:844,height:390}, {width:1440,height:900}]) {
  test(`fotografias completas e galeria em ${viewport.width}x${viewport.height}`, async ({page}) => {
    const {errors} = await setup(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('.product-card')).toHaveCount(2);
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
