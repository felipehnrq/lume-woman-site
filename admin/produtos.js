/* =====================================================================
   PAINEL LUME WOMAN — gerenciamento de produtos
   - Lista todos os produtos (publicados e desativados).
   - Cadastra e edita produtos, com tamanhos e quantidades.
   - Publica e desativa (não existe exclusão definitiva nesta etapa).
   Depende do admin.js, que faz o login e entrega o cliente do Supabase.
   IMPORTANTE: quem decide se a gravação é permitida é o banco (RLS).
   Este arquivo confere o resultado de cada gravação, porque o banco pode
   recusar em silêncio (0 linhas alteradas) sem mostrar erro.
   ===================================================================== */
(() => {
  'use strict';

  const Panel = window.LumePanel = window.LumePanel || { client: null, routeHandlers: [], clearHandlers: [] };
  const $ = id => document.getElementById(id);

  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const SIZE_ORDER = ['P', 'M', 'G', 'GG', '34', '36', '38', '40', '42', '44', '46', 'Único'];
  const SELECT = 'id,codigo,nome,descricao,destaque,etiqueta,preco,categoria_id,publicado,created_at,' +
                 'categorias(nome),produto_tamanhos(id,tamanho,estoque,ordem)';

  let products = [];
  let categories = [];
  let statusFilter = 'todos';
  let search = '';
  let listToken = 0;       // evita que uma resposta antiga sobrescreva uma nova
  let formToken = 0;
  let saving = false;
  let dirty = false;       // há alterações não salvas no formulário?
  let editing = null;      // produto em edição: { id, publicado, sizes: ['P','M'] } ou null (novo)
  let sizeState = new Map(); // tamanho -> quantidade digitada (texto)
  let pendingNotice = null;
  let toastTimer;

  /* ---------- Utilidades ---------- */
  const brl = n => Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  // Cria elementos sem usar innerHTML: todo texto entra como texto puro (seguro contra código malicioso).
  function el(tag, props = {}, ...kids) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach(c => { if (c !== null && c !== undefined && c !== false) n.append(c); });
    return n;
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 4500);
  }

  function friendly(e) {
    const code = e && e.code;
    const msg = String((e && e.message) || '');
    if (code === '42501' || /row-level security|permission denied/i.test(msg)) return 'Sua conta não tem permissão para esta ação.';
    if (code === '23514' || code === '22001' || code === '22P02' || code === '23502') return 'Algum valor não foi aceito pelo sistema. Revise os campos e tente de novo.';
    if (code === '23505') return 'Já existe um registro com esses dados. Atualize a página e tente de novo.';
    if (/jwt|token/i.test(msg)) return 'Sua sessão expirou. Saia e entre novamente.';
    return 'Não foi possível concluir. Verifique a internet e tente de novo.';
  }

  const sizeRank = t => { const i = SIZE_ORDER.indexOf(t); return i === -1 ? 100 : i; };
  const bySize = (a, b) => (sizeRank(a) - sizeRank(b)) || a.localeCompare(b, 'pt-BR', { numeric: true });

  // Aceita "149,90", "149.90", "R$ 1.499,00". Recusa valores duvidosos como "1.499".
  function parsePrice(raw) {
    let s = String(raw || '').replace(/R\$/gi, '').replace(/\s/g, '');
    if (!s) return null;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    if (!/^\d{1,5}(\.\d{1,2})?$/.test(s)) return null;
    const n = Number(s);
    return (n > 0 && n < 100000) ? n : null;
  }

  function showView(name) {
    $('prod-list-view').hidden = name !== 'list';
    $('prod-form-view').hidden = name !== 'form';
  }

  /* ---------- LISTA ---------- */
  function setListStatus(text, withRetry) {
    const box = $('prod-status');
    box.textContent = text || '';
    if (withRetry) {
      box.append(' ', el('button', { type: 'button', class: 'link-btn', text: 'Tentar de novo', onclick: loadList }));
    }
  }

  async function loadList() {
    const token = ++listToken;
    setListStatus('Carregando produtos…');
    let res;
    try {
      res = await Panel.client.from('produtos').select(SELECT).order('created_at', { ascending: false });
    } catch (e) { res = { error: e }; }
    if (token !== listToken) return;
    if (res.error) {
      console.error(res.error);
      products = [];
      renderList();
      setListStatus('Não foi possível carregar os produtos. Verifique a internet.', true);
      return;
    }
    products = res.data || [];
    setListStatus('');
    renderList();
  }

  function renderList() {
    const q = search.trim().toLocaleLowerCase('pt-BR');
    const count = { todos: products.length, publicado: 0, desativado: 0 };
    products.forEach(p => { count[p.publicado ? 'publicado' : 'desativado']++; });
    document.querySelectorAll('[data-count]').forEach(s => { s.textContent = count[s.dataset.count]; });

    const shown = products.filter(p => {
      if (statusFilter === 'publicado' && !p.publicado) return false;
      if (statusFilter === 'desativado' && p.publicado) return false;
      if (!q) return true;
      const cat = p.categorias ? p.categorias.nome : '';
      return (p.nome + ' ' + p.codigo + ' ' + cat).toLocaleLowerCase('pt-BR').includes(q);
    });

    const box = $('prod-list');
    box.replaceChildren();
    if (!products.length) {
      if (!$('prod-status').textContent) {
        box.append(el('div', { class: 'soon' },
          el('strong', { text: 'Você ainda não cadastrou nenhuma peça.' }),
          'Toque em “+ Novo produto” para começar.'));
      }
      return;
    }
    if (!shown.length) {
      box.append(el('div', { class: 'soon' }, el('strong', { text: 'Nenhuma peça encontrada.' }), 'Tente outro filtro ou outra palavra.'));
      return;
    }
    shown.forEach(p => box.append(card(p)));
  }

  function card(p) {
    const sizes = (p.produto_tamanhos || []).slice().sort((a, b) => bySize(a.tamanho, b.tamanho));
    const total = sizes.reduce((s, t) => s + t.estoque, 0);
    const cat = p.categorias ? p.categorias.nome : 'Sem categoria';

    const toggle = el('button', {
      type: 'button',
      class: 'btn-outline btn-small',
      text: p.publicado ? 'Desativar' : 'Publicar',
      onclick: () => togglePublish(p, toggle)
    });

    return el('article', { class: 'prod-card' + (p.publicado ? '' : ' is-off'), 'data-id': p.id },
      el('div', { class: 'prod-card-head' },
        el('span', { class: 'badge ' + (p.publicado ? 'badge-on' : 'badge-off'), text: p.publicado ? 'Publicado' : 'Desativado' }),
        el('span', { class: 'prod-code', text: p.codigo })),
      el('h3', { class: 'prod-name', text: p.nome }),
      el('p', { class: 'prod-meta' }, cat + ' · ', el('strong', { text: brl(p.preco) })),
      sizes.length
        ? el('div', { class: 'size-pills', 'aria-label': 'Tamanhos e quantidades' },
            sizes.map(t => el('span', { class: 'pill' + (t.estoque === 0 ? ' zero' : ''), text: t.tamanho + ': ' + t.estoque })),
            el('span', { class: 'pill-total', text: 'Total: ' + total }))
        : el('p', { class: 'prod-warn', text: 'Sem tamanhos cadastrados' }),
      el('div', { class: 'prod-actions' },
        el('a', { class: 'btn-outline btn-small', href: '#produtos/editar/' + p.id, text: 'Editar' }),
        el('a', { class: 'btn-outline btn-small', href: '#fotografias/' + p.id, text: 'Fotos' }),
        toggle));
  }

  async function togglePublish(p, btn) {
    const next = !p.publicado;
    if (next && !(p.produto_tamanhos || []).length) {
      toast('Cadastre pelo menos um tamanho antes de publicar: toque em Editar.');
      return;
    }
    if (!next && !window.confirm('Desativar “' + p.nome + '”?\n\nEla deixa de aparecer na loja, mas continua guardada aqui. Você pode publicar de novo quando quiser.')) return;

    btn.disabled = true;
    try {
      await setPublicado(p.id, next);
      p.publicado = next;
      renderList();
      toast(next ? 'Produto publicado.' : 'Produto desativado.');
    } catch (e) {
      console.error(e);
      btn.disabled = false;
      toast(friendly(e));
    }
  }

  // Altera "publicado" e CONFERE se o banco realmente alterou 1 linha.
  async function setPublicado(id, value) {
    const r = await Panel.client.from('produtos').update({ publicado: value }).eq('id', id).select('id,publicado');
    if (r.error) throw r.error;
    if (!r.data || r.data.length !== 1) throw Object.assign(new Error('Alteração não aplicada'), { code: '42501' });
  }

  /* ---------- FORMULÁRIO ---------- */
  async function ensureCategories() {
    if (categories.length) return;
    const r = await Panel.client.from('categorias').select('id,nome,ordem,ativa').order('ordem', { ascending: true });
    if (r.error) throw r.error;
    categories = r.data || [];
  }

  function setFormStatus(text) {
    $('form-status').textContent = text || '';
  }

  async function openForm(id) {
    showView('form');
    const token = ++formToken;
    dirty = false;
    editing = null;
    $('prod-form').hidden = true;
    $('form-message').textContent = '';
    setFormStatus('Carregando…');
    $('form-title').textContent = id ? 'Editar produto' : 'Novo produto';
    $('form-eyebrow').textContent = id ? 'EDITAR PRODUTO' : 'NOVO PRODUTO';

    try {
      await ensureCategories();
      if (token !== formToken) return;

      if (!id) { fillForm(null); setFormStatus(''); $('prod-form').hidden = false; showPending(); return; }

      if (!UUID.test(id)) { setFormStatus('Produto não encontrado.'); return; }
      const r = await Panel.client.from('produtos').select(SELECT).eq('id', id).maybeSingle();
      if (token !== formToken) return;
      if (r.error) throw r.error;
      if (!r.data) { setFormStatus('Produto não encontrado.'); return; }

      fillForm(r.data);
      setFormStatus('');
      $('prod-form').hidden = false;
      showPending();
    } catch (e) {
      if (token !== formToken) return;
      console.error(e);
      setFormStatus('Não foi possível carregar. Verifique a internet e volte para a lista.');
    }
  }

  function showPending() {
    if (pendingNotice) { setFormMessage(pendingNotice); pendingNotice = null; }
  }

  function fillForm(p) {
    $('f-nome').value = p ? p.nome : '';
    $('f-preco').value = p ? String(Number(p.preco).toFixed(2)).replace('.', ',') : '';
    $('f-descricao').value = (p && p.descricao) || '';
    $('f-destaque').value = (p && p.destaque) || '';
    $('f-etiqueta').value = (p && p.etiqueta) || '';
    $('f-publicado').checked = !!(p && p.publicado);
    updateCounter();

    // categorias ativas (mais a categoria atual do produto, caso esteja inativa)
    const sel = $('f-categoria');
    sel.replaceChildren(el('option', { value: '', text: 'Selecione…' }));
    categories
      .filter(c => c.ativa || (p && c.id === p.categoria_id))
      .forEach(c => sel.append(el('option', { value: String(c.id), text: c.nome })));
    sel.value = p && p.categoria_id != null ? String(p.categoria_id) : '';

    sizeState = new Map();
    ((p && p.produto_tamanhos) || []).forEach(t => sizeState.set(t.tamanho, String(t.estoque)));
    renderSizes();

    editing = p ? { id: p.id, publicado: p.publicado, sizes: ((p.produto_tamanhos) || []).map(t => t.tamanho) } : null;
    $('form-save').textContent = p ? 'Salvar alterações' : 'Salvar produto';
    clearFieldErrors();
  }

  function updateCounter() {
    $('count-descricao').textContent = $('f-descricao').value.length + '/2000';
  }

  function renderSizes(focusSize) {
    const all = Array.from(new Set([...SIZE_ORDER, ...sizeState.keys()])).sort(bySize);

    const chips = $('size-chips');
    chips.replaceChildren();
    all.forEach(t => {
      const on = sizeState.has(t);
      chips.append(el('button', {
        type: 'button', class: 'chip' + (on ? ' active' : ''), 'aria-pressed': String(on), text: t,
        onclick: () => {
          if (sizeState.has(t)) sizeState.delete(t); else sizeState.set(t, '');
          dirty = true;
          renderSizes(sizeState.has(t) ? t : null);
        }
      }));
    });

    const rows = $('size-rows');
    rows.replaceChildren();
    const chosen = all.filter(t => sizeState.has(t));
    if (!chosen.length) rows.append(el('p', { class: 'hint', text: 'Nenhum tamanho selecionado.' }));
    chosen.forEach(t => {
      const input = el('input', {
        id: 'q-' + t, type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4',
        autocomplete: 'off', placeholder: '0', value: sizeState.get(t),
        'aria-label': 'Quantidade do tamanho ' + t,
        oninput: e => { sizeState.set(t, e.target.value.trim()); dirty = true; e.target.removeAttribute('aria-invalid'); }
      });
      rows.append(el('div', { class: 'size-row' },
        el('label', { for: 'q-' + t, text: 'Tamanho ' + t }),
        input,
        el('span', { class: 'unit', text: 'peças' })));
    });
    if (focusSize) { const f = document.getElementById('q-' + focusSize); if (f) f.focus(); }
  }

  function setFormMessage(text) { $('form-message').textContent = text || ''; }
  function clearFieldErrors() { document.querySelectorAll('#prod-form [aria-invalid]').forEach(n => n.removeAttribute('aria-invalid')); }

  function fail(msg, node) {
    if (node) { node.setAttribute('aria-invalid', 'true'); node.focus(); }
    return { ok: false, msg };
  }

  function validate() {
    clearFieldErrors();
    const nome = $('f-nome').value.trim();
    if (!nome) return fail('Informe o nome da peça.', $('f-nome'));
    if (nome.length > 120) return fail('O nome pode ter no máximo 120 letras.', $('f-nome'));

    const catRaw = $('f-categoria').value;
    const cat = categories.find(c => String(c.id) === catRaw);
    if (!cat) return fail('Escolha a categoria.', $('f-categoria'));

    const preco = parsePrice($('f-preco').value);
    if (preco === null) return fail('Preço inválido. Use vírgula para os centavos. Exemplo: 149,90.', $('f-preco'));

    const descricao = $('f-descricao').value.trim();
    if (descricao.length > 2000) return fail('A descrição pode ter no máximo 2000 letras.', $('f-descricao'));
    const destaque = $('f-destaque').value.trim();
    if (destaque.length > 120) return fail('A frase de destaque pode ter no máximo 120 letras.', $('f-destaque'));
    const etiqueta = $('f-etiqueta').value.trim();
    if (etiqueta.length > 30) return fail('A etiqueta pode ter no máximo 30 letras.', $('f-etiqueta'));

    if (!sizeState.size) return fail('Selecione pelo menos um tamanho.', null);
    const sizes = [];
    for (const t of Array.from(sizeState.keys()).sort(bySize)) {
      const raw = sizeState.get(t);
      const input = document.getElementById('q-' + t);
      if (!/^\d{1,4}$/.test(raw)) return fail('Informe a quantidade do tamanho ' + t + ' (use 0 se acabou).', input);
      sizes.push({ tamanho: t, estoque: parseInt(raw, 10), ordem: sizeRank(t) });
    }

    return {
      ok: true,
      data: {
        nome, preco, categoria_id: cat.id,
        descricao: descricao || null, destaque: destaque || null, etiqueta: etiqueta || null,
        sizes, publicado: $('f-publicado').checked
      }
    };
  }

  // Erro "parcial": parte dos dados foi salva e parte não. Explicamos exatamente o que ficou.
  const partial = (message, goToEditId = null, goToList = false) => Object.assign(new Error(message), { partial: true, goToEditId, goToList });

  async function saveSizes(id, sizes, removed) {
    const rows = sizes.map(s => ({ produto_id: id, tamanho: s.tamanho, estoque: s.estoque, ordem: s.ordem }));
    const up = await Panel.client.from('produto_tamanhos').upsert(rows, { onConflict: 'produto_id,tamanho' }).select('id');
    if (up.error) throw up.error;
    if (!up.data || up.data.length !== rows.length) throw new Error('Tamanhos não gravados por completo');
    if (removed.length) {
      const del = await Panel.client.from('produto_tamanhos').delete().eq('produto_id', id).in('tamanho', removed).select('id');
      if (del.error) throw del.error;
      if (!del.data || del.data.length !== removed.length) throw new Error('Tamanhos antigos não removidos por completo');
    }
  }

  async function saveNew(d) {
    // 1) cria SEMPRE desativado; só publica depois que tudo foi salvo
    const ins = await Panel.client.from('produtos').insert({
      nome: d.nome, descricao: d.descricao, destaque: d.destaque, etiqueta: d.etiqueta,
      preco: d.preco, categoria_id: d.categoria_id, publicado: false
    }).select('id,codigo').single();
    if (ins.error) throw ins.error;
    if (!ins.data) throw new Error('Produto não criado');
    const id = ins.data.id;

    // 2) tamanhos
    try { await saveSizes(id, d.sizes, []); } catch (e) {
      console.error(e);
      throw partial('A peça ' + ins.data.codigo + ' foi criada como DESATIVADA, mas os tamanhos não foram salvos. Confira os tamanhos abaixo e toque em Salvar de novo.', id);
    }

    // 3) publicar (se a opção estiver marcada)
    if (d.publicado) {
      try { await setPublicado(id, true); } catch (e) {
        console.error(e);
        throw partial('A peça foi salva, mas não foi possível publicá-la agora. Ela está DESATIVADA. Use o botão Publicar na lista.', null, true);
      }
    }
    return 'Produto cadastrado!';
  }

  async function saveEdit(d) {
    const id = editing.id;
    const up = await Panel.client.from('produtos').update({
      nome: d.nome, descricao: d.descricao, destaque: d.destaque, etiqueta: d.etiqueta,
      preco: d.preco, categoria_id: d.categoria_id
    }).eq('id', id).select('id');
    if (up.error) throw up.error;
    if (!up.data || up.data.length !== 1) throw Object.assign(new Error('Alteração não aplicada'), { code: '42501' });

    const keep = new Set(d.sizes.map(s => s.tamanho));
    const removed = editing.sizes.filter(t => !keep.has(t));
    try { await saveSizes(id, d.sizes, removed); } catch (e) {
      console.error(e);
      throw partial('Os dados da peça foram salvos, mas os tamanhos e quantidades não. Toque em Salvar de novo.', null);
    }

    if (d.publicado !== editing.publicado) {
      try { await setPublicado(id, d.publicado); } catch (e) {
        console.error(e);
        throw partial('As alterações foram salvas, mas não foi possível mudar a situação (publicado/desativado). Use o botão na lista.', null, true);
      }
    }
    return 'Alterações salvas!';
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (saving) return;
    const v = validate();
    if (!v.ok) { setFormMessage(v.msg); return; }

    saving = true;
    $('form-save').disabled = true;
    $('form-save').textContent = 'Salvando…';
    setFormMessage('');
    try {
      const done = await (editing ? saveEdit(v.data) : saveNew(v.data));
      dirty = false;
      toast(done);
      location.hash = '#produtos';
    } catch (err) {
      console.error(err);
      if (err && err.partial) {
        dirty = false;
        if (err.goToEditId) { pendingNotice = err.message; location.hash = '#produtos/editar/' + err.goToEditId; }
        else if (err.goToList) { toast(err.message); location.hash = '#produtos'; }
        else setFormMessage(err.message);
      } else {
        setFormMessage(friendly(err));
      }
    } finally {
      saving = false;
      $('form-save').disabled = false;
      if (!$('prod-form').hidden) $('form-save').textContent = editing ? 'Salvar alterações' : 'Salvar produto';
    }
  }

  /* ---------- Rotas ---------- */
  function onRoute(hash) {
    if (!hash.startsWith('#produtos')) return;
    const parts = hash.split('/');
    if (parts.length === 1) { dirty = false; showView('list'); loadList(); }
    else if (parts.length === 2 && parts[1] === 'novo') openForm(null);
    else if (parts.length === 3 && parts[1] === 'editar') openForm(parts[2]);
    else location.hash = '#produtos';
  }

  // Apaga tudo o que foi carregado quando a pessoa sai da conta.
  function clearAll() {
    listToken++; formToken++;
    products = []; categories = []; editing = null; sizeState = new Map();
    dirty = false; saving = false; pendingNotice = null; statusFilter = 'todos'; search = '';
    $('prod-list').replaceChildren();
    $('prod-status').textContent = '';
    $('prod-search').value = '';
    $('prod-form').reset();
    $('prod-form').hidden = true;
    $('size-chips').replaceChildren();
    $('size-rows').replaceChildren();
    $('form-message').textContent = '';
    $('form-status').textContent = '';
    document.querySelectorAll('[data-count]').forEach(s => { s.textContent = '0'; });
    document.querySelectorAll('.tab').forEach(t => {
      const on = t.dataset.status === 'todos';
      t.classList.toggle('active', on);
      t.setAttribute('aria-pressed', String(on));
    });
    showView('list');
  }

  /* ---------- Ligações ---------- */
  function guardLeave(e) {
    if (dirty && !window.confirm('Descartar as alterações que ainda não foram salvas?')) e.preventDefault();
  }

  $('prod-form').addEventListener('submit', onSubmit);
  $('prod-form').addEventListener('input', () => { dirty = true; });
  $('f-descricao').addEventListener('input', updateCounter);
  $('form-back').addEventListener('click', guardLeave);
  $('form-cancel').addEventListener('click', guardLeave);
  $('prod-search').addEventListener('input', e => { search = e.target.value; renderList(); });
  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    statusFilter = t.dataset.status;
    document.querySelectorAll('.tab').forEach(x => {
      x.classList.toggle('active', x === t);
      x.setAttribute('aria-pressed', String(x === t));
    });
    renderList();
  }));

  Panel.routeHandlers.push(onRoute);
  Panel.clearHandlers.push(clearAll);
})();
