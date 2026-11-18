/* Editor independente de até quatro destaques, sem alterar cadastro ou estoque. */
(() => {
 'use strict';
 const P=window.LumePanel=window.LumePanel||{client:null,routeHandlers:[],clearHandlers:[]};
 const $=id=>document.getElementById(id);
 const slots=$('destaques-slots'), status=$('destaques-status'), save=$('destaques-salvar');
 let generation=0, busy=false, options=[], selected=[];
 const uuid=v=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
 const distinct=ids=>[...new Set(ids.filter(uuid))].slice(0,4);
 function render(){
   slots.replaceChildren();
   for(let i=0;i<4;i++){
     const label=document.createElement('label');label.className='field';
     label.textContent=(i+1)+'º destaque';
     const select=document.createElement('select');select.setAttribute('aria-label',(i+1)+'º destaque');
     const empty=document.createElement('option');empty.value='';empty.textContent='Nenhum produto';select.append(empty);
     for(const p of options){
       if(selected.includes(p.id)&&selected[i]!==p.id)continue;
       const option=document.createElement('option');option.value=p.id;option.textContent=p.nome+' ('+p.codigo+')';select.append(option);
     }
     select.value=selected[i]||'';
     select.addEventListener('change',()=>{
       const old=selected.slice();old[i]=select.value;
       selected=distinct(old);
       render();status.textContent='Alterações ainda não salvas.';
     });
     label.append(select);slots.append(label);
   }
 }
 async function load(){
   const token=++generation;status.textContent='Carregando destaques…';save.disabled=true;
   try{
     const [a,b]=await Promise.all([
       P.client.from('produtos').select('id,codigo,nome').eq('publicado',true).order('nome'),
       P.client.from('loja_tema').select('produtos_destaque').eq('id',1).single()
     ]);
     if(token!==generation)return;
     if(a.error)throw a.error;if(b.error)throw b.error;
     options=a.data||[];
     const valid=new Set(options.map(p=>p.id));
     selected=distinct(Array.isArray(b.data?.produtos_destaque)?b.data.produtos_destaque:[]).filter(id=>valid.has(id));
     render();status.textContent='Escolha até quatro peças e salve.';save.disabled=false;
   }catch(e){if(token!==generation)return;console.error(e);status.textContent='Não foi possível carregar os destaques. Confira se a atualização do banco foi aplicada.';}
 }
 save.addEventListener('click',async()=>{
   if(busy)return;
   busy=true;save.disabled=true;status.textContent='Salvando destaques…';
   try{
     const {data,error}=await P.client.from('loja_tema').update({produtos_destaque:selected}).eq('id',1).select('produtos_destaque').single();
     if(error)throw error;
     if(JSON.stringify(data.produtos_destaque)!==JSON.stringify(selected))throw Error('A ordem não foi confirmada pelo banco.');
     status.textContent='Destaques publicados. Atualize a loja para conferir.';
   }catch(e){console.error(e);status.textContent='Falha ao salvar. Nenhuma alteração foi confirmada.';}
   finally{busy=false;save.disabled=false;}
 });
 P.routeHandlers.push(hash=>{if(hash==='#produtos')load();});
 P.clearHandlers.push(()=>{generation++;options=[];selected=[];slots.replaceChildren();status.textContent='';save.disabled=true;});
})();
