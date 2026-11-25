/* Projected page (Compare > Projected): chart + forecast + checklist page (source = #prSrc in index.html, shown in an iframe).
   Data in:  1) preview > Send (➤) while "From preview" is waiting  2) "App data" (Cards/Table rows)  3) paste inside the page.
   Hooks:    window.__prOpen(text?) , window.__prWaiting() , window.__prGot(text) , window.__prApp() */
(function(){
  const $=id=>document.getElementById(id),toast=m=>{try{window.gnToast&&gnToast(m)}catch(e){}};
  let fr=null,wait=false,recent=0,view='chart'; /* view: 'chart' = chart + note (bottom menu > Chart) | 'proj' = checklist + projected price + table (Compare > Projected) */

  function dark(){try{const m=(getComputedStyle(document.body).backgroundColor.match(/\d+/g)||[255,255,255]).map(Number);return (m[0]*.3+m[1]*.59+m[2]*.11)<110}catch(e){return false}}
  function themeDark(){let t='auto';try{t=(JSON.parse(localStorage.getItem('ds_pr_cs')||'{}').theme)||'auto'}catch(e){}return t==='dark'?true:t==='light'?false:dark()} /* chart settings > Theme can force Light/Dark */
  window.__prDark=dark;
  function frameDoc(cb){ /* run cb(window) once the page inside the iframe is ready */
    if(!fr)return;
    const go=()=>{try{cb(fr.contentWindow)}catch(e){toast('Projected: '+e.message)}};
    if(fr.dataset.ready==='1')go();else fr.addEventListener('load',go,{once:true});
  }
  function build(){
    if(fr)return;
    const src=$('prSrc').textContent.replace(/<\\\/script/g,'</script');
    fr=document.createElement('iframe');fr.id='prF';fr.title='Projected';
    fr.addEventListener('load',()=>{
      fr.dataset.ready='1';
      try{fr.contentDocument.documentElement.setAttribute('data-theme',themeDark()?'dark':'light')}catch(e){}
      applyView();
    });
    fr.srcdoc=src;$('prW').appendChild(fr);
  }
  function applyView(){ /* show only the chart part or only the projected part of the page, then redraw the canvas */
    try{const d=fr.contentDocument;d.documentElement.setAttribute('data-v',view);try{d.defaultView.__prInfoRefresh&&d.defaultView.__prInfoRefresh()}catch(e){}d.defaultView.dispatchEvent(new Event('resize'));d.defaultView.scrollTo(0,0)}catch(e){}
  }
  function navMark(){ /* bottom menu highlight: Chart while the chart view is open, otherwise the current page */
    const on=$('prS').style.display==='flex'?(view==='proj'?'proj':'chart'):(typeof curTab==='string'?curTab:'');
    document.querySelectorAll('#docBottom button[data-nav]').forEach(b=>b.classList.toggle('on',b.dataset.nav===on));
  }
  let show=function(v){
    if(v==='chart'||v==='proj'||v==='both')view=v; /* 'both' = chart on top, projected part below (mini bars: one tap) */
    build();wait=false;mark();
    document.body.classList.add('pr-open');$('prS').style.display='flex';try{$('prS').style.bottom=($('docBottom').offsetHeight||64)+'px'}catch(e){}
    try{document.body.style.overflow='hidden'}catch(e){}
    try{fr.contentDocument&&fr.contentDocument.documentElement.setAttribute('data-theme',themeDark()?'dark':'light')}catch(e){}
    document.body.classList.toggle('pr-proj',view==='proj');
    if(fr.dataset.ready==='1')applyView();navMark();
  }
  window.__prFs=function(on){ /* chart full screen: hide the page's top buttons + bottom menu, iframe fills the screen */
    on=!!on;document.body.classList.toggle('pr-fs',on);try{if(fr&&fr.contentDocument)fr.contentDocument.documentElement.classList.toggle('fsc',on)}catch(e){}
    try{$('prS').style.bottom=on?'0px':(($('docBottom').offsetHeight||64)+'px')}catch(e){}
    try{fr&&fr.contentWindow.dispatchEvent(new Event('resize'))}catch(e){}return on};
  let hide=function(){try{window.__prFs(false)}catch(e){}document.body.classList.remove('pr-open');$('prS').style.display='none';$('prS').style.bottom='';try{document.body.style.overflow=''}catch(e){}navMark()}

  /* open the page, optionally with text to load */
  /* merge new price-history text into what the chart already has: same header + same share -> union by date (no double dates) */
  let lastTxt='';
  const isoD=t=>{const m=String(t).match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);if(!m)return t;let y=+m[3];if(y<100)y+=2000;return y+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0')};
  function parseH(t){
    const Ls=String(t||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    const hi=Ls.findIndex(l=>/^date\b/i.test(l));if(hi<0)return null;
    const sp=l=>l.indexOf('\t')>=0?l.split('\t'):l.split(/[\s,;|]+/);
    const head=Ls[hi],hc=sp(head).map(x=>x.trim().toLowerCase());
    const ni=hc.findIndex(c=>/^(name|share|code|symbol|scrip)/.test(c));
    const rows=new Map(),names=new Set();
    Ls.slice(hi+1).forEach(l=>{const k=sp(l);if(!/^(\d{4}-\d\d-\d\d|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})$/.test(k[0]))return;
      const nm=ni>0?(k[ni]||''):'';names.add(nm);rows.set(isoD(k[0])+'|'+nm,[isoD(k[0]),l.replace(k[0],isoD(k[0]))])});
    return{head,rows,names};
  }
  function mergeTxt(oldT,newT){
    const a=parseH(oldT),b=parseH(newT);
    if(!a||!b||a.head.toLowerCase()!==b.head.toLowerCase())return {t:newT,added:0,merged:false};
    let share=false;b.names.forEach(n=>{if(a.names.has(n))share=true});if(!share)return {t:newT,added:0,merged:false};
    const all=new Map(a.rows);let added=0;b.rows.forEach((v,k)=>{if(!all.has(k))added++;all.set(k,v)});
    const out=[...all.values()].sort((x,y)=>x[0]<y[0]?-1:x[0]>y[0]?1:0).map(v=>v[1]);
    return {t:[a.head].concat(out).join('\n'),added,merged:true};
  }
  /* v33: text sent to Cards (preview/browser "Send to Data Show", Paste) is also remembered here, so the bottom-menu Chart / Projected
     pages open with the same data instead of an empty chart. Two kinds: a price history (Date + CP/Close/Price + Vol rows) and a stock
     "quote" page (LTP / YCP / 52W / EPS ...). Info text is loaded last, because loading a history clears the info tiles. */
  const SH='ds_pr_stash_v1';let stash={h:'',i:''};
  try{stash=Object.assign(stash,JSON.parse(localStorage.getItem(SH)||'{}'))}catch(e){}
  const saveSt=()=>{try{localStorage.setItem(SH,JSON.stringify({h:stash.h.slice(0,120000),i:stash.i.slice(0,60000)}))}catch(e){}};
  const cleanTxt=t=>String(t==null?'':t).replace(/^\s*blob:\s*/i,'');   /* in-app browser copy can start with "blob:" (page URL scheme) */
  const DL=/^(\d{1,2}\s+[A-Za-z]{3,9}\.?,?\s+\d{2,4}|\d{4}-\d\d-\d\d|\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4})(?![\d.])/;
  function kindOf(t){
    const L=String(t||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
    if(L.length<5)return '';
    const up=L.map(x=>x.toUpperCase());
    if(up.includes('LTP')&&(up.includes('YCP')||up.includes('52W HIGH')))return 'i';
    const dl=L.filter(x=>DL.test(x)).length;
    if(dl>=5&&L.some(x=>/^(CP|CLOSE|PRICE|LTP)$/i.test(x)||(/\b(CP|close|price)\b/i.test(x)&&/\bdate\b/i.test(x))))return 'h';
    return '';
  }
  /* v36: every share's quote page (LTP / YCP / EPS / NAV / shareholding ...) is kept under its own code, so the Projected page can show
     the info cards of whichever share is open (and hide them when that share has none). */
  const IK='ds_pr_infos_v1';
  const infoMap=()=>{try{return JSON.parse(localStorage.getItem(IK)||'{}')||{}}catch(e){return{}}};
  function infoTrim(t){t=String(t||'');const m=t.search(/^\s*(SIMILAR PATTERNS|DATA SOURCE)/mi);if(m>0)t=t.slice(0,m);return t.slice(0,9000)}
  function infoCode(t){const L=String(t||'').split(/\r?\n/).map(x=>x.replace(/\s+/g,' ').trim()).filter(Boolean);
    for(let i=0;i<L.length-1&&i<40;i++){if(/^[A-Z0-9][A-Z0-9&._-]{2,}$/.test(L[i])&&/[A-Z]/.test(L[i])&&/(limited|ltd|bank|plc|company|fund)/i.test(L[i+1]))return L[i]}
    return ''}
  window.__prInfoPut=function(code,raw){
    code=String(code||'').trim().toUpperCase();if(!code)return false;
    const m=infoMap();m[code]={r:infoTrim(raw),t:Date.now()};
    const trim=n=>{const ks=Object.keys(m).sort((a,b)=>m[a].t-m[b].t);ks.slice(0,Math.max(0,ks.length-n)).forEach(k=>{if(k!==code)delete m[k]})};
    trim(300);
    try{localStorage.setItem(IK,JSON.stringify(m))}catch(e){try{trim(Math.ceil(Object.keys(m).length/2));localStorage.setItem(IK,JSON.stringify(m))}catch(e2){return false}}
    try{if(fr&&fr.contentWindow&&fr.contentWindow.__prInfoRefresh)fr.contentWindow.__prInfoRefresh()}catch(e){}
    return true};
  window.__prInfoGet=function(code){const e=infoMap()[String(code||'').trim().toUpperCase()];return e?{raw:e.r,t:e.t}:null};
  function remember(t){
    try{const k=kindOf(t);if(!k)return;
      if(k==='i'){stash.i=t;const c=infoCode(t);if(c)window.__prInfoPut(c,t)}else stash.h=t;
      saveSt()}catch(e){}
  }
  window.__prStash=remember;
  try{const _pd=window.pasteData;if(typeof _pd==='function'&&!_pd.__pr){
    const w=function(t){t=cleanTxt(t);remember(t);return _pd.apply(this,[t].concat([].slice.call(arguments,1)))};w.__pr=1;window.pasteData=w}}catch(e){}
  /* open Chart / Projected without new text: if the chart page is still empty, fill it from the stash, else from the app's own rows */
  function autoFill(){
    frameDoc(w=>{
      let has=false;try{has=!!w.SVT}catch(e){}
      if(has)return;
      if(stash.h){w.__prLoad(stash.h);lastTxt=stash.h;if(stash.i)w.__prLoad(stash.i);return}
      const a=window.__prAppText();if(a){w.__prLoad(a);lastTxt=a;if(stash.i)w.__prLoad(stash.i);return}
      if(stash.i)w.__prLoad(stash.i)
    });
  }
  window.__prOpen=function(text,opt){
    text=text?cleanTxt(text):text;
    try{if(text&&window.dseSnapshot&&dseSnapshot(text)){window.__prDse(text);return}}catch(e){}
    let note='';
    if(text&&String(text).trim()){
      if(!(opt&&opt.replace)&&lastTxt){const m=mergeTxt(lastTxt,String(text));if(m.merged){text=m.t;note='Same date-er data double hoyni. '+m.added+' ti notun din jog hoyeche.'}}
      lastTxt=String(text);
    }
    show(opt&&opt.view||(text&&String(text).trim()?'chart':undefined));
    if(text&&String(text).trim()){remember(text);frameDoc(w=>{const n=w.__prLoad(text);if(n>1)toast('Pick the name at the top of the chart page.');else if(note)toast(note)})}
    else autoFill();
  };
  window.__prArm=()=>{recent=Date.now()};
  window.__prDisarm=()=>{wait=false;recent=0;mark()};
  let mark=()=>{const b=$('pvSend');if(b){b.classList.toggle('prwait',wait);b.title=wait?'Send to Projected':'Send to Data Show'}};
  window.__prWaiting=()=>wait||(Date.now()-recent<5*60*1000);
  /* a DSE market snapshot (one day, all shares) pasted here is not a price history -> show it as Cards */
  window.__prDse=function(t){wait=false;mark();hide();try{pasteData(t)}catch(e){console.error(e)}try{setTab('show')}catch(e){}toast('এটা market snapshot (এক দিনের দাম), history না। Cards-এ দেখানো হয়েছে।')};

  /* called by preview > Send while waiting: text goes here instead of Cards */
  window.__prGot=function(text){
    wait=false;recent=0;mark();
    if(!String(text||'').trim()){toast('Nothing to send.');return false}
    window.__prOpen(text);
    return true;
  };

  /* data already in the app (Cards / Table rows): Date, Name, Price, Qty */
  window.__prAppText=function(){
    try{
      if(!baseRows||!baseRows.length||map.d<0||map.p<0)return '';
      const L=['Date\tName\tPrice\tQty'];
      baseRows.forEach(r=>{
        const t=pDate(r[map.d]);if(t===null)return;
        const p=num(r[map.p]);if(p===null)return;
        const nm=map.n>=0?String(r[map.n]==null?'':r[map.n]).replace(/\s+/g,'_'):'';
        const q=map.q>=0?num(r[map.q]):null;
        L.push([new Date(t).toISOString().slice(0,10),nm||'ALL',p,q===null?0:q].join('\t'));
      });
      return L.length>1?L.join('\n'):'';
    }catch(e){return ''}
  };
  /* Buy / Sell rows (Cards / My data) for the chart: [{d:'YYYY-MM-DD', n:name, side:'Buy'|'Sell', q, p}] (Net rows are ignored) */
  window.__prTrades=function(){
    try{
      const out=[];
      if(!baseRows||!baseRows.length||map.d<0)return out;
      baseRows.forEach(r=>{
        const t=pDate(r[map.d]);if(t===null)return;
        let ty='';try{ty=typeOf(r)}catch(e){}
        if(ty!=='b'&&ty!=='s')return;
        const nm=map.n>=0?String(r[map.n]==null?'':r[map.n]).trim():'';
        const q=map.q>=0?num(r[map.q]):null,pr=map.p>=0?num(r[map.p]):null;
        out.push({d:new Date(t).toISOString().slice(0,10),n:nm,side:ty==='b'?'Buy':'Sell',q:q===null?0:q,p:pr===null?0:pr});
      });
      return out;
    }catch(e){return []}
  };
  window.__prApp=function(){
    const t=window.__prAppText();
    if(!t){toast('No dated price data in the app yet. Use From preview or paste inside the page.');window.__prOpen();return false}
    window.__prOpen(t);return true;
  };

  /* buttons */
  const open=$('prOpen');
  if(open)open.onclick=()=>window.__prOpen(undefined,{view:'proj'});
  $('prB').onclick=()=>{wait=false;recent=Date.now();mark();hide()};
  document.addEventListener('click',e=>{
    const nb=e.target.closest&&e.target.closest('#docBottom [data-nav=chart],#docBottom [data-nav=proj]');
    if(nb){e.stopPropagation();e.preventDefault();try{closeAddMenu()}catch(x){}const v=nb.dataset.nav==='proj'?'proj':'chart';if($('prS').style.display==='flex'&&view===v)return;window.__prOpen(undefined,{view:v});return} /* bottom menu > Chart / Projected */
    if($('prS').style.display==='flex'&&e.target.closest&&e.target.closest('#docBottom button')){recent=Date.now();wait=false;mark();hide()}},true);
  /* header Paste / Demo data -> trigger the buttons inside the chart page */
  $('prPaste').onclick=()=>{show();frameDoc(w=>w.document.getElementById('pst').click())};
  const am=$('prAppM'),amH=()=>{am.hidden=true};
  $('prDemo').onclick=()=>{amH();show();frameDoc(w=>w.document.getElementById('demo').click())};
  $('prApp').onclick=e=>{e.stopPropagation();am.hidden=!am.hidden};
  $('prSv').onclick=()=>{amH();try{window.__hist.open('pick')}catch(e){toast('Saved data khulche na')}};
  $('prApp1').onclick=()=>{amH();window.__prApp()};
  const chartData=()=>{let t='';
    try{const ifr=$('prW').querySelector('iframe'),ta=ifr&&ifr.contentDocument&&ifr.contentDocument.getElementById('ta');t=ta?String(ta.value||''):''}catch(e){}
    if(!t.trim())t=window.__prAppText()||'';return t};
  const chartRows=()=>chartData().split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split(/\t|,/).map(x=>x.trim()));
  $('prExp').onclick=()=>{amH();const A=chartRows();if(!A.length){toast('Chart-e kono data nai');return}
    const q=v=>/[",\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;
    save('chart-data.csv',new TextEncoder().encode('\ufeff'+A.map(r=>r.map(q).join(',')).join('\r\n')).buffer)};
  $('prExpX').onclick=async()=>{amH();const A=chartRows();if(!A.length){toast('Chart-e kono data nai');return}
    await need('xlsx');const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(A),'Chart data');save('chart-data.xlsx',XLSX.write(wb,{bookType:'xlsx',type:'array'}))};
  $('prCpy').onclick=async()=>{amH();const t=chartData();if(!t.trim()){toast('Chart-e kono data nai');return}toast(await copyText(t)?'Chart data copied':'Copy hoyni')};
  document.addEventListener('click',e=>{if(!am.hidden&&!e.target.closest('#prAppM'))amH()},true);
  $('prPv').onclick=()=>{ /* go to the Preview box; the next ➤ Send comes back here */
    hide();wait=true;mark();
    try{setTab('scrap')}catch(e){}
    toast('Open a file, photo, PDF or web page, then tap ➤ Send. It comes to Projected.');
  };
  /* Session memory: Android may recreate the app while the in-app browser / a file picker is on top
     (page reloads, JS state is lost). Remember tab, Projected-open and "waiting for preview" in localStorage
     for 30 min and restore them on start, so Send from the browser still reaches Projected. */
  const SS='ds_sess_v1';
  const sess=()=>{try{const cur=(typeof curTab==='string')?curTab:'';localStorage.setItem(SS,JSON.stringify({t:Date.now(),tab:cur,pr:$('prS').style.display==='flex',v:view,wait:wait}))}catch(e){}};
  try{const _s=window.setTab;if(typeof _s==='function'&&!_s.__ps){const w=function(t){const r=_s.apply(this,arguments);sess();return r};w.__ps=1;window.setTab=w}}catch(e){}
  ['mark','show','hide'].forEach(()=>0);
  const _show=show,_hide=hide;
  show=function(v){_show(v);sess()};hide=function(){_hide();sess()};
  const _mark=mark;
  mark=function(){_mark();sess()};
  window.addEventListener('pagehide',sess);
  setTimeout(()=>{try{
    const o=JSON.parse(localStorage.getItem(SS)||'null');
    if(!o||Date.now()-o.t>30*60*1000)return;
    if(o.pr){window.__prOpen(undefined,{view:o.v==='proj'?'proj':o.v==='both'?'both':'chart'});return}
    if(o.wait){wait=true;_mark();try{setTab('scrap')}catch(e){}toast('Projected data এর জন্য অপেক্ষা করছে। ➤ Send চাপুন।');sess();return}
    if(o.tab&&o.tab!=='scrap'&&typeof setTab==='function')setTab(o.tab);
  }catch(e){}},700);

  /* closing the preview (✕) cancels the waiting state */
  const x=$('pvX');if(x)x.addEventListener('click',()=>{wait=false;mark()});
})();
