/* Lume Woman — vitrine pública ligada ao catálogo aprovado pelo Supabase.
   O carrinho é um pedido preliminar; não reserva estoque nem cobra pagamento.
*/
(() => {
  'use strict';
  const cfg = window.LUME_CONFIG || {};
  const $ = id => document.getElementById(id);
  const brl = n => Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const phone = () => String(cfg.whatsapp || '').replace(/\D/g, '');
  const validPhone = () => /^55\d{10,11}$/.test(phone());
  let items = [], cart = [], activeFilter='Todas', search='', chosen=null, chosenSize=null;
  let ready=false, loadFailed=false, toastTimer;
  const products = $('products');

  function toast(message) {
    const t=$('toast'); t.textContent=message; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),3500);
  }
  function product(id) {return items.find(p=>p.id===id);}
  function available(p) {return Array.isArray(p.tamanhos) && p.tamanhos.length>0;}
  function persist() {try{localStorage.setItem('lume_cart_v1',JSON.stringify(cart))}catch(_){}}
  function restoreCart() {
    try {
      const previous=JSON.parse(localStorage.getItem('lume_cart_v1')||'[]');
      cart=Array.isArray(previous) ? previous.filter(x=>{
        const p=product(x?.id);
        return p && p.tamanhos.includes(x.size) && Number.isInteger(x.qty) && x.qty>=1 && x.qty<=99;
      }).map(x=>({id:x.id,size:x.size,qty:x.qty})) : [];
    } catch(_) {cart=[];}
    persist();
  }
  function count(){return cart.reduce((sum,line)=>sum+line.qty,0)}
  function subtotal(){return cart.reduce((sum,line)=>sum+(product(line.id)?.preco||0)*line.qty,0)}

  function renderProducts() {
    const filtered=items.filter(p=>(activeFilter==='Todas'||p.categoria===activeFilter) &&
      (p.nome+' '+p.categoria+' '+p.id).toLocaleLowerCase('pt-BR').includes(search.toLocaleLowerCase('pt-BR')));
    $('results-count').textContent=`${filtered.length} ${filtered.length===1?'peça encontrada':'peças encontradas'}`;
    if(!items.length){products.innerHTML='<div class="no-results">Ainda não há peças publicadas nesta coleção.</div>';return;}
    products.innerHTML=filtered.length?filtered.map(p=>`
      <article class="product-card">
       <div class="product-img-wrap">
        <img src="${esc(p.imagem)}" alt="${esc(p.semFoto?'Foto em breve: '+p.nome:'Fotografia de '+p.nome)}" loading="lazy"/>
        ${p.etiqueta?`<span class="product-tag">${esc(p.etiqueta)}</span>`:''}
        <button class="quick-add" type="button" ${available(p)?`data-open="${esc(p.id)}"`:'disabled aria-disabled="true"'}>
          ${available(p)?'Escolher tamanho +':'Indisponível'}
        </button>
       </div>
       <div class="product-meta"><span class="product-category">${esc(p.categoria)}</span>
        <div class="product-topline"><h3 class="product-title">${esc(p.nome)}</h3><span class="product-price">${brl(p.preco)}</span></div>
        <p class="product-detail">${esc(p.destaque)}</p>
       </div>
      </article>`).join('') : '<div class="no-results">Não encontramos peças com essa busca. Tente outra palavra.</div>';
  }
  function renderCart() {
    $('cart-count').textContent=count();$('drawer-count').textContent=`(${count()})`;
    $('cart-subtotal').textContent=brl(subtotal());
    const orderOptions=$('cart-order-options');if(orderOptions)orderOptions.hidden=!cart.length;
    $('checkout').disabled=!ready||!validPhone()||!cart.length||!window.LumeEntregas?.isReady?.()||!window.LumePagamentos?.isReady?.();
    $('checkout').title=!window.LumeEntregas?.isReady?.()?'Aguardando confirmar as modalidades de entrega':(!window.LumePagamentos?.isReady?.()?'Carregando condições de pagamento':(validPhone()?(cfg.modoTeste === true?'Abrir mensagem de teste no WhatsApp':'Enviar pedido pelo WhatsApp'):'WhatsApp ainda não configurado para pedidos'));
    $('cart-items').innerHTML=cart.length?cart.map((line,index)=>{
      const p=product(line.id);if(!p)return '';
      return `<div class="cart-line"><img src="${esc(p.imagem)}" alt=""/>
       <div><strong>${esc(p.nome)}</strong><p class="size">Tamanho: ${esc(line.size)}</p>
         <span class="unit">${brl(p.preco)}</span><div><button class="remove" type="button" data-remove="${index}">Remover</button></div></div>
       <div class="quantity"><button type="button" data-dec="${index}" aria-label="Diminuir quantidade">−</button><span>${line.qty}</span><button type="button" data-inc="${index}" aria-label="Aumentar quantidade">+</button></div></div>`;
    }).join(''):'<div class="empty-cart"><div class="empty-ornament">♡</div><strong>Seu carrinho está esperando.</strong>Escolha algumas peças para começar.</div>';
  }
  function lock(){document.body.classList.toggle('modal-open',$('cart-drawer').classList.contains('open')||$('product-dialog').classList.contains('open'))}
  function closeCart(){ $('cart-drawer').classList.remove('open');$('cart-drawer').setAttribute('aria-hidden','true');$('drawer-backdrop').hidden=true;lock(); }
  function closeProduct(){ $('product-dialog').classList.remove('open');$('product-dialog').setAttribute('aria-hidden','true');$('product-backdrop').hidden=true;chosen=null;chosenSize=null;lock(); }
  function openCart(){closeProduct();$('cart-drawer').classList.add('open');$('cart-drawer').setAttribute('aria-hidden','false');$('drawer-backdrop').hidden=false;lock();$('close-cart').focus()}
  function openProduct(id) {
    if(!ready)return;
    const p=product(id);if(!p||!available(p))return;
    closeCart();chosen=p;chosenSize=null;
    const intro=[p.descricao,p.destaque].filter(Boolean).join(' · ') || 'Selecione seu tamanho para adicionar à sacola.';
    const thumbs=(p.imagens||[]).length>1 ? `<div class="detail-thumbs" role="group" aria-label="Fotografias de ${esc(p.nome)}">${p.imagens.map((src,i)=>`<button type="button" class="detail-thumb ${i===0?'active':''}" data-photo="${i}" aria-pressed="${i===0}" aria-label="Ver fotografia ${i+1}"><img src="${esc(src)}" alt=""/></button>`).join('')}</div>`:'';
    $('product-dialog-content').innerHTML=`<div class="product-detail-layout"><div class="detail-visual"><img class="detail-main-img" src="${esc(p.imagem)}" alt="${esc(p.semFoto?'Foto em breve: '+p.nome:'Fotografia de '+p.nome)}"/>${thumbs}</div>
      <div class="detail-copy"><p class="eyebrow">${esc(p.categoria)} / LUME WOMAN</p><h2 id="dialog-product-name">${esc(p.nome)}</h2>
      <div class="detail-price">${brl(p.preco)}</div><p class="detail-sub">${esc(intro)}</p>
      <p class="size-label">Escolha seu tamanho:</p><div class="size-options" role="group" aria-label="Tamanho">
      ${p.tamanhos.map(size=>`<button type="button" class="size-option" data-size="${esc(size)}" aria-pressed="false">${esc(size)}</button>`).join('')}
      </div><button class="btn-primary" type="button" id="confirm-add">Adicionar ao carrinho <span aria-hidden="true">+</span></button></div></div>`;
    $('product-backdrop').hidden=false;$('product-dialog').classList.add('open');$('product-dialog').setAttribute('aria-hidden','false');lock();$('close-product').focus();
  }
  function add() {
    if(!chosen||!chosenSize){toast('Selecione um tamanho antes de continuar.');return;}
    const current=cart.find(x=>x.id===chosen.id&&x.size===chosenSize);
    if(current)current.qty=Math.min(99,current.qty+1);
    else cart.push({id:chosen.id,size:chosenSize,qty:1});
    persist();renderCart();closeProduct();openCart();toast('Peça adicionada ao carrinho!');
  }
  function goWhatsApp(text){
    if(!validPhone()) { toast('WhatsApp não configurado. Fale com a loja para continuar.'); return; }
    // Identificação explícita no ambiente de testes, evitando confusão com pedidos reais.
    const prefixo = cfg.modoTeste === true
      ? '🧪 TESTE DO SITE LUME WOMAN — mensagem de teste, não é pedido real.\n\n'
      : '';
    const mensagem = prefixo + String(text || '');
    window.open(`https://wa.me/${phone()}?text=${encodeURIComponent(mensagem)}`,'_blank','noopener,noreferrer');
  }
  function checkout(){
    if(!cart.length||!ready)return;
    if(!window.LumeEntregas?.isReady?.()){toast('As formas de entrega não foram carregadas. Atualize a loja para tentar novamente.');return;}
    const delivery=window.LumeEntregas?.getPedido?.();
    if(!delivery||!delivery.ok){
      toast(delivery?.error||'Escolha como deseja receber o pedido.');
      if(delivery?.focus)$(delivery.focus)?.focus();
      return;
    }
    const details=cart.map(line=>{
      const p=product(line.id);return `• ${line.qty}x ${p.nome} (${p.id}) | Tam. ${line.size} | ${brl(p.preco*line.qty)}`;
    }).join('\n');
    if(!window.LumePagamentos?.isReady?.()){toast('Aguarde carregar as condições de pagamento.');return;}
    const pagamentoSelecionado=document.querySelector('input[name="forma-pagamento"]:checked');
    const formaPagamento=window.LumePagamentos.hasMethods()
      ? pagamentoSelecionado && window.LumePagamentos.getPedido(pagamentoSelecionado.value)
      : 'A combinar pelo WhatsApp';
    if(!formaPagamento){
      toast('Selecione uma das formas de pagamento disponíveis.');
      document.querySelector('input[name="forma-pagamento"]:not(:disabled)')?.focus();
      return;
    }
    const cep=delivery.cep?`\nCEP para cotação: ${delivery.cep}`:'';
    goWhatsApp(`Olá, Lume Woman! ♡\nGostaria de confirmar este pedido:\n\n${details}\n\nSubtotal das peças: ${brl(subtotal())}\nComo receber: ${delivery.method}${cep}\nFrete: ${delivery.reference}\nPreferência de pagamento: ${formaPagamento}\n\nPor favor, confirmem estoque, prazo, valor total com frete e instruções para pagamento. Obrigada!`);
  }
  document.addEventListener('click',e=>{
    const opening=e.target.closest('[data-open]');if(opening)openProduct(opening.dataset.open);
    const size=e.target.closest('[data-size]');if(size){chosenSize=size.dataset.size;document.querySelectorAll('.size-option').forEach(b=>{const active=b===size;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active))})}
    const photograph=e.target.closest('[data-photo]');if(photograph && chosen){
      const index=Number(photograph.dataset.photo);
      if(!Number.isInteger(index)||!chosen.imagens[index])return;
      $('product-dialog-content').querySelector('.detail-main-img').src=chosen.imagens[index];
      document.querySelectorAll('.detail-thumb').forEach(b=>{
        const active=b===photograph;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));
      });
    }
    if(e.target.closest('#confirm-add'))add();
    const remove=e.target.closest('[data-remove]');if(remove){cart.splice(Number(remove.dataset.remove),1);persist();renderCart()}
    const inc=e.target.closest('[data-inc]');if(inc){const line=cart[Number(inc.dataset.inc)];if(line)line.qty=Math.min(99,line.qty+1);persist();renderCart()}
    const dec=e.target.closest('[data-dec]');if(dec){const i=Number(dec.dataset.dec);if(cart[i]){cart[i].qty--;if(cart[i].qty<=0)cart.splice(i,1)}persist();renderCart()}
  });
  document.querySelectorAll('[data-filter]').forEach(btn=>btn.addEventListener('click',()=>{
    activeFilter=btn.dataset.filter;
    document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===btn));
    if(ready)renderProducts();
  }));
  $('search').addEventListener('input',e=>{search=e.target.value;if(ready)renderProducts()});
  $('open-cart').addEventListener('click',openCart);$('collection-cart').addEventListener('click',openCart);
  $('close-cart').addEventListener('click',closeCart);$('drawer-backdrop').addEventListener('click',closeCart);
  $('close-product').addEventListener('click',closeProduct);$('product-backdrop').addEventListener('click',closeProduct);
  $('checkout').addEventListener('click',checkout);
  $('contact-top').addEventListener('click',()=>goWhatsApp(cfg.mensagemBoasVindas||'Olá, Lume Woman!'));
  $('contact-bottom').addEventListener('click',()=>goWhatsApp(cfg.mensagemBoasVindas||'Olá, Lume Woman!'));
  $('contact-footer').addEventListener('click',()=>goWhatsApp(cfg.mensagemBoasVindas||'Olá, Lume Woman!'));
  if(!/^https:\/\/(www\.)?instagram\.com\/[^\s]+$/i.test(cfg.instagram||''))$('instagram-link').hidden=true;
  document.addEventListener('lume:entregas-carregadas',renderCart);
  document.addEventListener('lume:pagamentos-carregados',renderCart);
  $('instagram-link').addEventListener('click',()=>{
    if(/^https:\/\/(www\.)?instagram\.com\/[^\s]+$/i.test(cfg.instagram||''))window.open(cfg.instagram,'_blank','noopener,noreferrer');
    else toast('Instagram ainda não configurado em config.js.');
  });
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeCart();closeProduct()}});
  async function boot(){
    products.innerHTML='<div class="no-results" role="status">Carregando a coleção da Lume Woman…</div>';
    $('results-count').textContent='Buscando produtos publicados…';
    renderCart();
    try {
      const loaded=await window.LUME_CATALOG_READY;
      if(loaded.error) throw loaded.error;
      items=loaded.data;
      ready=true;restoreCart();renderProducts();renderCart();
    } catch(error) {
      loadFailed=true;items=[];cart=[];ready=false;
      console.error('Falha ao carregar o catálogo público:',error);
      $('results-count').textContent='Não foi possível carregar a coleção';
      products.innerHTML='<div class="no-results" role="alert">Não conseguimos carregar as peças agora. Confira a conexão e <button class="btn-outline retry-catalog" type="button" id="retry-catalog">tente novamente</button>.</div>';
      $('retry-catalog').addEventListener('click',()=>location.reload());
      renderCart();
    }
  }
  boot();
})();
