/* V10.6: dados públicos opcionais. Sem migração, a vitrine continua funcional. */
(() => {
 'use strict';
 const cfg=window.LUME_SUPABASE||{}, base=String(cfg.url||'').replace(/\/+$/,''), key=String(cfg.publishableKey||'');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key.startsWith('sb_publishable_'))return;
 const $=id=>document.getElementById(id);
 const photo=path=>typeof path==='string'&&/^branding\/(sobre|depoimento)\/[\w.-]+$/.test(path)?`${base}/storage/v1/object/public/Produtos/${path.split('/').map(encodeURIComponent).join('/')}`:null;
 const clamp=(n,min,max,def)=>Number.isFinite(Number(n))?Math.max(min,Math.min(max,Number(n))):def;
 async function load(){
  try{
   const res=await fetch(`${base}/rest/v1/loja_tema?id=eq.1&select=banner_zoom,banner_x,banner_y,sobre_titulo,sobre_texto,sobre_foto_caminho,depoimentos`,{headers:{apikey:key,Accept:'application/json'},cache:'no-store'});
   if(!res.ok)return;const [t]=await res.json();if(!t)return;
   const hero=$('tema-banner');if(hero){hero.style.setProperty('--hero-zoom',String(clamp(t.banner_zoom,100,180,100)/100));hero.style.setProperty('--hero-position-x',`${clamp(t.banner_x,0,100,50)}%`);hero.style.setProperty('--hero-position-y',`${clamp(t.banner_y,0,100,50)}%`);}
   if(typeof t.sobre_titulo==='string'&&t.sobre_titulo.trim())$('tema-sobre-titulo').textContent=t.sobre_titulo;
   if(typeof t.sobre_texto==='string'&&t.sobre_texto.trim())$('tema-sobre-texto').textContent=t.sobre_texto;
   const about=photo(t.sobre_foto_caminho), img=$('tema-sobre-foto');if(about){img.src=about;img.hidden=false;img.onerror=()=>{img.hidden=true;};}
   const data=Array.isArray(t.depoimentos)?t.depoimentos:[], section=$('depoimentos'),grid=$('tema-depoimentos');
   for(const d of data.slice(0,6)){
    if(!d||d.publicado!==true||d.autorizado!==true||!String(d.nome||'').trim()||!String(d.texto||'').trim())continue;
    const card=document.createElement('article');card.className='social-testimonial';const url=photo(d.foto);
    if(url){const picture=document.createElement('img');picture.src=url;picture.alt='Foto autorizada enviada por cliente';picture.loading='lazy';picture.onerror=()=>picture.remove();card.append(picture);}
    const quote=document.createElement('blockquote');quote.textContent=String(d.texto).slice(0,500);const name=document.createElement('small');name.textContent='— '+String(d.nome).slice(0,80);card.append(quote,name);grid.append(card);
   }
   section.hidden=!grid.children.length;
  }catch(e){console.warn('Conteúdo editorial opcional indisponível',e);}
 }
 load();
})();
