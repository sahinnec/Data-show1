/* Live web preview: the in-app browser (Android) stays alive when you go to Home / Show / Cards ...
   Here: (1) a "Continue" tile in the Show page preview area while the browser is still running,
         (2) window.__navTo(tab) used by the browser's own bottom menu, (3) window.__liveRefresh() called when the app comes back. */
(function(){
  const A=()=>window.Android;
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const host=u=>{try{return new URL(u).hostname.replace(/^www\./,'')}catch(e){return u}};
  function tile(){
    let b=document.getElementById('pvLive');
    if(!b){const rc=document.getElementById('pvRecent');if(!rc||!rc.parentNode)return null;
      b=document.createElement('div');b.id='pvLive';rc.parentNode.insertBefore(b,rc)}
    return b}
  /* No "Continue" tile any more: the Preview itself stays as it is. Tapping the empty Preview box brings the running browser back. */
  function refresh(){
    const b0=document.getElementById('pvLive');if(b0){b0.style.display='none';b0.innerHTML=''}
    return;
    const b=tile();if(!b)return;
    let u='';try{if(A()&&A().browserLive)u=String(A().browserLive()||'')}catch(e){}
    if(!u){b.style.display='none';b.innerHTML='';return}
    b.style.cssText='display:flex;align-items:center;gap:8px;margin:8px 0;padding:10px 12px;border:1px solid var(--bd);border-radius:12px;background:var(--card);color:var(--tx)';
    b.innerHTML='<div style="flex:1;min-width:0"><b style="display:block">🌐 '+esc(host(u))+'</b><small style="display:block;color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+esc(u)+'</small></div>'
      +'<button type="button" id="pvLiveGo" style="border:0;border-radius:10px;padding:8px 12px;background:var(--ac);color:#fff;font-weight:700">▶ Continue</button>'
      +'<button type="button" id="pvLiveX" aria-label="Close web preview" style="border:1px solid var(--bd);border-radius:10px;padding:8px 10px;background:transparent;color:var(--mut)">✕</button>';
    document.getElementById('pvLiveGo').onclick=()=>{try{A().resumeBrowser()}catch(e){}};
    document.getElementById('pvLiveX').onclick=()=>{try{A().closeBrowser()}catch(e){}setTimeout(refresh,400)};
  }
  window.__liveRefresh=refresh;
  try{const pb=document.getElementById('pvBody');if(pb)pb.addEventListener('click',e=>{if(pb.classList.contains('empty')&&A()&&A().browserLive&&A().browserLive()){try{A().resumeBrowser()}catch(x){}}})}catch(e){}
  /* browser bottom menu -> same tab buttons as the app's own bottom menu */
  window.__navTo=function(t){
    try{const b=document.querySelector('#docBottom [data-nav="'+t+'"]');if(b){b.click();setTimeout(refresh,50);return}}catch(e){}
    try{setTab(t)}catch(e){}
    setTimeout(refresh,50)};
  /* wrap setTab so the tile is up to date every time the Show page is opened */
  try{const _s=window.setTab;if(typeof _s==='function'&&!_s.__lv){const w=function(t){const r=_s.apply(this,arguments);if(t==='scrap')refresh();return r};w.__lv=1;window.setTab=w}}catch(e){}
  ['focus','pageshow'].forEach(ev=>window.addEventListener(ev,()=>setTimeout(refresh,150)));
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(refresh,150)});
  setTimeout(refresh,600);
})();

/* A stock-info page (LTP / YCP / Fundamentals...) sent or pasted from the preview goes to the Projected page's info cards, not into Cards as rows. */
(function(){
  try{const _pd=window.pasteData;
    if(typeof _pd==='function'&&!_pd.__si){
      const w=function(t){
        try{const s=String(t||'');
          if(/\bLTP\b/.test(s)&&/\bYCP\b/.test(s)&&/FUNDAMENTALS|52W HIGH/.test(s)&&window.__prGot){window.__prGot(s);return}}catch(e){}
        return _pd.apply(this,arguments)};
      w.__si=1;window.pasteData=w}
  }catch(e){}
})();
