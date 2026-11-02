/* Lume Woman — registro manual de vendas confirmadas. Sem integração com WhatsApp ou baixa automática de estoque. */
(() => {
  'use strict';
  const P = window.LumePanel = window.LumePanel || {client:null,routeHandlers:[],clearHandlers:[]};
  const $ = id => document.getElementById(id);
  const brl = v => Number(v || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  let generation=0, busy=false;
  function status(t){$('vendas-status').textContent=t;}
  function error(t){$('vendas-erro').textContent=t;}
  function money(text){
    let v=String(text).trim().replace(/^R\$\s*/,'').replace(/\s/g,'');
    if(/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(v))v=v.replace(/\./g,'').replace(',','.');
    else if(/^\d+(,\d{1,2})?$/.test(v))v=v.replace(',','.');
    else if(!/^\d+(\.\d{1,2})?$/.test(v))throw Error('Informe um valor válido, como 149,90.');
    const n=Number(v);if(!Number.isFinite(n)||n<=0||n>99999999)throw Error('O valor deve ser maior que zero.');
    return Math.round(n*100)/100;
  }
  function node(tag,text,cls){const el=document.createElement(tag);el.textContent=text;if(cls)el.className=cls;return el;}
  async function load(){
    const token=++generation;if(!P.client)return;
    status('Carregando vendas…');$('vendas-lista').replaceChildren();
    const {data,error:err}=await P.client.from('vendas_manuais').select('id,cliente_nome,telefone,itens_descricao,valor_total,data_venda,observacoes,created_at').order('data_venda',{ascending:false}).order('created_at',{ascending:false}).limit(500);
    if(token!==generation)return;
    if(err){console.error(err);status('Não foi possível carregar as vendas. Confirme se o SQL de instalação foi executado no projeto correto.');return;}
    const rows=data||[],total=rows.reduce((sum,r)=>sum+Number(r.valor_total),0);
    $('vendas-total').textContent=brl(total);$('vendas-count').textContent=String(rows.length);$('vendas-ticket').textContent=brl(rows.length?total/rows.length:0);
    status(rows.length===500?'Exibindo as 500 vendas mais recentes. Os indicadores se referem somente a essas vendas.':`${rows.length} venda(s) confirmada(s) registrada(s).`);
    if(!rows.length){$('vendas-lista').append(node('p','Nenhuma venda registrada ainda.'));return;}
    for(const r of rows){
      const wrap=node('article','', 'venda-item');
      wrap.append(node('strong',`${r.cliente_nome} — ${brl(r.valor_total)}`));
      wrap.append(node('p',`${r.data_venda.split('-').reverse().join('/')} · ${r.telefone||'Sem telefone'}`,'venda-meta'));
      wrap.append(node('p',r.itens_descricao));
      if(r.observacoes)wrap.append(node('p',r.observacoes,'venda-meta'));
      const btn=node('button','Excluir registro');btn.type='button';
      btn.addEventListener('click',async()=>{
        if(!confirm(`Excluir o registro da venda de ${r.cliente_nome}? Essa ação não pode ser desfeita.`))return;
        btn.disabled=true;
        const result=await P.client.from('vendas_manuais').delete().eq('id',r.id).select('id');
        if(result.error||!result.data?.length){alert('Não foi possível excluir. Confira suas permissões.');btn.disabled=false;return;}
        await load();
      });
      wrap.append(btn);$('vendas-lista').append(wrap);
    }
  }
  $('vendas-form').addEventListener('submit',async e=>{
    e.preventDefault();if(busy||!P.client)return;error('');
    let value;try{value=money($('venda-valor').value);}catch(ex){error(ex.message);return;}
    const payload={cliente_nome:$('venda-cliente').value.trim(),telefone:$('venda-telefone').value.trim()||null,itens_descricao:$('venda-itens').value.trim(),valor_total:value,data_venda:$('venda-data').value,observacoes:$('venda-notas').value.trim()||null};
    if(!payload.cliente_nome||!payload.itens_descricao||!payload.data_venda){error('Preencha os campos obrigatórios.');return;}
    busy=true;$('vendas-salvar').disabled=true;status('Registrando venda…');
    try{
      const {data, error:err}=await P.client.from('vendas_manuais').insert(payload).select('id').single();
      if(err||!data)throw err||Error('Sem confirmação de gravação');
      $('vendas-form').reset();$('venda-data').value=new Date().toLocaleDateString('en-CA');
      await load();status('Venda registrada com sucesso.');
    }catch(ex){console.error(ex);error('Não foi possível registrar a venda. Confira a conexão e as permissões no Supabase.');status('Falha ao salvar.');}
    finally{busy=false;$('vendas-salvar').disabled=false;}
  });
  $('vendas-atualizar').addEventListener('click',load);
  P.routeHandlers.push(hash=>{if(hash.split('/')[0]==='#vendas'){$('venda-data').value||=new Date().toLocaleDateString('en-CA');load();}});
  P.clearHandlers.push(()=>{generation++;$('vendas-lista').replaceChildren();$('vendas-form').reset();$('vendas-total').textContent=brl(0);$('vendas-count').textContent='0';$('vendas-ticket').textContent=brl(0);error('');status('');});
})();
