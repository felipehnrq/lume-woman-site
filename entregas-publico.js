/* Lume Woman V7 — Exibe as modalidades editadas no Supabase.
   Não consulta preço ou prazo oficial dos Correios. CEP segue somente pelo WhatsApp;
   nenhum endereço é gravado pelo site. Na falha, bloqueamos o fechamento do pedido até a consulta voltar. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const settings=window.LUME_SUPABASE||{};
  const base=String(settings.url||'').trim().replace(/\/+$/,'');
  const key=String(settings.publishableKey||'').trim();
  const fallback={correios_ativo:false,local_ativo:true,retirada_ativa:true,regiao_local:'Entrega na região',
    taxa_local:null,referencia_correios:null,
    texto_local:'Valor e disponibilidade serão confirmados pela loja.',
    texto_correios:'Frete a consultar com a loja.',
    texto_retirada:'Local e horário serão combinados.',
    aviso_geral:'Frete, prazo, estoque e pagamento sujeitos à confirmação pelo WhatsApp.'};
  let data={...fallback};
  let loaded=false;
  const money=n=>Number(n).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const digits=s=>String(s||'').replace(/\D/g,'');
  const methodInfo=[
    {id:'correios',field:'correios_ativo',label:'Enviar pelos Correios',text:'texto_correios',cost:'referencia_correios'},
    {id:'local',field:'local_ativo',label:'Entrega na região',text:'texto_local',cost:'taxa_local'},
    {id:'retirada',field:'retirada_ativa',label:'Combinar retirada',text:'texto_retirada'}
  ];
  function costText(method){
    if(method.id==='correios')return data.referencia_correios===null?'Frete a cotar com a loja pelo CEP':`Referência: ${money(data.referencia_correios)} (não é cotação final)`;
    if(method.id==='local')return data.taxa_local===null?'Taxa a confirmar com a loja':`Taxa de referência: ${money(data.taxa_local)} (a confirmar)`;
    return 'Sem taxa de frete; combinar a retirada';
  }
  function selected(){return document.querySelector('input[name="entrega"]:checked')?.value||'';}
  function update(){
    const method=methodInfo.find(x=>x.id===selected());
    const wrap=$('entrega-cep-wrap');wrap.hidden=!(method&&method.id==='correios');
    $('entrega-metodo-info').textContent=method?data[method.text]:'';
    $('entrega-aviso-geral').textContent=data.aviso_geral;
    $('entrega-cep-message').textContent='';
  }
  function render(){
    const holder=$('delivery-options');const old=selected();holder.replaceChildren();
    const available=loaded ? methodInfo.filter(m=>data[m.field]===true) : [];
    available.forEach((m,index)=>{
      const row=document.createElement('label');row.className='delivery-method';
      const radio=document.createElement('input');radio.type='radio';radio.name='entrega';radio.value=m.id;
      radio.checked=m.id===old||(!available.some(x=>x.id===old)&&index===0);
      const label=document.createElement('span');label.className='delivery-method-label';
      label.textContent=m.id==='local' ? data.regiao_local : m.label;
      const note=document.createElement('small');note.textContent=costText(m);
      const group=document.createElement('span');group.className='delivery-method-copy';group.append(label,note);
      row.append(radio,group);holder.appendChild(row);
    });
    if(!available.length){holder.textContent=loaded?'Nenhuma forma de entrega ativa. Converse com a loja antes de enviar o pedido.':'Não foi possível confirmar as formas de entrega. Recarregue a página e tente novamente.';}
    $('entrega-config-status').textContent=loaded?'':'Configurações de entrega indisponíveis: confirme as condições diretamente com a loja.';
    update();
  }
  function cepFormat(input){
    const d=digits(input).slice(0,8);
    return d.length>5 ? `${d.slice(0,5)}-${d.slice(5)}` : d;
  }
  function getPedido(){
    if(!loaded)return {ok:false,error:'As opções de entrega não foram carregadas. Recarregue a página para tentar novamente.'};
    const id=selected();const method=methodInfo.find(m=>m.id===id && data[m.field]===true);
    if(!method)return {ok:false,error:'Escolha uma modalidade de entrega ou retirada.',focus:'delivery-options'};
    if(method.id==='correios'){
      const cep=digits($('entrega-cep').value);
      if(!/^\d{8}$/.test(cep)){
        $('entrega-cep-message').textContent='Digite um CEP com 8 números para pedir a cotação.';
        return {ok:false,error:'Informe um CEP válido com 8 números.',focus:'entrega-cep'};
      }
      return {ok:true,method:'Envio pelos Correios',reference:costText(method),cep:`${cep.slice(0,5)}-${cep.slice(5)}`};
    }
    return {ok:true,method:method.id==='local'?data.regiao_local:'Retirada a combinar',reference:costText(method),cep:''};
  }
  async function load(){
    try{
      if(!/^https:\/\/[\w-]+\.supabase\.co$/.test(base)||!key.startsWith('sb_publishable_'))throw Error('Conexão indisponível');
      const q='id=eq.1&select=correios_ativo,local_ativo,retirada_ativa,regiao_local,taxa_local,referencia_correios,texto_local,texto_correios,texto_retirada,aviso_geral';
      const res=await fetch(`${base}/rest/v1/loja_entregas?${q}`,{headers:{apikey:key,Accept:'application/json'},cache:'no-store'});
      if(!res.ok)throw Error(`HTTP ${res.status}`);
      const result=await res.json();
      if(!Array.isArray(result)||!result[0])throw Error('Sem configurações cadastradas');
      data={...fallback,...result[0]};loaded=true;
    }catch(e){console.warn('Entregas: configuração não disponível; usadas opções manuais de segurança.');}
    render();return {loaded};
  }
  $('delivery-options').addEventListener('change',update);
  $('entrega-cep').addEventListener('input',e=>{const next=cepFormat(e.target.value);e.target.value=next;$('entrega-cep-message').textContent='';});
  window.LumeEntregas={getPedido,isReady:()=>loaded};
  window.LUME_ENTREGAS_READY=load().finally(()=>document.dispatchEvent(new Event('lume:entregas-carregadas')));
})();
