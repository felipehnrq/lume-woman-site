/* Lume Woman V10.2 - logo oficial no painel sem exibir a antiga durante o carregamento. */
(() => {
 'use strict';
 const CACHE_KEY='lume_woman_logo_publica';
 const cfg=window.LUME_SUPABASE||{};
 const base=String(cfg.url||'').replace(/\/+$/,'');
 const key=String(cfg.publishableKey||'');
 const validConfig=/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)&&key.startsWith('sb_publishable_');
 const validPath=p=>typeof p==='string'&&/^branding\/logo\/[A-Za-z0-9_.-]+$/.test(p);
 let known=null;
 function getCache(){try{const p=localStorage.getItem(CACHE_KEY);return validPath(p)?p:null;}catch(_){return null;}}
 function setCache(path){try{if(validPath(path))localStorage.setItem(CACHE_KEY,path);else localStorage.removeItem(CACHE_KEY);}catch(_){}}
 function setLogo(path){
   known=validPath(path)?path:null;
   const url=known&&validConfig?`${base}/storage/v1/object/public/Produtos/${known.split('/').map(encodeURIComponent).join('/')}`:null;
   document.querySelectorAll('#view-login .logo, #view-panel .panel-header .logo').forEach(node=>{
     const fallback=node.querySelector('[data-theme-logo-fallback]');if(!fallback)return;
     let img=node.querySelector('.admin-logo-img');
     if(!url){if(img)img.remove();fallback.hidden=false;document.documentElement.classList.add('lume-logo-settled');return;}
     fallback.hidden=true;
     if(!img){img=document.createElement('img');img.className='admin-logo-img';img.alt='Lume Woman';img.hidden=true;node.appendChild(img);}
     if(img.src===url&&img.complete&&img.naturalWidth>0){img.hidden=false;document.documentElement.classList.add('lume-logo-settled');return;}
     img.hidden=true;
     img.onload=()=>{if(img.src!==url)return;img.hidden=false;fallback.hidden=true;document.documentElement.classList.add('lume-logo-settled');};
     img.onerror=()=>{if(img.src!==url)return;img.hidden=true;fallback.hidden=false;document.documentElement.classList.add('lume-logo-settled');};
     img.src=url;
   });
 }
 async function refresh(){
   const cached=getCache();if(cached)setLogo(cached);
   if(!validConfig){if(!cached)setLogo(null);return;}
   try{
     const r=await fetch(`${base}/rest/v1/loja_tema?id=eq.1&select=logo_caminho`,{headers:{apikey:key,Accept:'application/json'},cache:'no-store'});
     if(!r.ok)throw new Error(`HTTP ${r.status}`);
     const d=await r.json();if(Array.isArray(d)&&d.length){setCache(d[0].logo_caminho);setLogo(d[0].logo_caminho);}else if(!cached)setLogo(null);
   }catch(_){if(!cached)setLogo(null);}
 }
 window.addEventListener('lume-tema-salvo',e=>{const p=e.detail?.logo_caminho;setCache(p);setLogo(p);});
 window.addEventListener('storage',e=>{if(e.key===CACHE_KEY)setLogo(getCache());});
 refresh();
})();
