/* V10.6 — extensão da personalização, respeitando o painel autenticado. */
(() => {
 'use strict';
 const P=window.LumePanel=window.LumePanel||{routeHandlers:[],clearHandlers:[]};
 const $=id=>document.getElementById(id);
 const defaults={banner_zoom:100,banner_x:50,banner_y:50,sobre_titulo:'Conheça a Lume Woman',sobre_texto:'Uma loja de moda feminina com curadoria e atendimento próximo.',sobre_foto_caminho:null,depoimentos:[]};
 let original={...defaults},loaded=false,token=0,busy=false,photoFile=null;
 const fields=['banner_zoom','banner_x','banner_y'];
 const editor=$('tema-depoimentos-editor');
 function addEditor(d={},i=0){
  const box=document.createElement('div');box.className='v106-depoimento';box.dataset.index=i;
  box.innerHTML=`<strong>Depoimento ${i+1}</strong><div class="field"><label>Nome da cliente<input class="v106-nome" maxlength="80"/></label></div><div class="field"><label>Relato real<textarea class="v106-texto" maxlength="500" rows="3"></textarea></label></div><div class="field"><label>Foto da cliente ou do produto (opcional)<input class="v106-foto" type="file" accept="image/jpeg,image/png,image/webp"/></label></div><label class="switch"><input class="v106-autorizado" type="checkbox"/> Tenho autorização para publicar</label><label class="switch"><input class="v106-publicado" type="checkbox"/> Exibir na loja</label><label class="switch"><input class="v106-remover-foto" type="checkbox"/> Remover foto anterior</label>`;
  box.querySelector('.v106-nome').value=d.nome||'';box.querySelector('.v106-texto').value=d.texto||'';
  box.querySelector('.v106-autorizado').checked=d.autorizado===true;box.querySelector('.v106-publicado').checked=d.publicado===true;
  box.dataset.photo=d.foto||'';editor.append(box);
 }
 function fill(t){original={...defaults,...t};loaded=true;
  for(const field of fields)$(field==='banner_zoom'?'tema-banner-zoom':field==='banner_x'?'tema-banner-x':'tema-banner-y').value=original[field];
  $('tema-sobre-titulo-input').value=original.sobre_titulo||'';$('tema-sobre-texto-input').value=original.sobre_texto||'';
  $('tema-sobre-foto-input').value='';$('tema-remover-sobre-foto').checked=false;editor.replaceChildren();
  for(let i=0;i<3;i++)addEditor((Array.isArray(original.depoimentos)?original.depoimentos:[])[i]||{},i);
  preview();
 }
 function preview(){
  for(const [id,out] of [['tema-banner-zoom','tema-banner-zoom-valor'],['tema-banner-x','tema-banner-x-valor'],['tema-banner-y','tema-banner-y-valor']])$(out).textContent=$(id).value+'%';
  const img=$('tema-preview-banner-img');img.style.setProperty('--preview-zoom',String(Number($('tema-banner-zoom').value)/100));img.style.setProperty('--preview-x',$('tema-banner-x').value+'%');img.style.setProperty('--preview-y',$('tema-banner-y').value+'%');
 }
 async function upload(file,type){
  if(!file)return null;
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('Foto deve ser JPG, PNG ou WebP com até 5 MB.');
  const img=new Image(),url=URL.createObjectURL(file);
  try{await new Promise((ok,fail)=>{img.onload=ok;img.onerror=fail;img.src=url;});
   const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
   const blob=await new Promise(ok=>canvas.toBlob(ok,'image/webp',.82));if(!blob)throw Error('Não foi possível processar a imagem.');
   const path=`branding/${type}/${crypto.randomUUID()}.webp`,{error}=await P.client.storage.from('Produtos').upload(path,blob,{contentType:'image/webp',upsert:false});if(error)throw error;return path;
  }finally{URL.revokeObjectURL(url);}
 }
 async function load(){const my=++token;loaded=false;
  try{const {data,error}=await P.client.from('loja_tema').select('banner_zoom,banner_x,banner_y,sobre_titulo,sobre_texto,sobre_foto_caminho,depoimentos').eq('id',1).maybeSingle();if(my!==token)return;if(error)throw error;fill(data||{});}
  catch(e){console.warn('Migração V10.6 pendente',e);$('tema-mensagem').textContent='Os novos controles precisam da migração SQL V10.6 no Supabase antes de serem salvos.';}
 }
 function read(){return {banner_zoom:Number($('tema-banner-zoom').value),banner_x:Number($('tema-banner-x').value),banner_y:Number($('tema-banner-y').value),sobre_titulo:$('tema-sobre-titulo-input').value.trim(),sobre_texto:$('tema-sobre-texto-input').value.trim(),sobre_foto_caminho:$('tema-remover-sobre-foto').checked?null:original.sobre_foto_caminho};}
 async function save(){if(!loaded||busy)throw Error("Configurações editoriais não carregadas. Execute a migração SQL V10.6 e recarregue o painel.");busy=true;
  try{const t=read();if(!t.sobre_titulo||!t.sobre_texto)throw Error('Preencha o título e a história da loja.');
   const about=$('tema-sobre-foto-input').files[0];if(about&&!$('tema-remover-sobre-foto').checked)t.sobre_foto_caminho=await upload(about,'sobre');
   const testimonials=[];
   for(const box of editor.children){const name=box.querySelector('.v106-nome').value.trim(),text=box.querySelector('.v106-texto').value.trim();if(!name&&!text)continue;
    if(!name||!text)throw Error('Preencha nome e relato em cada depoimento utilizado.');
    const autorizado=box.querySelector('.v106-autorizado').checked,publicado=box.querySelector('.v106-publicado').checked;if(publicado&&!autorizado)throw Error('Não publique depoimento sem autorização.');
    let foto=box.querySelector('.v106-remover-foto').checked?null:(box.dataset.photo||null),file=box.querySelector('.v106-foto').files[0];if(file)foto=await upload(file,'depoimento');
    testimonials.push({nome:name,texto:text,autorizado,publicado,foto});
   }
   t.depoimentos=testimonials;
   original={...t};return t;
  }catch(e){console.error(e);throw e;}
  finally{busy=false;}
 }
 window.LumeV106ReadAndUpload=save;
 $('tema-form').addEventListener('input',preview);
 $('tema-restaurar').addEventListener('click',()=>{for(const f of fields)$(f==='banner_zoom'?'tema-banner-zoom':f==='banner_x'?'tema-banner-x':'tema-banner-y').value=defaults[f];preview();});
 P.routeHandlers.push(hash=>{if(hash.split('/')[0]==='#personalizar')load();});
 P.clearHandlers.push(()=>{token++;loaded=false;});
})();
