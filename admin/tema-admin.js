/* Lume Woman V6 — edição do tema no painel. A proteção de escrita é RLS no Supabase. */
(() => {
  'use strict';
  const P=window.LumePanel=window.LumePanel||{client:null,routeHandlers:[],clearHandlers:[]};
  const $=id=>document.getElementById(id);
  const defaults={
    cor_destaque:'#b67b68',cor_fundo:'#fffdfa',cor_texto:'#29221f',fonte:'original',grade:3,
    titulo_linha1:'Vista a sua',titulo_linha2:'melhor versão.',
    subtitulo:'Peças casuais e sociais para se sentir confiante, elegante e você mesma. Escolha com calma, combine do seu jeito e peça direto pelo WhatsApp.',
    chamada:'Looks para acompanhar você em todos os momentos.',logo_caminho:null,banner_caminho:null
  };
  let state={...defaults}, loaded=false, busy=false, token=0;
  let localLogo=null, localBanner=null;
  const paths={cor_destaque:'tema-cor-destaque',cor_fundo:'tema-cor-fundo',cor_texto:'tema-cor-texto',fonte:'tema-fonte',grade:'tema-grade',titulo_linha1:'tema-linha1',titulo_linha2:'tema-linha2',subtitulo:'tema-subtitulo',chamada:'tema-chamada-input'};
  const hex=v=>typeof v==='string'&&/^#[0-9a-fA-F]{6}$/.test(v);
  const validPath=(s,type)=>typeof s==='string' && new RegExp('^branding/'+type+'/[a-zA-Z0-9_.-]+$').test(s);
  const settings=window.LUME_SUPABASE||{};
  const base=String(settings.url||'').replace(/\/+$/,'');
  function fileUrl(path,type){
    if(!validPath(path,type)||!/^https:\/\/[\w-]+\.supabase\.co$/.test(base))return '';
    return `${base}/storage/v1/object/public/Produtos/${path.split('/').map(encodeURIComponent).join('/')}`;
  }
  function setStatus(msg){$('tema-status').textContent=msg||'';}
  function message(msg){$('tema-mensagem').textContent=msg||'';}
  function fill(t){
    state={...defaults,...t};
    for(const [field,id] of Object.entries(paths))$(id).value=state[field];
    $('tema-remover-logo').checked=false;
    $('tema-remover-banner').checked=false;
    $('tema-logo-input').value='';$('tema-banner-input').value='';
    resetLocal();preview();
  }
  function resetLocal(){if(localLogo)URL.revokeObjectURL(localLogo);if(localBanner)URL.revokeObjectURL(localBanner);localLogo=null;localBanner=null;}
  function read(){
    const t={};for(const [k,id] of Object.entries(paths))t[k]=$(id).value;
    t.grade=Number(t.grade);
    t.logo_caminho=$('tema-remover-logo').checked?null:state.logo_caminho;
    t.banner_caminho=$('tema-remover-banner').checked?null:state.banner_caminho;
    return t;
  }
  function preview(){
    const t=read();const box=$('tema-preview');
    box.style.setProperty('--pv-accent',hex(t.cor_destaque)?t.cor_destaque:defaults.cor_destaque);
    box.style.setProperty('--pv-bg',hex(t.cor_fundo)?t.cor_fundo:defaults.cor_fundo);
    box.style.setProperty('--pv-fg',hex(t.cor_texto)?t.cor_texto:defaults.cor_texto);
    box.classList.toggle('tema-preview-classico',t.fonte==='classico');
    box.classList.toggle('tema-preview-moderno',t.fonte==='moderno');
    $('tema-preview-l1').textContent=t.titulo_linha1;
    $('tema-preview-l2').textContent=t.titulo_linha2;
    $('tema-preview-desc').textContent=t.subtitulo;
    const urlLogo=$('tema-remover-logo').checked?'':(localLogo||fileUrl(t.logo_caminho,'logo'));
    const imgLogo=$('tema-preview-logo-img');imgLogo.hidden=!urlLogo;
    $('tema-preview-logo-text').hidden=!!urlLogo;
    if(urlLogo)imgLogo.src=urlLogo;else imgLogo.removeAttribute('src');
    const urlBanner=$('tema-remover-banner').checked?'':(localBanner||fileUrl(t.banner_caminho,'banner'));
    $('tema-preview-banner-img').src=urlBanner||'../assets/hero.svg';
  }
  function validate(t){
    if(!hex(t.cor_destaque)||!hex(t.cor_fundo)||!hex(t.cor_texto))return 'Selecione cores válidas.';
    if(!['original','classico','moderno'].includes(t.fonte))return 'Escolha um estilo de fonte.';
    if(![2,3,4].includes(t.grade))return 'Escolha uma organização de produtos.';
    for(const [k,max] of [['titulo_linha1',65],['titulo_linha2',65],['subtitulo',280],['chamada',120]]){
      if(!t[k].trim()||t[k].length>max)return 'Revise os textos de apresentação; eles não podem ficar vazios.';
    }
    return '';
  }
  async function load(){
    const t=++token;setStatus('Carregando configurações…');$('tema-form').hidden=true;
    try{
      const {data,error}=await P.client.from('loja_tema').select('*').eq('id',1).maybeSingle();
      if(t!==token)return;
      if(error)throw error;
      if(!data)throw new Error('Nenhuma configuração encontrada. Execute primeiro o SQL da Etapa 6.');
      loaded=true;fill(data);$('tema-form').hidden=false;setStatus('');message('');
    }catch(e){console.error('Configuração visual indisponível',e);setStatus('Não consegui carregar a personalização. Confira se o SQL da Etapa 6 foi executado no laboratório.');}
  }
  function checkFile(file){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw Error('Escolha uma imagem JPG, PNG ou WebP.');
    if(file.size>5*1024*1024)throw Error('A imagem original deve ter no máximo 5 MB.');
    return file;
  }
  function updateLocal(which){
    const input=$(which==='logo'?'tema-logo-input':'tema-banner-input');
    const file=input.files&&input.files[0];
    try{
      if(file)checkFile(file);
      const old=which==='logo'?localLogo:localBanner;
      if(old)URL.revokeObjectURL(old);
      const next=file?URL.createObjectURL(file):null;
      if(which==='logo'){localLogo=next;if(file)$('tema-remover-logo').checked=false;}
      else {localBanner=next;if(file)$('tema-remover-banner').checked=false;}
      message('');preview();
    }catch(e){input.value='';message(e.message);}
  }
  async function optimize(file,limit){
    const url=URL.createObjectURL(file);
    try{
      const image=new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(Error('Não foi possível abrir a imagem.'));image.src=url;});
      const scale=Math.min(1,limit/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',0.84));
      if(!blob||blob.size>5*1024*1024)throw Error('Não foi possível otimizar a imagem para 5 MB. Tente outra foto.');
      return blob;
    }finally{URL.revokeObjectURL(url);}
  }
  async function upload(file,type){
    checkFile(file);
    const bytes=await optimize(file,type==='logo'?1000:1920);
    const ident=crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.floor(Math.random()*1000000)}`;
    const path=`branding/${type}/${ident}.webp`;
    const {error}=await P.client.storage.from('Produtos').upload(path,bytes,{contentType:'image/webp',upsert:false});
    if(error)throw Error(`Falha no envio de ${type}. Verifique a política Storage: ${error.message}`);
    return path;
  }
  async function save(ev){
    ev.preventDefault();if(busy||!loaded)return;
    const t=read();const issue=validate(t);if(issue){message(issue);return;}
    busy=true;$('tema-salvar').disabled=true;message('');setStatus('Enviando alterações…');
    try{
      const logo=$('tema-logo-input').files?.[0];
      const banner=$('tema-banner-input').files?.[0];
      // Se houver falha após upload, a foto pode ficar sem referência; sem sobrescrever a anterior.
      if(logo&&!$('tema-remover-logo').checked)t.logo_caminho=await upload(logo,'logo');
      if(banner&&!$('tema-remover-banner').checked)t.banner_caminho=await upload(banner,'banner');
      const {data,error}=await P.client.from('loja_tema').update({...t,updated_at:new Date().toISOString()}).eq('id',1).select('id,updated_at').maybeSingle();
      if(error)throw error;
      if(!data)throw Error('O banco não confirmou a gravação da configuração.');
      fill(t);window.dispatchEvent(new CustomEvent('lume-tema-salvo',{detail:{logo_caminho:t.logo_caminho}}));setStatus('Visual publicado com sucesso. Abra a loja e atualize a página para conferir.');
      message('');
    }catch(e){console.error(e);message('Não foi possível salvar. '+(String(e.message||'').includes('permission')?'Confira sua permissão no Supabase.':String(e.message||'Verifique a conexão.')));
      setStatus('');
    }finally{busy=false;$('tema-salvar').disabled=false;}
  }
  function restore(){
    fill(defaults);message('Valores originais restaurados somente na prévia. Toque em Salvar para publicar.');
  }
  $('tema-form').addEventListener('submit',save);
  $('tema-form').addEventListener('input',preview);
  $('tema-logo-input').addEventListener('change',()=>updateLocal('logo'));
  $('tema-banner-input').addEventListener('change',()=>updateLocal('banner'));
  $('tema-restaurar').addEventListener('click',restore);
  P.routeHandlers.push(hash=>{if(hash.split('/')[0]==='#personalizar')load();});
  P.clearHandlers.push(()=>{token++;loaded=false;resetLocal();$('tema-form').hidden=true;message('');setStatus('');});
})();
