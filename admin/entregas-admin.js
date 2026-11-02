/* Lume Woman V7 — Gerenciamento de entregas. As alterações exigem RLS de admin. */
(() => {
  'use strict';
  const P = window.LumePanel = window.LumePanel || { client:null, routeHandlers:[], clearHandlers:[] };
  const $ = id => document.getElementById(id);
  const fields = {
    correios_ativo:'ent-correios-ativo', local_ativo:'ent-local-ativo', retirada_ativa:'ent-retirada-ativa',
    regiao_local:'ent-regiao', texto_local:'ent-texto-local', texto_correios:'ent-texto-correios',
    texto_retirada:'ent-texto-retirada', aviso_geral:'ent-aviso-geral'
  };
  const defaults = {
    correios_ativo:true, local_ativo:true, retirada_ativa:true,
    regiao_local:'Entrega na região', taxa_local:null, referencia_correios:null,
    texto_local:'Consulte disponibilidade e valor conforme o endereço.',
    texto_correios:'Frete cotado pelas proprietárias com base no CEP. O valor final depende da postagem.',
    texto_retirada:'Local e horário serão combinados com a loja.',
    aviso_geral:'Disponibilidade de estoque, valor do frete, prazo e pagamento serão confirmados pelo WhatsApp.'
  };
  const allowed = 'id,correios_ativo,local_ativo,retirada_ativa,regiao_local,taxa_local,referencia_correios,texto_local,texto_correios,texto_retirada,aviso_geral,updated_at';
  let loaded=false, busy=false, requestId=0;
  const moneyStr=v=>v===null||v===undefined?'':Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  function setStatus(t){$('ent-status').textContent=t||'';}
  function setError(t){$('ent-message').textContent=t||'';}
  function fill(data){
    const d={...defaults,...data};
    for(const [key,id] of Object.entries(fields)){
      const el=$(id);
      if(el.type==='checkbox')el.checked=d[key]===true;
      else el.value=d[key]??'';
    }
    $('ent-taxa-local').value=moneyStr(d.taxa_local);
    $('ent-correios-referencia').value=moneyStr(d.referencia_correios);
  }
  function parseMoney(value,label){
    let s=String(value||'').trim().replace(/^R\$\s*/i,'').replace(/\s/g,'');
    if(!s)return null;
    if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(s))s=s.replace(/\./g,'').replace(',','.');
    else if(/^\d+(,\d{1,2})?$/.test(s))s=s.replace(',','.');
    else if(!/^\d+(\.\d{1,2})?$/.test(s))throw Error(`Revise ${label}. Use, por exemplo, 12,50.`);
    const amount=Number(s);
    if(!Number.isFinite(amount)||amount<0||amount>9999.99)throw Error(`${label}: informe um valor de R$ 0,00 a R$ 9.999,99.`);
    return amount;
  }
  function read(){
    const d={};
    for(const [key,id] of Object.entries(fields)){
      const el=$(id);d[key]=el.type==='checkbox'?el.checked:el.value.trim();
    }
    d.taxa_local=parseMoney($('ent-taxa-local').value,'a taxa de entrega local');
    d.referencia_correios=parseMoney($('ent-correios-referencia').value,'a referência de frete dos Correios');
    if(!d.local_ativo&&!d.correios_ativo&&!d.retirada_ativa)throw Error('Ative pelo menos uma modalidade de entrega ou retirada.');
    if(!d.regiao_local||d.regiao_local.length>120)throw Error('Informe a região de entrega (até 120 caracteres).');
    for(const key of ['texto_local','texto_correios','texto_retirada','aviso_geral']){
      if(!d[key]||d[key].length>240)throw Error('Preencha as instruções de entrega (até 240 caracteres por campo).');
    }
    return d;
  }
  async function load(){
    const current=++requestId;loaded=false;$('ent-form').hidden=true;setError('');setStatus('Carregando opções de entrega…');
    if(!P.client){setStatus('Faça login novamente para abrir as entregas.');return;}
    try{
      const {data,error}=await P.client.from('loja_entregas').select(allowed).eq('id',1).maybeSingle();
      if(current!==requestId)return;
      if(error)throw error;
      if(!data)throw Error('A tabela está sem a linha inicial.');
      fill(data);loaded=true;$('ent-form').hidden=false;
      setStatus('Configuração carregada. As alterações só valem depois de salvar.');
    }catch(e){
      if(current!==requestId)return;
      console.error('Entregas: falha de leitura',e);
      setStatus('Não foi possível carregar. Verifique se o SQL da Etapa 7 foi executado no laboratório.');
    }
  }
  async function save(e){
    e.preventDefault();if(!loaded||busy||!P.client)return;
    let d;
    try{d=read();}catch(e){setError(e.message);return;}
    busy=true;$('ent-save').disabled=true;setError('');setStatus('Salvando no banco…');
    try{
      const {data,error}=await P.client.from('loja_entregas').update({...d,updated_at:new Date().toISOString()}).eq('id',1).select('id,updated_at').maybeSingle();
      if(error)throw error;
      if(!data)throw Error('O banco não confirmou a gravação. Confira suas permissões.');
      setStatus('Entregas salvas. Atualize a vitrine de testes para conferir.');
    }catch(e){
      console.error('Entregas: falha de gravação',e);
      setStatus('Não foi possível salvar as entregas.');
      setError('Confira a conexão e as permissões da tabela loja_entregas no Supabase.');
    }finally{busy=false;$('ent-save').disabled=false;}
  }
  $('ent-form').addEventListener('submit',save);
  $('ent-recarregar').addEventListener('click',load);
  P.routeHandlers.push(hash=>{if(hash.split('/')[0]==='#entregas')load();});
  P.clearHandlers.push(()=>{requestId++;loaded=false;$('ent-form').hidden=true;setError('');setStatus('');});
})();
