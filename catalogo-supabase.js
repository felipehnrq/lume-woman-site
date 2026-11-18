/* LUME WOMAN — Catálogo público do Supabase (laboratório).
   Somente Project URL e publishable key, já usados no painel.
   NÃO colocar secret key, service_role ou senhas neste arquivo.
   Requisições sem sessão: papel anon, sujeito a GRANTs e RLS do banco.
*/
(() => {
  'use strict';
  const settings = window.LUME_SUPABASE || {};
  const base = String(settings.url || '').replace(/\/$/, '');
  const key = String(settings.publishableKey || '');
  const bucket = 'Produtos'; // Respeitar maiúscula do bucket real.

  async function read(table, params, withRange=false) {
    const endpoint = `${base}/rest/v1/${table}?${new URLSearchParams(params)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { apikey: key, Accept: 'application/json', ...(withRange ? {Prefer:'count=exact'} : {}) },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      // Nunca expor tokens, detalhes SQL ou credenciais na tela pública.
      throw new Error(`Falha ao consultar ${table} (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`Formato de resposta inesperado: ${table}`);
    if(!withRange)return data;
    const match=/\/(\d+)$/.exec(response.headers?.get('content-range') || '');
    return {data,total:match ? Number(match[1]) : null};
  }

  async function readAll(table, params) {
    const rows=[];
    let offset=0, expectedTotal=null;
    while(offset<50000){
      const {data:page,total}=await read(table,{...params,limit:'500',offset:String(offset)},true);
      if(expectedTotal!==null && total!==null && total!==expectedTotal)throw new Error('Catálogo mudou durante a leitura.');
      if(total!==null)expectedTotal=total;
      rows.push(...page);offset+=page.length;
      if(expectedTotal!==null && offset>=expectedTotal)return rows;
      if(!page.length){
        if(expectedTotal!==null && offset<expectedTotal)throw new Error('Resposta parcial do catálogo.');
        return rows;
      }
      // Sem contagem, só página vazia comprova o fim; respeita limites menores da API.
    }
    throw new Error('Catálogo excede o limite de leitura.');
  }

  function photoUrl(path) {
    if (typeof path !== 'string' || !path || path.includes('..') || path.startsWith('/')) return null;
    const safePath = path.split('/').map(encodeURIComponent).join('/');
    return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${safePath}`;
  }

  async function loadCatalog() {
    if (!/^https:\/\/[\w-]+\.supabase\.co$/i.test(base) || !key.startsWith('sb_publishable_')) {
      throw new Error('Conexão do catálogo não configurada.');
    }
    // A consulta de tamanhos pede apenas colunas públicas; NÃO pede estoque.
    // As políticas RLS filtrarão produtos desativados e tamanhos esgotados.
    const [products, categories, sizes, photos] = await Promise.all([
      readAll('produtos', { select:'id,codigo,nome,preco,destaque,descricao,etiqueta,categoria_id,created_at,publicado', publicado:'eq.true', order:'created_at.desc.nullslast,id.asc' }),
      readAll('categorias', { select:'id,nome', ativa:'eq.true', order:'id.asc' }),
      readAll('produto_tamanhos', { select:'produto_id,tamanho,ordem', order:'produto_id.asc,ordem.asc,tamanho.asc' }),
      readAll('produto_imagens', { select:'produto_id,caminho,ordem', order:'produto_id.asc,ordem.asc,id.asc' })
    ]);
    const categoriesById = new Map(categories.map(c => [String(c.id), String(c.nome || '')]));
    const sizesByProduct = new Map();
    sizes.forEach(s => {
      if (!sizesByProduct.has(s.produto_id)) sizesByProduct.set(s.produto_id, []);
      sizesByProduct.get(s.produto_id).push(String(s.tamanho));
    });
    const photosByProduct = new Map();
    photos.forEach(photo => {
      const url = photoUrl(photo.caminho);
      if (!url) return;
      if (!photosByProduct.has(photo.produto_id)) photosByProduct.set(photo.produto_id, []);
      photosByProduct.get(photo.produto_id).push(url);
    });
    return window.LumeCatalogPolicy.sortProducts(products.filter(p=>p.publicado===true)).map(p => {
      const imagens = photosByProduct.get(p.id) || [];
      return {
        id:String(p.codigo || p.id), publicId:String(p.id), nome:String(p.nome || ''),
        created_at:p.created_at ?? null, publicado:true,
        categoria:categoriesById.get(String(p.categoria_id)) || 'Coleção',
        preco:Number(p.preco), destaque:String(p.destaque || ''),
        descricao:String(p.descricao || ''), etiqueta:String(p.etiqueta || ''),
        tamanhos:sizesByProduct.get(p.id) || [],
        imagem:imagens[0] || 'assets/sem-foto.svg',
        imagens:imagens,
        semFoto:imagens.length===0
      };
    }).filter(p=>p.nome && Number.isFinite(p.preco) && p.preco>=0 && p.imagens.length>0);
  }
  // Reutiliza exclusivamente as colunas públicas existentes. Nunca consulta estoque.
  window.LUME_REFRESH_SIZES = async () => {
    return readAll('produto_tamanhos',{
      select:'produto_id,tamanho,ordem',order:'produto_id.asc,ordem.asc,tamanho.asc'
    });
  };
  // Ordem editorial definida no painel; sem seleção, a seção de destaques fica oculta.
  window.LUME_FEATURED_READY = read('loja_tema', {
    select:'produtos_destaque',id:'eq.1'
  }).then(rows => Array.isArray(rows[0]?.produtos_destaque) ? rows[0].produtos_destaque : [],
          error => { console.warn('Destaques indisponíveis',error);return []; });
  window.LUME_CATALOG_READY = loadCatalog().then(data => ({data}), error => ({error}));
})();
