/* Datas de cadastro e primeira publicação têm finalidades distintas. */
((root) => {
  'use strict';
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  function timestamp(value) {
    // Exige horário e fuso explícitos; nunca interpreta data local como publicação.
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
  function newest(field) {
    return (a,b) => {
      const x=timestamp(a[field]), y=timestamp(b[field]);
      if(x===null && y!==null)return 1;
      if(y===null && x!==null)return -1;
      return (x===null ? 0 : y-x) || compareId(a,b);
    };
  }
  function sortProducts(rows) { return rows.slice().sort(newest('created_at')); }
  function isNew(product, now=Date.now()) {
    const first=timestamp(product.first_published_at);
    return product.publicado===true && first!==null && first<=now && now-first<WEEK;
  }
  function newProducts(rows, now=Date.now()) { return rows.filter(p=>isNew(p,now)).sort(newest('first_published_at')); }
  const policy={sortProducts,isNew,newProducts};
  if(typeof module==='object' && module.exports)module.exports=policy;
  else root.LumeCatalogPolicy=policy;
})(typeof window==='object' ? window : globalThis);
