/* Market cards: used when the loaded data is a DSE market snapshot (columns Name, Cat, Company, Price, Change %, Volume, Market Cap, P/E, Div Yield).
   render() in pages/projects.js calls mktIs() and mktCards(rows). Green = up, red = down, grey = unchanged. */
(function(){
  const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const col=n=>header.findIndex(h=>String(h).trim().toLowerCase()===n.toLowerCase());
  window.mktIs=function(){
    try{return header.length>=8&&col('Change %')>=0&&col('Market Cap')>=0&&col('Company')>=0&&col('Price')>=0&&map.n>=0&&map.p>=0}catch(e){return false}
  };
  /* volume with commas; market cap is in BDT million -> shown as mn / bn */
  const sh=v=>{const x=num(v);return x===null?'':x.toLocaleString('en-US')};
  const mc=v=>{const x=num(v);if(x===null)return '';
    return x>=1000?(x/1000).toLocaleString('en-US',{maximumFractionDigits:1})+' bn':x.toLocaleString('en-US',{maximumFractionDigits:1})+' mn'};
  window.mktCards=function(list,base){
    const iN=map.n,iP=map.p,iV=map.q,iC=col('Change %'),iM=col('Market Cap'),iE=col('P/E'),iY=col('Div Yield'),iK=col('Cat'),iCo=col('Company');
    return list.map((r,k)=>{
      const g=i=>i>=0?String(r[i]??'').trim():'';
      const ch=num(g(iC)),dir=ch===null||ch===0?'flat':(ch>0?'up':'dn');
      const chT=ch===null?'':((ch>0?'+':'')+ch.toFixed(2)+'%');
      const arrow=dir==='up'?'▲':dir==='dn'?'▼':'●';
      const cat=g(iK);
      const st=[['Volume',sh(g(iV))],['Mkt cap',mc(g(iM))],['P/E',g(iE)],['Yield',g(iY)?g(iY)+'%':'']];
      return `<div class="item mk mk-${dir}" data-i="${base+k}">
 <div class="mk-top"><div class="mk-id"><span class="mk-code">${esc(g(iN))}</span>${cat?`<span class="mk-cat mk-c${esc(cat)}" title="DSE category ${esc(cat)}">${esc(cat)}</span>`:''}</div>
  <div class="mk-px"><b>${esc(g(iP))}</b>${chT?`<span class="mk-chg">${arrow} ${esc(chT)}</span>`:''}</div></div>
 <div class="mk-co" title="${esc(g(iCo))}">${esc(g(iCo))}</div>
 <div class="mk-st">${st.map(([l,v])=>`<div><small>${l}</small><span>${v?esc(v):'–'}</span></div>`).join('')}</div>
</div>`}).join('');
  };
})();
