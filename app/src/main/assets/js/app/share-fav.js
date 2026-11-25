/* v38 Favorites for Daily data + My portfolio (by share code) and My data (by row).
   - Small star next to the share name. Favorite shares / rows are listed first.
   - Cards page uses its own per-card favourites (engine.js); this file only wires the other pages. */
(function(){
  const K='ds_fav_sh_v1';let m={};try{m=JSON.parse(localStorage.getItem(K)||'{}')||{}}catch(e){}
  const nz=c=>String(c==null?'':c).trim().toUpperCase();
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const save=()=>{try{localStorage.setItem(K,JSON.stringify(m))}catch(e){}};
  window.__shFav={
    has:c=>!!m[nz(c)],
    btn:c=>{const k=nz(c);if(!k)return '';const on=!!m[k];return '<button type="button" class="fvb shf'+(on?' on':'')+'" data-sfc="'+esc(k)+'" title="'+(on?'Remove favorite':'Favorite (show first)')+'" aria-label="Favorite">'+(on?'★':'☆')+'</button>'},
    first:(a,f)=>{if(!Object.keys(m).length)return a;const y=[],n=[];a.forEach(x=>(m[nz(f(x))]?y:n).push(x));return y.concat(n)}
  };
  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('button.fvb');if(!b)return;
    if(b.dataset.sfc){e.stopPropagation();e.preventDefault();const k=b.dataset.sfc;if(m[k])delete m[k];else m[k]=1;save();
      window.dispatchEvent(new Event('dsfav'));try{gnToast(m[k]?'★ '+k+' · favorite, shown first':k+' removed from favorites')}catch(x){}return}
    if(b.dataset.k&&b.closest('#shBody')){e.stopPropagation();e.preventDefault();
      try{const on=favSet(b.dataset.k);try{sortRows()}catch(x){}renderShow();try{gnToast(on?'★ Favorite · shown first':'Favorite removed')}catch(x){}}catch(x){console.error('fav',x)}}
  },true);
  const st=document.createElement('style');
  st.textContent='.fvb.shf,#shBody .fvb{border:0;background:transparent;color:inherit;font-size:.66rem;line-height:1;padding:0 1px;margin-left:3px;vertical-align:middle;cursor:pointer;opacity:.5;width:auto;height:auto;min-width:0}.fvb.shf.on,#shBody .fvb.on{color:#f5b301;opacity:1}';
  document.head.appendChild(st);
})();
