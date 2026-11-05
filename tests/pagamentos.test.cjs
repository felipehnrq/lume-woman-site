const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = {window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../pagamentos.js'), 'utf8'), context);
const config = context.window.LumePagamentoConfig;

test('contrato de pagamento mantém somente Pix, crédito e débito e preserva os padrões', () => {
  assert.deepEqual(Object.keys(config.methods), ['pix','credito','debito']);
  assert.equal(config.orderLabel(config.defaults, 'pix'), 'Pix');
  assert.equal(config.orderLabel(config.defaults, 'credito'), 'Cartão de crédito (até 3x sem juros; parcelas a confirmar)');
  assert.equal(config.orderLabel(config.defaults, 'debito'), 'Cartão de débito');
  for (const unknown of ['boleto','toString','__proto__','']) assert.equal(config.orderLabel(config.defaults, unknown), null);
  for (const method of Object.keys(config.methods)) {
    assert.equal(config.orderLabel({...config.defaults, [method+'_ativo']:false}, method), null);
  }
  assert.deepEqual(Array.from(config.activeMethods({...config.defaults, credito_ativo:false, debito_ativo:false})), ['pix']);
  assert.deepEqual(Array.from(config.activeMethods({...config.defaults, pix_ativo:false, credito_ativo:false, debito_ativo:false})), []);
});

test('validação rejeita condições inválidas e aceita os limites de parcelas e de texto', () => {
  for (const credito_parcelas of [0,13,1.5,NaN,'3']) assert.throws(() => config.validate({...config.defaults, credito_parcelas}));
  assert.throws(() => config.validate({...config.defaults, credito_sem_juros:'true'}));
  assert.throws(() => config.validate({...config.defaults, pix_ativo:'true'}));
  assert.throws(() => config.validate({...config.defaults, credito_ativo:null}));
  assert.throws(() => config.validate({...config.defaults, debito_ativo:undefined}));
  assert.throws(() => config.validate({...config.defaults, aviso_geral:'   '}));
  assert.throws(() => config.validate({...config.defaults, pix_texto:'a'.repeat(241)}));
  assert.throws(() => config.validate({...config.defaults, debito_texto:null}));
  assert.equal(config.validate({...config.defaults, credito_parcelas:1}).credito_parcelas,1);
  assert.equal(config.validate({...config.defaults, credito_parcelas:12}).credito_parcelas,12);
  assert.equal(config.validate({...config.defaults, pix_texto:'😀'.repeat(240)}).pix_texto,'😀'.repeat(240));
  assert.equal(config.validate({...config.defaults, pix_texto:'  À vista  '}).pix_texto,'À vista');
});
