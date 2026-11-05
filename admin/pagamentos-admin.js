/* O painel controla a interface; a autorização de gravação é feita pelo RLS. */
(() => {
  'use strict';
  const P = window.LumePanel = window.LumePanel || {client: null, routeHandlers: [], clearHandlers: []};
  const config = window.LumePagamentoConfig;
  const $ = id => document.getElementById(id);
  let loaded = false, busy = false, requestId = 0;
  const status = text => { $('pag-status').textContent = text; };
  const message = text => { $('pag-message').textContent = text; };
  function fill(data) {
    for (const name of Object.keys(config.defaults)) {
      const el = $('pag-' + name);
      if (el.type === 'checkbox') el.checked = data[name];
      else el.value = data[name];
    }
  }
  function read() {
    const data = {};
    for (const name of Object.keys(config.defaults)) {
      const el = $('pag-' + name);
      data[name] = el.type === 'checkbox' ? el.checked : el.value.trim();
    }
    data.credito_parcelas = Number(data.credito_parcelas);
    return config.validate(data);
  }
  async function load() {
    if (busy) return;
    const current = ++requestId;
    loaded = false; $('pag-form').hidden = true; message(''); status('Carregando condições de pagamento…');
    if (!P.client) { status('Entre novamente para abrir os pagamentos.'); return; }
    try {
      const {data, error} = await P.client.from('loja_pagamentos').select(config.columns).eq('id', 1).maybeSingle();
      if (current !== requestId) return;
      if (error) throw error;
      fill(config.validate(data));
      loaded = true; $('pag-form').hidden = false;
      status('Condições carregadas. As alterações só valem depois de salvar.');
    } catch (_) {
      if (current !== requestId) return;
      status('Não foi possível carregar as condições de pagamento.');
      message('Verifique a conexão, suas permissões e se a configuração de pagamentos foi preparada no banco.');
    }
  }
  async function save(event) {
    event.preventDefault();
    if (!loaded || busy || !P.client) return;
    let values;
    try { values = read(); } catch (error) { message(error.message); return; }
    const current = requestId;
    busy = true; $('pag-save').disabled = true; $('pag-reload').disabled = true;
    message(''); status('Salvando condições…');
    try {
      const {data, error} = await P.client.from('loja_pagamentos').update(values).eq('id', 1).select(config.columns).maybeSingle();
      if (current !== requestId) return;
      if (error || !data) throw Error('Gravação não confirmada');
      fill(config.validate(data));
      status('Condições salvas. Atualize a vitrine e a página de pagamentos para conferir.');
    } catch (_) {
      if (current !== requestId) return;
      status('Não foi possível salvar as condições.');
      message('A gravação não foi confirmada. Verifique a conexão e sua permissão administrativa e tente novamente.');
    } finally {
      if (current === requestId) {
        busy = false; $('pag-save').disabled = false; $('pag-reload').disabled = false;
      }
    }
  }
  $('pag-form').addEventListener('submit', save);
  $('pag-reload').addEventListener('click', load);
  $('pag-defaults').addEventListener('click', () => {
    if (!loaded || busy) return;
    fill(config.defaults); message(''); status('Padrões preenchidos. Salve para confirmar a alteração.');
  });
  P.routeHandlers.push(hash => { if (hash.split('/')[0] === '#pagamentos') load(); });
  P.clearHandlers.push(() => {
    requestId++; loaded = false; busy = false;
    $('pag-form').reset(); $('pag-form').hidden = true;
    $('pag-save').disabled = false; $('pag-reload').disabled = false;
    status(''); message('');
  });
})();
