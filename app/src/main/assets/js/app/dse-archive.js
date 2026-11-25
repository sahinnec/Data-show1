/* DSE Day End Archive importer (old.dsebd.org/day_end_archive.php, "All Instrument").
   Table columns: # | DATE | TRADING CODE | LTP | HIGH | LOW | OPENP | CLOSEP | YCP | TRADE | VALUE(mn) | VOLUME
   Two ways in: 1) Paste  (table text copied from the page, or the page HTML)   2) Fetch  (app downloads the page in 7-day chunks, resumable)
   Rows are written into the saved-history store (history.js) with mode 'fill': existing values are never overwritten, only missing days/fields are added.
   Hook: window.__dseArc = { parse(text), saveText(text), fetchRange(from,to), open() } */
(function(){
  const $=id=>document.getElementById(id),toast=m=>{try{window.gnToast&&gnToast(m)}catch(e){}};
  const BASE='https://old.dsebd.org/day_end_archive.php';
  const DEF=['ltp','high','low','open','close','ycp','trade','value','vol'];            /* column order of the page */
  const NAMES={ltp:'ltp',high:'high',low:'low',openp:'open',open:'open',closep:'close',close:'close',ycp:'ycp',trade:'trade',value:'value',volume:'vol'};
  const ISO=/^\d{4}-\d\d-\d\d$/;
  const num=t=>{const s=String(t==null?'':t).replace(/[,\s]/g,'');if(s===''||s==='-')return 0;const x=parseFloat(s);return isFinite(x)?x:0};

  /* page HTML -> plain text lines (no DOM needed, so it also works on a half-loaded page) */
  function htmlToText(h){
    return String(h).replace(/<(script|style)[\s\S]*?<\/\1>/gi,' ').replace(/<\/tr\s*>/gi,'\n').replace(/<\/t[dh]\s*>/gi,'\t')
      .replace(/<br\s*\/?>/gi,'\n').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');
  }
  /* -> { days: Map(date -> {CODE:{p,o,h,l,y,v,t,a,c}}), rows:n } */
  function parse(text){
    text=String(text||'');
    if(/<t[dr][\s>]/i.test(text))text=htmlToText(text);
    const days=new Map();let rows=0,order=DEF;
    text.split(/\r?\n/).forEach(line=>{
      const tk=line.trim().split(/[\t ]+/).filter(Boolean);if(tk.length<4)return;
      let di=tk.findIndex(x=>ISO.test(x));
      if(di<0){ /* header line: learn the column order from it */
        const names=tk.map(x=>NAMES[x.toLowerCase().replace(/\(.*?\)/g,'').replace(/[^a-z]/g,'')]).filter(Boolean);
        if(names.length>=7&&/date/i.test(line))order=names;
        return;
      }
      const d=tk[di],code=String(tk[di+1]||'').toUpperCase();
      if(!code||/^T[BS]?\d/.test(code))return;                      /* G-Sec / T-bond rows are not shares */
      const v=tk.slice(di+2);if(v.length<order.length)return;
      const m={};order.forEach((k,i)=>{m[k]=num(v[i])});
      if(!(m.vol>0)&&!(m.trade>0))return;                              /* no trade that day: not a real candle */
      const p=m.close>0?m.close:m.ltp>0?m.ltp:m.ycp;if(!(p>0))return;
      const r={p,v:m.vol};
      if(m.open>0)r.o=m.open;if(m.high>0)r.h=m.high;if(m.low>0)r.l=m.low;
      if(m.ycp>0){r.y=m.ycp;r.c=Math.round((p-m.ycp)/m.ycp*1e4)/100}
      if(m.trade>0)r.t=m.trade;if(m.value>0)r.a=m.value;
      if(!days.has(d))days.set(d,{});days.get(d)[code]=r;rows++;
    });
    return {days,rows};
  }
  async function save(parsed){
    const h=window.__hist;if(!h)throw new Error('History module load হয়নি');
    await h.ready;let n=0,nd=0;
    for(const [d,recs] of parsed.days){const had=h.days().includes(d);const k=await h.saveDay(d,recs,'archive','fill');n+=k;if(!had&&k)nd++}
    return {days:parsed.days.size,newDays:nd,recs:n};
  }
  async function saveText(text){
    const p=parse(text);if(!p.rows)throw new Error('Table-এ কোনো row পাওয়া যায়নি (Date, Trading code, LTP… column থাকতে হবে)');
    return save(p);
  }

  /* ---- download (same bridge as dse-fetch.js, own id prefix "da") ---- */
  let seq=0;const cbs={};const prev=window.__urlRes;
  window.__urlRes=function(id,ok,p){
    if(String(id).slice(0,2)==='da'){const c=cbs[id];delete cbs[id];if(c){try{const b=atob(p),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);c(ok,new TextDecoder('utf-8').decode(u))}catch(e){c(false,String(e))}}return}
    if(typeof prev==='function')return prev.apply(this,arguments);
  };
  const get=u=>new Promise((res,rej)=>{
    if(window.Android&&window.Android.fetchUrl){const id='da'+(++seq);cbs[id]=(ok,t)=>ok?res(t):rej(new Error(t));window.Android.fetchUrl(u,id);return}
    fetch(u).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(res,rej)});
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const addD=(d,n)=>{const x=new Date(d.getTime());x.setDate(x.getDate()+n);return x};
  const DK='ds_arc_done',done=()=>{try{return new Set(JSON.parse(localStorage.getItem(DK)||'[]'))}catch(e){return new Set()}};
  const markDone=s=>{try{localStorage.setItem(DK,JSON.stringify([...s]))}catch(e){}};
  let busy=false,stop=false;
  async function fetchRange(from,to,log){
    if(busy){toast('একটা fetch চলছে');return null}busy=true;stop=false;
    const dn=done(),tot={days:0,newDays:0,recs:0,chunks:0,skipped:0};let err='';
    try{
      const A=new Date(from+'T00:00:00'),Z=new Date(to+'T00:00:00'),today=iso(new Date());
      const n=Math.ceil((Z-A)/864e5/7)+1;let i=0;
      for(let s=A;s<=Z&&!stop;s=addD(s,7)){
        i++;const a=iso(s),e=iso(addD(s,6)>Z?Z:addD(s,6));
        if(dn.has(a+'|'+e)){tot.skipped++;continue}
        if(log)log('Chunk '+i+'/'+n+' ('+a+' → '+e+')…');
        const html=await get(BASE+'?startDate='+a+'&endDate='+e+'&inst=All%20Instrument&archive=data');
        const p=parse(html);
        if(p.rows){const r=await save(p);tot.days+=r.days;tot.newDays+=r.newDays;tot.recs+=r.recs}
        else if(!/day end summary/i.test(html)){throw new Error('Page-এ table পাওয়া যায়নি (reply শুরু: '+htmlToText(html).replace(/\s+/g,' ').slice(0,80)+')')}
        tot.chunks++;
        if(e<iso(addD(new Date(today+'T00:00:00'),-1))){dn.add(a+'|'+e);markDone(dn)}  /* holiday-only week: empty table is fine, do not retry */
      }
    }catch(e){err=e.message||String(e)}
    busy=false;tot.err=err;tot.stopped=stop;return tot;
  }

  /* ---- small sheet: paste box + fetch ---- */
  let root=null;
  function css(){if($('daCss'))return;const s=document.createElement('style');s.id='daCss';
    s.textContent='#daS{position:fixed;inset:0;z-index:9996;background:rgba(0,0,0,.45);display:none;align-items:flex-end}'+
    '#daS>div{background:var(--card,#fff);color:var(--tx,#111);width:100%;max-height:90%;overflow:auto;border-radius:16px 16px 0 0;padding:12px 14px calc(14px + env(safe-area-inset-bottom,0px))}'+
    '#daS h4{margin:0 0 6px}#daS .n{font-size:.78rem;color:var(--mut,#778);line-height:1.5;margin:4px 0 8px}'+
    '#daS textarea{width:100%;min-height:110px;box-sizing:border-box;border:1px solid var(--bd,#dde);border-radius:10px;background:transparent;color:inherit;font:inherit;font-size:.8rem;padding:8px}'+
    '#daS input[type=date]{padding:6px 8px;border:1px solid var(--bd,#dde);border-radius:8px;background:transparent;color:inherit;font:inherit}'+
    '#daS .r{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}#daS button{padding:8px 12px;border-radius:10px;border:1px solid var(--bd,#dde);background:transparent;color:inherit;font:inherit;font-size:.84rem;cursor:pointer}'+
    '#daS button.pri{background:var(--ac,#2563eb);color:#fff;border-color:transparent}#daS #daL{font-size:.82rem;min-height:1.2em}';
    document.head.appendChild(s)}
  function build(){
    css();if(root)return root;
    root=document.createElement('div');root.id='daS';
    const t=new Date(),f=new Date();f.setFullYear(f.getFullYear()-2);
    root.innerHTML='<div><h4>📥 DSE Day End Archive</h4>'+
      '<div class="n">old.dsebd.org › Day End Archive (All Instrument). যে দিন বা field আগেই আছে তা বদলাবে না; শুধু নতুন দিন/field যোগ হবে।</div>'+
      '<div class="r"><span>From</span><input type="date" id="daF" value="'+iso(f)+'"><span>To</span><input type="date" id="daT" value="'+iso(t)+'"></div>'+
      '<div class="r"><button class="pri" id="daG">⬇ Fetch (৭ দিন করে)</button><button id="daSt">⏹ Stop</button><button id="daRs">↺ Resume reset</button></div>'+
      '<div class="n">অথবা page-এর table copy করে এখানে paste করুন:</div><textarea id="daX" placeholder="Date  Trading code  LTP  High  Low  Openp  Closep  YCP  Trade  Value  Volume …"></textarea>'+
      '<div class="r"><button id="daP">Paste করা table load করুন</button><button id="daC">Close</button></div><div id="daL"></div></div>';
    document.body.appendChild(root);
    const L=m=>{$('daL').textContent=m};
    root.addEventListener('click',e=>{if(e.target===root)root.style.display='none'});
    $('daC').onclick=()=>{root.style.display='none'};
    $('daSt').onclick=()=>{stop=true;L('Stop হচ্ছে (এই chunk শেষ হলে)…')};
    $('daRs').onclick=()=>{try{localStorage.removeItem(DK)}catch(e){}L('Resume list মুছে গেছে, আবার সব chunk আনবে।')};
    $('daP').onclick=async()=>{
      const t=$('daX').value;if(!t.trim()){L('কিছু paste করা হয়নি');return}
      L('পড়ছি…');try{const r=await saveText(t);L(r.days+' দিন, '+r.recs+' record ('+r.newDays+' টি নতুন দিন) জমা হলো।');$('daX').value='';try{window.__hist.open('pick')}catch(e){}}catch(e){L('Hoyni: '+e.message)}};
    $('daG').onclick=async()=>{
      const a=$('daF').value,z=$('daT').value;if(!a||!z||a>z){L('Date ঠিক করুন');return}
      $('daG').disabled=true;const r=await fetchRange(a,z,L);$('daG').disabled=false;if(!r)return;
      L((r.err?'থেমে গেছে: '+r.err+'\n':'')+(r.stopped?'থামানো হয়েছে। ':'')+r.days+' দিন, '+r.recs+' record, '+r.newDays+' টি নতুন দিন। '+r.chunks+' chunk, '+r.skipped+' skip (আগেই হয়েছিল)।'+(r.err?' আবার Fetch চাপলে যেখানে থেমেছিল সেখান থেকে চলবে।':''));
      try{window.__hist.open('set')}catch(e){}
    };
    return root;
  }
  window.__dseArc={parse,saveText,fetchRange,open:()=>{build().style.display='flex'}};
})();
