/* Condições comerciais compartilhadas pelo painel e pela vitrine.
   Os três meios são fixos. Este módulo não processa pagamentos. */
(() => {
  'use strict';
  const defaults = Object.freeze({
    pix_ativo: true,
    credito_ativo: true,
    debito_ativo: true,
    credito_parcelas: 3,
    credito_sem_juros: true,
    pix_texto: '',
    credito_texto: 'parcelas a confirmar',
    debito_texto: '',
    aviso_geral: 'A loja informará o total e cada parcela antes da confirmação.'
  });
  const columns = Object.keys(defaults).join(',');
  const methods = Object.freeze({pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito'});
  const security = 'Não envie número completo, CVV ou senha do cartão pelo WhatsApp.';

  function validate(value) {
    if (!value || !Number.isInteger(value.credito_parcelas) || value.credito_parcelas < 1 || value.credito_parcelas > 12)
      throw Error('Informe de 1 a 12 parcelas para o crédito.');
    if (typeof value.credito_sem_juros !== 'boolean') throw Error('Revise a condição de juros do crédito.');
    const clean = {credito_parcelas: value.credito_parcelas, credito_sem_juros: value.credito_sem_juros};
    for (const method of Object.keys(methods)) {
      const field = method + '_ativo';
      if (typeof value[field] !== 'boolean') throw Error('Selecione quais formas de pagamento serão exibidas na vitrine.');
      clean[field] = value[field];
    }
    for (const name of ['pix_texto', 'credito_texto', 'debito_texto', 'aviso_geral']) {
      if (typeof value[name] !== 'string' || [...value[name].trim()].length > 240)
        throw Error('Use até 240 caracteres em cada texto de pagamento.');
      clean[name] = value[name].trim();
    }
    if (!clean.aviso_geral) throw Error('Preencha a orientação geral de pagamento.');
    return clean;
  }
  const creditTerms = data => `até ${data.credito_parcelas}x ${data.credito_sem_juros ? 'sem juros' : 'com juros'}`;
  const activeMethods = data => Object.keys(methods).filter(method => data[method + '_ativo'] === true);
  function orderLabel(data, method) {
    if (!Object.hasOwn(methods, method) || data[method + '_ativo'] !== true) return null;
    const conditions = [method === 'credito' ? creditTerms(data) : '', data[method + '_texto']].filter(Boolean).join('; ');
    return methods[method] + (conditions ? ` (${conditions})` : '');
  }
  window.LumePagamentoConfig = Object.freeze({defaults, columns, methods, security, validate, creditTerms, activeMethods, orderLabel});
})();
