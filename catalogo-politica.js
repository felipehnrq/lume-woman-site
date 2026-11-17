/* Ordenação e validade das novidades por data de cadastro. */
((root) => {
  'use strict';
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  function timestamp(value) {
    // Exige horário e fuso explícitos; evita interpretar o cadastro no fuso do navegador.
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
    const [year,month,day]=value.slice(0,10).split('-').map(Number);
    const leap=year%4===0 && (year%100!==0 || year%400===0);
    const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
    if(month<1 || month>12 || day<1 || day>days[month-1] || Number(value.slice(11,13))>23)return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? time : null;
  }
  const compareId = (a,b) => {
    const x=String(a.publicId ?? a.id ?? ''), y=String(b.publicId ?? b.id ?? '');
    return x<y ? -1 : x>y ? 1 : 0;
  };
  function newest(a,b) {
    const x=timestamp(a.created_at), y=timestamp(b.created_at);
    if(x===null && y!==null)return 1;
    if(y===null && x!==null)return -1;
    return (x===null ? 0 : y-x) || compareId(a,b);
  }
  function sortProducts(rows) { return rows.slice().sort(newest); }
  function isNew(product, now=Date.now()) {
    const created=timestamp(product.created_at);
    return product.publicado===true && created!==null && created<=now && now-created<WEEK;
  }
  function newProducts(rows, now=Date.now()) { return rows.filter(p=>isNew(p,now)).sort(newest); }
  const policy={sortProducts,isNew,newProducts,WEEK};
  if(typeof module==='object' && module.exports)module.exports=policy;
  else root.LumeCatalogPolicy=policy;
})(typeof window==='object' ? window : globalThis);
