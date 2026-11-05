/* Leitura pública das condições e dos meios habilitados pela administração. */
(() => {
  'use strict';
  const config = window.LumePagamentoConfig;
  const settings = window.LUME_SUPABASE || {};
  const base = String(settings.url || '').replace(/\/+$/, '');
  let data = {...config.defaults};
  let ready = false;
  let configAvailable = false;
  const $ = id => document.getElementById(id);

  function render() {
    const credit = config.creditTerms(data);
    const active = configAvailable ? config.activeMethods(data) : [];
    const creditActive = active.includes('credito');
    const labels = active.map(method => config.methods[method] + (method === 'credito' ? ` em ${credit}` : ''));
    const summary = labels.length > 1 ? labels.slice(0, -1).join(', ') + ' e ' + labels.at(-1) : labels[0];
    const notice = !creditActive && data.aviso_geral === config.defaults.aviso_geral
      ? 'A loja informará o total antes da confirmação.' : data.aviso_geral;
    document.querySelectorAll('input[name="forma-pagamento"]').forEach(radio => {
      const enabled = active.includes(radio.value);
      radio.disabled = !enabled;
      if (!enabled) radio.checked = false;
      radio.closest('.payment-option').hidden = !enabled;
    });
    document.querySelectorAll('[data-payment-credit]').forEach(el => { el.textContent = `Crédito • ${credit}`; });
    const help = $('payment-help');
    if (help) help.textContent = `${active.length ? 'Escolha sua preferência.' : 'Pagamento a combinar pelo WhatsApp.'}${creditActive ? ` Crédito em ${credit}.` : ''} ${notice} ${config.security}`;
    for (const method of Object.keys(config.methods)) {
      document.querySelectorAll(`[data-payment-text="${method}"]`).forEach(el => {
        const text = active.includes(method) ? data[method + '_texto'] : '';
        el.textContent = text ? `${config.methods[method]}: ${text}` : '';
        el.hidden = !text;
      });
    }
    document.querySelectorAll('[data-payment-summary]').forEach(el => {
      el.textContent = summary || 'Pagamento a combinar pelo WhatsApp';
    });
    document.querySelectorAll('[data-payment-policy]').forEach(el => {
      el.textContent = summary ? `Aceitamos ${summary}.` : 'As formas de pagamento serão combinadas com a loja pelo WhatsApp.';
    });
    document.querySelectorAll('[data-payment-shopping]').forEach(el => {
      el.textContent = active.length
        ? 'Confira itens e quantidades, selecione a entrega e escolha uma forma de pagamento disponível.'
        : 'Confira itens e quantidades, selecione a entrega e combine o pagamento com a loja pelo WhatsApp.';
    });
    document.querySelectorAll('[data-payment-notice]').forEach(el => { el.textContent = notice; });
    const meta = document.querySelector('meta[data-payment-description]');
    if (meta) meta.content = summary || 'Pagamento a combinar com a loja pelo WhatsApp';
  }
  async function load() {
    let loaded = false;
    try {
      if (!/^https:\/\/[\w-]+\.supabase\.co$/.test(base) || !String(settings.publishableKey || '').startsWith('sb_publishable_'))
        throw Error('Conexão indisponível');
      const response = await fetch(`${base}/rest/v1/loja_pagamentos?id=eq.1&select=${config.columns}`, {
        headers: {apikey: settings.publishableKey, Accept: 'application/json'},
        cache: 'no-store', signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw Error('Condições indisponíveis');
      const rows = await response.json();
      if (!Array.isArray(rows) || !rows[0]) throw Error('Configuração ausente');
      data = config.validate(rows[0]);
      configAvailable = true;
      loaded = true;
    } catch (_) {
      data = {...config.defaults};
      configAvailable = false;
    }
    render();
    document.querySelectorAll('[data-payment-status]').forEach(el => {
      el.textContent = loaded ? '' : 'Não foi possível consultar as formas de pagamento. Combine as condições com a loja pelo WhatsApp.';
    });
    ready = true;
    document.dispatchEvent(new Event('lume:pagamentos-carregados'));
    return {loaded};
  }
  window.LumePagamentos = {
    getPedido: method => configAvailable ? config.orderLabel(data, method) : null,
    hasMethods: () => configAvailable && config.activeMethods(data).length > 0,
    isReady: () => ready
  };
  render();
  window.LUME_PAGAMENTOS_READY = load();
})();
