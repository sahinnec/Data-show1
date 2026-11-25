/* v38 Appearance (Settings > Appearance): button colour, font and text size. Saved on this phone (ds_appear_v1). */
(function(){
  const K='ds_appear_v1',$=id=>document.getElementById(id);
  const COL=[['','Colorful'],['#2563eb','Blue'],['#0a8f4d','Green'],['#7c3aed','Purple'],['#db2777','Pink'],['#ea580c','Orange'],['#0891b2','Teal'],['#dc2626','Red'],['#334155','Slate']];
  const FONT=[['','Default'],['system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif','Sans'],['Georgia,"Times New Roman",serif','Serif'],['ui-monospace,Menlo,Consolas,"Courier New",monospace','Mono'],['ui-rounded,"Trebuchet MS","Segoe UI",sans-serif','Rounded']];
  const SIZE=[['90','Small'],['100','Normal'],['110','Large'],['120','Extra large']];
  let A={col:'',font:'',size:'100'};try{A=Object.assign(A,JSON.parse(localStorage.getItem(K)||'{}'))}catch(e){}
  const st=document.createElement('style');st.id='apStyle';document.head.appendChild(st);
  const save=()=>{try{localStorage.setItem(K,JSON.stringify(A))}catch(e){}};
  function apply(){
    let c='',x=A.col;
    if(x&&/^#[0-9a-f]{6}$/i.test(x))c=':root{--ac:'+x+'!important}'+
      '#docAddMenu .scan4 button,#homeBox .hm-ban button,#homeBox .hm-grid button{--cc:'+x+'!important}'+
      '#stL label svg{color:'+x+'!important}#docPlus i{background:'+x+'!important;box-shadow:0 6px 16px '+x+'66!important}'+
      '#stUp,#tlGo{background:'+x+'!important;border-color:'+x+'!important}#stS .tlh b,#stL h4{color:'+x+'!important}#stS #stB,#stS #stR{color:'+x+'!important;border-color:'+x+'!important}';
    if(A.font)c+='body,button,input,select,textarea{font-family:'+A.font+'!important}';
    if(A.size&&A.size!=='100')c+='html{font-size:'+A.size+'%!important}';
    st.textContent=c;
  }
  const sw=(v,l)=>'<button type="button" class="apsw'+((A.col||'')===v?' on':'')+'" data-ap="col" data-v="'+v+'" style="'+(v?'background:'+v:'background:conic-gradient(#2563eb,#7c3aed,#db2777,#ea580c,#0a8f4d,#2563eb)')+'" title="'+l+'" aria-label="'+l+'"></button>';
  const opt=(a,sel)=>a.map(([v,l])=>'<option value="'+v.replace(/"/g,'&quot;')+'"'+(sel===v?' selected':'')+'>'+l+'</option>').join('');
  function build(){
    let h=$('stA');if(!h){const L=$('stL');if(!L)return;h=document.createElement('div');h.id='stA';L.parentNode.insertBefore(h,L)}
    h.innerHTML='<h4>Appearance</h4><div class="apr"><span>Button colour</span><div class="apsws">'+COL.map(([v,l])=>sw(v,l)).join('')+'<input type="color" id="apCu" value="'+(A.col||'#2563eb')+'" aria-label="Custom colour"></div></div>'+
      '<div class="apr"><span>Font</span><select id="apF">'+opt(FONT,A.font)+'</select></div>'+
      '<div class="apr"><span>Text size</span><select id="apZ">'+opt(SIZE,A.size||'100')+'</select></div>'+
      '<div class="apr"><button type="button" id="apRs" class="apreset">Reset appearance</button></div>';
  }
  document.addEventListener('click',e=>{
    const b=e.target.closest&&e.target.closest('.apsw[data-ap="col"]');if(b){A.col=b.dataset.v;save();apply();build();return}
    if(e.target.id==='apRs'){A={col:'',font:'',size:'100'};save();apply();build()}
  });
  document.addEventListener('input',e=>{if(e.target.id==='apCu'){A.col=e.target.value;save();apply();document.querySelectorAll('.apsw').forEach(x=>x.classList.remove('on'))}});
  document.addEventListener('change',e=>{if(e.target.id==='apF'){A.font=e.target.value;save();apply()}else if(e.target.id==='apZ'){A.size=e.target.value;save();apply()}});
  const css=document.createElement('style');
  css.textContent='#stA{padding:4px 14px 0}#stA h4{margin:12px 0 4px;font-size:.8rem}.apr{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 4px;border-bottom:1px solid var(--bd,#e3e3e3);font-size:.9rem}.apsws{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;align-items:center;max-width:62%}.apsw{width:26px;height:26px;border-radius:50%;border:2px solid var(--bd,#ccc)!important;padding:0!important}.apsw.on{border-color:var(--tx,#111)!important;box-shadow:0 0 0 2px var(--card,#fff) inset}#apCu{width:30px;height:30px;padding:0;border:0;background:none}.apr select{max-width:50%;padding:7px;border-radius:8px;border:1px solid var(--bd,#ccc);background:var(--card,#fff);color:inherit}.apreset{border:1px solid var(--bd,#ccc);background:var(--card,#fff);color:inherit;border-radius:10px;padding:8px 12px;font-size:.85rem}';
  document.head.appendChild(css);
  apply();
  const nb=()=>$('navSet');
  document.addEventListener('click',e=>{if(e.target.closest&&e.target.closest('#navSet'))setTimeout(build,0)},true);
  /* "Settings" in the + menu opens the same page */
  const mo=new MutationObserver(()=>{const s=$('stS');if(s&&s.style.display==='flex'&&!$('stA'))build()});
  const t=setInterval(()=>{const s=$('stS');if(s){clearInterval(t);mo.observe(s,{attributes:true,attributeFilter:['style']})}},300);
})();
