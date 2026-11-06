/* Central de consulta. Usa a sessão do painel e as permissões existentes.
   Não grava estoque e não persiste dados administrativos no navegador. */
(() => {
  'use strict';
  const Panel = window.LumePanel = window.LumePanel || {client:null, routeHandlers:[], clearHandlers:[]};
  const $ = id => document.getElementById(id);
  const screen = $('tela-estoque');
  const PAGE_SIZE = 200;
  const columns = 'id,codigo,nome,publicado,produto_tamanhos(tamanho,estoque,ordem)';
  let rows = [], filter = 'todos', search = '', active = false, busy = false;
  let generation = 0, controller = null;
  const sizeStatus = total => total === 0 ? 'esgotado' : total <= 3 ? 'baixo' : 'disponivel';
  const labels = {esgotado:'Esgotado', baixo:'Estoque baixo', disponivel:'Disponível', 'sem-tamanhos':'Sem tamanhos cadastrados'};

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function canRead() {
    return active && Panel.client && !$('view-panel').hidden && location.hash === '#estoque';
  }
  function setFilterButtons() {
    screen.querySelectorAll('[data-stock-filter]').forEach(button => {
      const selected = button.dataset.stockFilter === filter;
      button.setAttribute('aria-pressed', String(selected));
      button.classList.toggle('active', selected);
    });
  }
  function clear() {
    generation++;
    controller?.abort(); controller = null;
    rows = []; search = ''; filter = 'todos'; active = false; busy = false;
    $('stock-search').value = '';
    $('stock-list').replaceChildren();
    $('stock-results').textContent = '';
    $('stock-status').textContent = '';
    $('stock-updated').textContent = '';
    $('stock-content').hidden = true;
    for (const id of ['stock-units','stock-low','stock-empty','stock-no-sizes']) $(id).textContent = '';
    $('stock-reload').disabled = false;
    $('stock-reload').textContent = 'Atualizar estoque';
    screen.setAttribute('aria-busy','false');
    setFilterButtons();
  }
  function normalize(product) {
    if (!product || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id) ||
        typeof product.nome !== 'string' || typeof product.codigo !== 'string' ||
        typeof product.publicado !== 'boolean' || !Array.isArray(product.produto_tamanhos)) {
      throw new Error('Resposta de estoque inválida');
    }
    const sizes = product.produto_tamanhos.map(size => {
      if (!size || typeof size.tamanho !== 'string' || !Number.isSafeInteger(size.estoque) || size.estoque < 0)
        throw new Error('Quantidade de estoque inválida');
      return {name:size.tamanho, quantity:size.estoque, order:Number.isFinite(size.ordem) ? size.ordem : 100};
    }).sort((a,b) => a.order-b.order || a.name.localeCompare(b.name,'pt-BR',{numeric:true}));
    const total = sizes.reduce((sum,size) => sum+size.quantity,0);
    if (!Number.isSafeInteger(total)) throw new Error('Total de estoque inválido');
    return {id:product.id, name:product.nome, code:product.codigo, published:product.publicado,
      sizes, total, low:sizes.some(size => size.quantity >= 1 && size.quantity <= 3),
      status:!sizes.length ? 'sem-tamanhos' : total === 0 ? 'esgotado' : 'disponivel'};
  }
  function render() {
    const query = search.trim().toLocaleLowerCase('pt-BR');
    const shown = rows.filter(p => (filter === 'todos' || (filter === 'baixo' ? p.low : p.status === filter)) &&
      (p.name+' '+p.code).toLocaleLowerCase('pt-BR').includes(query));
    $('stock-results').textContent = shown.length+' de '+rows.length+' produtos';
    const list = $('stock-list'); list.replaceChildren();
    if (!shown.length) {
      list.append(el('p','soon',rows.length ? 'Nenhum produto encontrado. Tente outra busca ou filtro.' : 'Nenhum produto cadastrado.'));
      return;
    }
    for (const product of shown) {
      const card = el('article','stock-card'); card.dataset.stockId = product.id;
      const heading = el('div','stock-card-head');
      heading.append(el('span','prod-code',product.code),
        el('span','badge '+(product.published ? 'badge-on' : 'badge-off'),product.published ? 'Publicado' : 'Desativado'));
      card.append(heading,el('h3','stock-name',product.name));
      const total = el('p','stock-total','Total: '+product.total+(product.total === 1 ? ' unidade' : ' unidades'));
      const overall = el('p','stock-overall','Situação geral: ');
      overall.append(el('span','stock-state stock-'+product.status,labels[product.status]));
      card.append(overall,total);
      if (product.sizes.length) {
        const sizes = el('ul','stock-sizes');
        sizes.setAttribute('aria-label','Quantidade e situação por tamanho');
        for (const size of product.sizes) {
          const status = sizeStatus(size.quantity);
          const item = el('li','stock-size stock-'+status);
          item.append(el('strong','',size.name+': '+size.quantity),el('span','',labels[status]));
          sizes.append(item);
        }
        card.append(sizes);
      } else card.append(el('p','hint','Cadastre os tamanhos na edição do produto.'));
      const edit = el('a','btn-outline stock-edit','Editar produto');
      edit.href = '#produtos/editar/'+encodeURIComponent(product.id);
      edit.setAttribute('aria-label','Editar produto '+product.name+' ('+product.code+')');
      card.append(edit); list.append(card);
    }
  }
  async function load() {
    if (busy || !canRead()) return;
    busy = true;
    const current = ++generation;
    const requestController = new AbortController();
    controller = requestController;
    const signal = requestController.signal;
    const timeout = setTimeout(() => requestController.abort(),15000);
    rows = [];
    $('stock-content').hidden = true;
    $('stock-list').replaceChildren();
    $('stock-reload').disabled = true;
    $('stock-status').textContent = 'Carregando estoque…';
    screen.setAttribute('aria-busy','true');
    try {
      const collected = [];
      // Ordem estável e paginação: não transformar o limite da API em um total incompleto.
      for (let offset = 0; ; offset += PAGE_SIZE) {
        const {data,error} = await Panel.client.from('produtos').select(columns)
          .order('id',{ascending:true}).range(offset,offset+PAGE_SIZE-1).retry(false).abortSignal(signal);
        if (current !== generation || !canRead()) return;
        if (error || !Array.isArray(data)) throw error || new Error('Resposta inválida');
        collected.push(...data.map(normalize));
        if (data.length < PAGE_SIZE) break;
      }
      const units = collected.reduce((sum,p) => sum+p.total,0);
      if (!Number.isSafeInteger(units)) throw new Error('Total inválido');
      rows = collected;
      $('stock-units').textContent = String(units);
      $('stock-low').textContent = String(rows.filter(p => p.low).length);
      $('stock-empty').textContent = String(rows.filter(p => p.status === 'esgotado').length);
      $('stock-no-sizes').textContent = String(rows.filter(p => p.status === 'sem-tamanhos').length);
      render();
      $('stock-updated').textContent = 'Última consulta concluída às '+new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+'.';
      $('stock-content').hidden = false;
      $('stock-status').textContent = 'Consulta concluída. Inclui produtos publicados e desativados.';
      $('stock-reload').textContent = 'Atualizar estoque';
    } catch (_) {
      if (current !== generation || !canRead()) return;
      rows = [];
      $('stock-status').textContent = 'Não foi possível atualizar o estoque. Nenhum dado desta tentativa foi exibido. Verifique a conexão e tente novamente.';
      $('stock-reload').textContent = 'Tentar novamente';
    } finally {
      clearTimeout(timeout);
      if (current === generation) {
        busy = false; controller = null;
        $('stock-reload').disabled = false;
        screen.setAttribute('aria-busy','false');
      }
    }
  }
  $('stock-reload').addEventListener('click',load);
  $('stock-search').addEventListener('input',event => {
    search = event.target.value;
    if (canRead() && !busy) render();
  });
  screen.querySelectorAll('[data-stock-filter]').forEach(button => button.addEventListener('click',() => {
    filter = button.dataset.stockFilter; setFilterButtons();
    if (canRead() && !busy) render();
  }));
  Panel.clearHandlers.push(clear);
  Panel.routeHandlers.push(hash => {
    if (hash !== '#estoque') { if (active) clear(); return; }
    if (!Panel.client || $('view-panel').hidden || active) return;
    active = true;
    load();
  });
})();
