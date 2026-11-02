/* ====================================================================
   LUME WOMAN — fotografias de produtos (etapa 3)
   Requer LumePanel.client, produto_imagens e bucket PUBLICO "Produtos".
   A autorizacao de escrita e garantida pelas politicas RLS do Supabase.
   ==================================================================== */
(() => {
  'use strict';
  const Panel = window.LumePanel = window.LumePanel || {client:null,routeHandlers:[],clearHandlers:[]};
  const $ = id => document.getElementById(id);
  const BUCKET = 'Produtos'; // exatamente como criado no Supabase (P maiúsculo)
  const MAX_FILES = 8;
  const MAX_FILE_SIZE = 5 * 1024 * 1024;
  const MAX_SOURCE_SIZE = 20 * 1024 * 1024;
  const MAX_EDGE = 1600;
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const state = {products: [], productId:'', photos:[], staged:[], busy:false, token:0};

  const node = (tag, attrs={}, ...children) => {
    const e = document.createElement(tag);
    for (const [key,value] of Object.entries(attrs)) {
      if (value == null) continue;
      if (key === 'class') e.className = value;
      else if (key === 'text') e.textContent = value;
      else if (key.startsWith('on')) e.addEventListener(key.slice(2), value);
      else if (key === 'disabled') e.disabled = value;
      else e.setAttribute(key, String(value));
    }
    children.flat().forEach(child => {if(child != null) e.append(child);});
    return e;
  };
  const setMessage = (message, error=false) => {
    $('fotos-status').textContent = message || '';
    $('fotos-status').classList.toggle('is-error', !!error);
  };
  const shortError = e => {
    const msg = String((e && e.message) || '');
    if (/row.level|permission|not authorized|forbidden|403|42501/i.test(msg))
      return 'Sem permissão para gerenciar fotos. Confira as políticas do Storage e sua sessão.';
    if (/payload too large|file size|exceed|413/i.test(msg))
      return 'A imagem ultrapassou o limite permitido pelo Supabase (5 MB).';
    if (/unsupported|mime|415/i.test(msg))
      return 'Formato recusado. Utilize JPG, PNG ou WebP.';
    return 'Não foi possível concluir a operação. Verifique a conexão e tente novamente.';
  };
  const identify = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : null;
  const isHere = token => token === state.token && !!Panel.client;

  function dropStaged() {
    state.staged.forEach(item => URL.revokeObjectURL(item.url));
    state.staged = [];
    if ($('fotos-files')) $('fotos-files').value = '';
  }
  function reset() {
    state.token++;
    dropStaged();
    state.products = []; state.productId = ''; state.photos = []; state.busy = false;
    $('fotos-produto').replaceChildren(node('option',{value:'',text:'Selecione um produto…'}));
    $('fotos-galeria').replaceChildren(); $('fotos-previews').replaceChildren();
    $('fotos-operacoes').hidden = true;
    setMessage('');
  }
  function setBusy(busy) {
    state.busy = busy;
    $('fotos-upload').disabled = busy || !state.staged.length;
    $('fotos-files').disabled = busy;
    $('fotos-produto').disabled = busy;
    $('fotos-busy').textContent = busy ? 'Salvando, não feche esta página…' : '';
    renderGallery();
  }
  function productLabel(p) {return `${p.codigo} — ${p.nome}${p.publicado ? '' : ' (desativado)'}`;}

  async function onRoute(hash) {
    if (!hash.startsWith('#fotografias')) return;
    const path = hash.split('/');
    const requestedId = path.length === 2 && UUID.test(path[1]) ? path[1] : state.productId;
    const token = ++state.token;
    dropStaged();
    state.photos = []; state.productId = '';
    setMessage('Carregando produtos…');
    $('fotos-operacoes').hidden = true;
    $('fotos-galeria').replaceChildren(); $('fotos-previews').replaceChildren();
    if (!Panel.client) return;
    try {
      const { data, error } = await Panel.client.from('produtos')
        .select('id,codigo,nome,publicado').order('nome', {ascending:true});
      if (!isHere(token)) return;
      if (error) throw error;
      state.products = data || [];
      const select = $('fotos-produto');
      select.replaceChildren(node('option',{value:'',text:'Selecione um produto…'}));
      state.products.forEach(p => select.append(node('option',{value:p.id,text:productLabel(p)})));
      if (!state.products.length) {
        setMessage('Cadastre primeiro uma peça em Produtos → Novo produto.');
        return;
      }
      const selected = state.products.find(p=>p.id===requestedId);
      select.value = selected ? selected.id : state.products[0].id;
      await loadPhotos(select.value, token);
    } catch (e) {
      if (isHere(token)) { console.error(e); setMessage(shortError(e), true); }
    }
  }

  async function loadPhotos(productId, token=state.token) {
    if (!UUID.test(productId)) return;
    state.productId = productId;
    $('fotos-operacoes').hidden = false;
    $('fotos-editar').href = '#produtos/editar/' + productId;
    setMessage('Carregando fotografias…');
    try {
      const {data,error} = await Panel.client.from('produto_imagens')
        .select('id,produto_id,caminho,ordem,created_at')
        .eq('produto_id',productId).order('ordem',{ascending:true}).order('created_at',{ascending:true});
      if (!isHere(token) || state.productId !== productId) return;
      if (error) throw error;
      state.photos = data || [];
      renderGallery();
      renderStaged();
      setMessage(state.photos.length ? '' : 'Nenhuma fotografia cadastrada para esta peça.');
    } catch(e) {
      if (isHere(token)) {console.error(e);setMessage(shortError(e),true);}
    }
  }

  function imgUrl(path) {
    return Panel.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  function renderGallery() {
    const gallery = $('fotos-galeria');
    gallery.replaceChildren();
    $('fotos-contador').textContent = `${state.photos.length} de ${MAX_FILES} fotografias`;
    if (!state.photos.length) {
      gallery.append(node('p',{class:'hint',text:'As fotos salvas aparecerão aqui.'}));
      return;
    }
    const p = state.products.find(p=>p.id===state.productId);
    state.photos.forEach((photo,index) => {
      const picture = node('img',{
        src:imgUrl(photo.caminho), loading:'lazy', alt:`Foto ${index+1} de ${p?.nome || 'produto'}`
      });
      const controls = node('div',{class:'foto-controls'},
        node('button',{type:'button',class:'btn-outline btn-small',disabled:state.busy || index===0,
          title:'Mover uma posição para cima',onclick:()=>movePhoto(index,-1),text:'← Anterior'}),
        node('button',{type:'button',class:'btn-outline btn-small',disabled:state.busy || index===state.photos.length-1,
          title:'Mover uma posição para baixo',onclick:()=>movePhoto(index,1),text:'Próxima →'}),
        node('button',{type:'button',class:'btn-outline btn-small foto-danger',disabled:state.busy,
          onclick:()=>deletePhoto(photo),text:'Remover'})
      );
      gallery.append(node('article',{class:'foto-card'},
        node('div',{class:'foto-frame'},picture),
        node('p',{class:'foto-position',text:index===0?'Foto principal':`Foto ${index+1}`}),
        controls));
    });
  }

  function renderStaged() {
    const preview = $('fotos-previews');
    preview.replaceChildren();
    $('fotos-upload').disabled = state.busy || !state.staged.length;
    $('fotos-pending-title').hidden = !state.staged.length;
    state.staged.forEach((item,index) => {
      preview.append(node('div',{class:'foto-pending'},
        node('img',{src:item.url,alt:'Prévia da foto '+(index+1)}),
        node('div',{},
          node('p',{text:item.file.name}),
          node('small',{text:(item.file.size/1024/1024).toFixed(1)+' MB · ainda não enviada'}),
          node('button',{type:'button',class:'link-btn',disabled:state.busy,text:'Retirar da seleção',
            onclick:()=>{URL.revokeObjectURL(item.url);state.staged.splice(index,1);renderStaged();}}))));
    });
  }

  function onFilesChange(event) {
    if (state.busy || !state.productId) return;
    let rejected = 0;
    for (const file of Array.from(event.target.files || [])) {
      if (state.photos.length + state.staged.length >= MAX_FILES) {rejected++;continue;}
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size>MAX_SOURCE_SIZE || file.size===0) {
        rejected++;continue;
      }
      state.staged.push({file,url:URL.createObjectURL(file)});
    }
    event.target.value = '';
    renderStaged();
    setMessage(rejected ? `Alguns arquivos foram ignorados. Aceitamos até ${MAX_FILES} fotos por produto, JPG/PNG/WebP, com até 20 MB antes da otimização.` : 'Confira as prévias. Toque em Enviar fotografias para salvar.', !!rejected);
  }

  // Converte para WebP leve, de no máximo 1600 px, antes de enviar.
  function optimize(file) {
    return new Promise((resolve,reject)=>{
      const url = URL.createObjectURL(file);
      const image = new Image();
      image.onload = () => {
        try {
          const ratio = Math.min(1, MAX_EDGE/Math.max(image.naturalWidth,image.naturalHeight));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1,Math.round(image.naturalWidth*ratio));
          canvas.height = Math.max(1,Math.round(image.naturalHeight*ratio));
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('Canvas indisponível');
          ctx.drawImage(image,0,0,canvas.width,canvas.height);
          canvas.toBlob(blob=>{
            URL.revokeObjectURL(url);
            if (!blob) return reject(new Error('Não foi possível otimizar a fotografia.'));
            if (blob.size>MAX_FILE_SIZE) return reject(new Error('Fotografia excede 5 MB mesmo após otimização.'));
            const ext = blob.type==='image/webp' ? 'webp' : blob.type==='image/png' ? 'png' : 'jpg';
            resolve({blob,ext});
          },'image/webp',0.82);
        } catch(e) {URL.revokeObjectURL(url);reject(e);}
      };
      image.onerror = () => {URL.revokeObjectURL(url);reject(new Error('Formato não reconhecido pelo navegador. Tente JPG.'));};
      image.src = url;
    });
  }

  async function uploadPhotos() {
    if (state.busy || !state.productId || !state.staged.length) return;
    if (!identify()) {setMessage('Navegador sem suporte a identificadores seguros. Abra no Chrome atualizado.',true);return;}
    const token = state.token;
    const productId = state.productId;
    const files = state.staged.map(s=>s.file);
    const initialOrder = state.photos.length;
    let completed = 0;
    setBusy(true);
    for (let index=0;index<files.length;index++) {
      if (!isHere(token) || state.productId!==productId) break;
      const file=files[index];
      let path = null;
      try {
        setMessage(`Enviando fotografia ${index+1} de ${files.length}…`);
        const {blob,ext} = await optimize(file);
        if (!isHere(token)) break;
        path = `${productId}/${identify()}.${ext}`;
        const uploaded = await Panel.client.storage.from(BUCKET).upload(path,blob,{contentType:blob.type,upsert:false,cacheControl:'3600'});
        if (uploaded.error) throw uploaded.error;
        const saved = await Panel.client.from('produto_imagens').insert({produto_id:productId,caminho:path,ordem:initialOrder+completed})
          .select('id').single();
        if (saved.error || !saved.data) {
          const cleaned = await Panel.client.storage.from(BUCKET).remove([path]);
          if (cleaned.error) console.error('Objeto órfão, remover manualmente:',path,cleaned.error);
          path = null;
          throw saved.error || new Error('Imagem enviada, mas registro não salvo');
        }
        completed++;
      } catch (e) {
        console.error('Falha no envio de foto',e);
        setMessage(`${completed} foto(s) salva(s). Não foi possível enviar ${file.name}. ${shortError(e)} Tente novamente apenas as fotos restantes.`,true);
        break;
      }
    }
    // As fotos já enviadas são removidas da seleção, evitando duplicações.
    state.staged.splice(0,completed).forEach(item=>URL.revokeObjectURL(item.url));
    setBusy(false);
    if (isHere(token)) {
      await loadPhotos(productId,token);
      renderStaged();
      if (completed===files.length) setMessage(`${completed} fotografia(s) salva(s) com sucesso.`);
      else setMessage(`${completed} de ${files.length} fotografia(s) salva(s). Verifique as restantes antes de reenviar.`,true);
    }
  }

  async function movePhoto(index,delta) {
    if (state.busy) return;
    const next=index+delta;
    if (next<0 || next>=state.photos.length) return;
    const token=state.token,productId=state.productId;
    const reordered=state.photos.slice();
    [reordered[index],reordered[next]]=[reordered[next],reordered[index]];
    setBusy(true);
    setMessage('Salvando ordem…');
    let failure=null;
    for (let i=0;i<reordered.length;i++) {
      if (!isHere(token)) break;
      try {
        const result=await Panel.client.from('produto_imagens').update({ordem:i}).eq('id',reordered[i].id).eq('produto_id',productId).select('id');
        if (result.error || !result.data || result.data.length!==1) throw result.error||new Error('Ordem não atualizada');
      } catch (e) {failure=e;break;}
    }
    setBusy(false);
    if (isHere(token)) {
      await loadPhotos(productId,token);
      setMessage(failure?'Não foi possível salvar toda a ordem. Confira como as fotos ficaram e tente novamente.':'Ordem atualizada. A primeira foto é a principal.',!!failure);
    }
  }

  async function deletePhoto(photo) {
    if (state.busy || !window.confirm('Remover esta fotografia da peça? Esta operação não pode ser desfeita.')) return;
    const token=state.token,productId=state.productId;
    setBusy(true);
    setMessage('Removendo fotografia…');
    try {
      // Remove primeiro o vínculo; assim uma falha no Storage não deixa foto quebrada na galeria.
      const db=await Panel.client.from('produto_imagens').delete().eq('id',photo.id).eq('produto_id',productId).select('id');
      if (db.error || !db.data || db.data.length!==1) throw db.error||new Error('Registro não removido');
      const file=await Panel.client.storage.from(BUCKET).remove([photo.caminho]);
      if (file.error || !Array.isArray(file.data) || file.data.length !== 1) {
        console.error('Foto removida do catálogo, mas objeto ainda está no Storage:',photo.caminho,file.error);
        throw new Error('O vínculo da foto foi removido, mas o arquivo permaneceu no Storage. Peça ajuda para limpar o caminho '+photo.caminho);
      }
      if (isHere(token)) {
        await loadPhotos(productId,token);
        setMessage('Fotografia removida com sucesso.');
      }
    } catch(e) {
      console.error(e);
      if (isHere(token)) {
        await loadPhotos(productId,token);
        setMessage(e.message?.startsWith('O vínculo')?e.message:shortError(e),true);
      }
    } finally {setBusy(false);}
  }

  $('fotos-produto').addEventListener('change', e=>{
    if (state.busy) return;
    const id=e.target.value;
    location.hash=id ? '#fotografias/'+id : '#fotografias';
  });
  $('fotos-files').addEventListener('change',onFilesChange);
  $('fotos-upload').addEventListener('click',uploadPhotos);
  Panel.routeHandlers.push(onRoute);
  Panel.clearHandlers.push(reset);
})();
