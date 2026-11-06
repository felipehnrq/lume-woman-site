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

  async function read(table, params) {
    const endpoint = `${base}/rest/v1/${table}?${new URLSearchParams(params)}`;
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: { apikey: key, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      // Nunca expor tokens, detalhes SQL ou credenciais na tela pública.
      throw new Error(`Falha ao consultar ${table} (HTTP ${response.status}).`);
    }
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`Formato de resposta inesperado: ${table}`);
    return data;
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
      read('produtos', { select:'id,codigo,nome,preco,destaque,descricao,etiqueta,categoria_id', publicado:'eq.true', order:'created_at.desc' }),
      read('categorias', { select:'id,nome', ativa:'eq.true' }),
      read('produto_tamanhos', { select:'produto_id,tamanho,ordem', order:'ordem.asc' }),
      read('produto_imagens', { select:'produto_id,caminho,ordem', order:'ordem.asc' })
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
    return products.map(p => {
      const imagens = photosByProduct.get(p.id) || [];
      return {
        id:String(p.codigo || p.id), publicId:String(p.id), nome:String(p.nome || ''),
        categoria:categoriesById.get(String(p.categoria_id)) || 'Coleção',
        preco:Number(p.preco), destaque:String(p.destaque || ''),
        descricao:String(p.descricao || ''), etiqueta:String(p.etiqueta || ''),
        tamanhos:sizesByProduct.get(p.id) || [],
        imagem:imagens[0] || 'assets/sem-foto.svg',
        imagens:imagens,
        semFoto:imagens.length===0
      };
    }).filter(p=>p.nome && Number.isFinite(p.preco) && p.preco>=0);
  }
  // Reutiliza exclusivamente as colunas públicas existentes. Nunca consulta estoque.
  window.LUME_REFRESH_SIZES = async () => {
    const rows = [];
    // Paginação evita interpretar o limite da Data API como tamanhos removidos.
    for (let offset = 0; ; offset += 500) {
      const page = await read('produto_tamanhos', {
        select:'produto_id,tamanho,ordem', order:'produto_id.asc,ordem.asc,tamanho.asc',
        limit:'500', offset:String(offset)
      });
      rows.push(...page);
      if (page.length < 500) return rows;
      if (offset >= 49500) throw new Error('Catálogo excede o limite de atualização.');
    }
  };
  window.LUME_CATALOG_READY = loadCatalog().then(data => ({data}), error => ({error}));
})();
