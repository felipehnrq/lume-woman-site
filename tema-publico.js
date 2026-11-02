/* Lume Woman V10.2 - tema publico com logo sem flash e cache entre paginas. */
(() => {
 'use strict';
 const CACHE_KEY = 'lume_woman_logo_publica';
 const defaults = {
   cor_destaque:'#b67b68', cor_fundo:'#fffdfa', cor_texto:'#29221f', fonte:'original', grade:3,
   titulo_linha1:'Vista a sua', titulo_linha2:'melhor versão.',
   subtitulo:'Peças casuais e sociais para se sentir confiante, elegante e você mesma. Escolha com calma, combine do seu jeito e peça direto pelo WhatsApp.',
   chamada:'Looks para acompanhar você em todos os momentos.', logo_caminho:null, banner_caminho:null
 };
 const hex = s => typeof s === 'string' && /^#[0-9a-fA-F]{6}$/.test(s) ? s : null;
 const validPath=(p,type)=>typeof p==='string' && new RegExp('^branding/'+type+'/[A-Za-z0-9_.-]+$').test(p);
 const $=id=>document.getElementById(id);
 const cfg=window.LUME_SUPABASE || {};
 const base=String(cfg.url||'').replace(/\/+$/,'');
 const key=String(cfg.publishableKey||'');
 const validConfig=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base) && key.startsWith('sb_publishable_');
 let currentLogo=null;
 function photo(path,type){
   if(!validPath(path,type)||!validConfig)return null;
   return `${base}/storage/v1/object/public/Produtos/${path.split('/').map(encodeURIComponent).join('/')}`;
 }
 function getCache(){try{const p=localStorage.getItem(CACHE_KEY);return validPath(p,'logo')?p:null;}catch(_){return null;}}
 function setCache(path){try{if(validPath(path,'logo'))localStorage.setItem(CACHE_KEY,path);else localStorage.removeItem(CACHE_KEY);}catch(_){}}
 function ready(){document.documentElement.classList.add('lume-logo-settled');}
 function applyLogo(path){
   const url=photo(path,'logo');currentLogo=validPath(path,'logo')?path:null;
   document.querySelectorAll('[data-theme-logo]').forEach(img=>{
     const fallback=img.parentElement?.querySelector('[data-theme-logo-fallback]');
     if(!fallback)return;
     img.onload=null;img.onerror=null;
     if(!url){img.hidden=true;img.removeAttribute('src');fallback.hidden=false;ready();return;}
     if(img.getAttribute('src')===url && img.complete && img.naturalWidth>0){img.hidden=false;fallback.hidden=true;ready();return;}
     img.hidden=true;fallback.hidden=true; // nunca exibe a antiga marca ao aguardar a imagem
     img.onload=()=>{if(img.getAttribute('src')!==url)return;img.hidden=false;fallback.hidden=true;ready();};
     img.onerror=()=>{if(img.getAttribute('src')!==url)return;img.hidden=true;fallback.hidden=false;ready();};
     img.src=url;
     if(img.complete && img.naturalWidth>0){img.hidden=false;fallback.hidden=true;ready();}
   });
 }
 function apply(t){
   const root=document.documentElement;
   root.style.setProperty('--clay',hex(t.cor_destaque)||defaults.cor_destaque);
   root.style.setProperty('--paper',hex(t.cor_fundo)||defaults.cor_fundo);
   root.style.setProperty('--ink',hex(t.cor_texto)||defaults.cor_texto);
   document.body.classList.toggle('tema-classico',t.fonte==='classico');
   document.body.classList.toggle('tema-moderno',t.fonte==='moderno');
   const grid=$('products');
   if(grid){grid.classList.toggle('tema-grade-2',Number(t.grade)===2);grid.classList.toggle('tema-grade-4',Number(t.grade)===4);}
   for(const [id,k] of [['tema-titulo1','titulo_linha1'],['tema-titulo2','titulo_linha2'],['tema-descricao','subtitulo'],['tema-chamada','chamada']]){
     const node=$(id);if(node && typeof t[k]==='string')node.textContent=t[k];
   }
   applyLogo(t.logo_caminho);
   setCache(t.logo_caminho);
   const banner=$('tema-banner'),bannerURL=photo(t.banner_caminho,'banner');
   if(banner){banner.src=bannerURL||'assets/hero.svg';banner.onerror=()=>{banner.onerror=null;banner.src='assets/hero.svg';};}
 }
 async function start(){
   const cached=getCache();if(cached)applyLogo(cached); // cache local evita aguardar consulta em novas paginas
   if(!validConfig){if(!cached)applyLogo(null);return;}
   try{
     const res=await fetch(`${base}/rest/v1/loja_tema?id=eq.1&select=cor_destaque,cor_fundo,cor_texto,fonte,grade,titulo_linha1,titulo_linha2,subtitulo,chamada,logo_caminho,banner_caminho`,{
       headers:{apikey:key,Accept:'application/json'},cache:'no-store'});
     if(!res.ok)throw new Error(`HTTP ${res.status}`);
     const data=await res.json();
     if(Array.isArray(data)&&data[0])apply({...defaults,...data[0]});
     else if(!cached)applyLogo(null);
   }catch(_){
     if(!cached)applyLogo(null);
     console.warn('Tema indisponivel; mantendo a ultima logo conhecida ou marca escrita.');
   }
 }
 start();
 window.addEventListener('pageshow',event=>{if(event.persisted)start();});
 window.addEventListener('storage',event=>{if(event.key===CACHE_KEY){const p=getCache();if(p!==currentLogo)applyLogo(p);}});
})();
