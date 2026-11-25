/* Saved price history (v17)  -  every day's DSE prices kept on the phone, shown in the Projected chart, backed up to Google Drive.
   Storage   : IndexedDB "dsHistory" / store "days"  (one record per trading day: {d:'2026-11-03', t:savedAt, src, r:{CODE:{p,o,h,l,y,v,t,a,c,m,e,g,k}}})
               p close/LTP  o open  h high  l low  y yesterday close  v volume  t trades  a value(mn)  c change %  m market cap(mn)  e P/E  g div yield  k category
   Sources   : 1) live DSE table (Table > Daily data) - collected automatically after 16:00 (Dhaka) while the app is open, and caught up on the next start
               2) pasted DSE table (Code/Name, Price, Change, Volume ...)   3) price history pasted into the Projected page / Home (vertical list)
   Drive     : file "DataShow-history.json.gz" in My Drive (scope drive.file) via Android.driveOp; auto upload after each saved day, Restore button merges it back.
   Hooks     : window.__hist  (see bottom).  Ids/classes start with "hs".  Settings: localStorage ds_hs_cfg. */
(function(){try{
const $=id=>document.getElementById(id),A=()=>window.Android||null;
const toast=m=>{try{window.gnToast?gnToast(m):alert(m)}catch(e){}};
const LSG=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const p2=n=>String(n).padStart(2,'0');
const FILE='DataShow-history.json.gz';
let C=Object.assign({auto:true,hour:16,keep:24,drive:true,lastUp:0,upErr:'',lastTry:0,note:'',recent:[]},LSG('ds_hs_cfg')||{});
const saveC=()=>{try{localStorage.setItem('ds_hs_cfg',JSON.stringify(C))}catch(e){}};
/* v48: keep at least 2 years (old default was 3 months). keep=0 means keep everything. */
if(!C.km){C.km=1;if(C.keep&&C.keep<24)C.keep=24;saveC()}

/* ---------- Dhaka time (Bangladesh weekend = Friday + Saturday; market 10:00-14:30) ---------- */
const dh=()=>new Date(Date.now()+6*3600e3);                       /* read with getUTC* = Dhaka wall clock */
const isoD=d=>d.getUTCFullYear()+'-'+p2(d.getUTCMonth()+1)+'-'+p2(d.getUTCDate());
const isWk=d=>{const w=d.getUTCDay();return w===5||w===6};
const prevTrading=d=>{d=new Date(d.getTime());do d.setUTCDate(d.getUTCDate()-1);while(isWk(d));return d};
/* the trading day whose prices the live page shows right now, and whether that day is finished (safe to store) */
function target(){
  const n=dh(),mins=n.getUTCHours()*60+n.getUTCMinutes();
  if(!isWk(n)&&mins>=10*60)return{d:isoD(n),final:mins>=C.hour*60};
  return{d:isoD(prevTrading(n)),final:true};                       /* before open / weekend: the page still shows the last close */
}

/* ---------- IndexedDB ---------- */
const D=new Map();                                                  /* date -> day record (memory copy) */
let db=null;
const rq=r=>new Promise((res,rej)=>{r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});
async function open(){
  if(db)return db;
  db=await new Promise((res,rej)=>{const q=indexedDB.open('dsHistory',1);q.onupgradeneeded=()=>{q.result.createObjectStore('days',{keyPath:'d'})};q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error)});
  return db;
}
async function loadAll(){
  const d=await open(),all=await rq(d.transaction('days','readonly').objectStore('days').getAll());
  all.forEach(x=>D.set(x.d,x));
}
async function putDay(day){const d=await open();const t=d.transaction('days','readwrite');t.objectStore('days').put(day);return new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error)})}
async function delDay(k){const d=await open();const t=d.transaction('days','readwrite');t.objectStore('days').delete(k);return new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error)})}
const ready=loadAll().catch(e=>{console.error('history load',e)});

/* ---------- save ---------- */
const nn=v=>{if(v===null||v===undefined||v==='')return undefined;const x=typeof v==='number'?v:parseFloat(String(v).replace(/,/g,''));return isFinite(x)?x:undefined};
function clean(o){const r={};for(const k in o){const v=k==='k'?(o[k]?String(o[k]):undefined):nn(o[k]);if(v!==undefined)r[k]=v}return r}
/* recs: {CODE: {p,h,l,...}}   mode 'fill' = keep existing values, only add missing */
async function saveDay(date,recs,src,mode){
  await ready;
  let day=D.get(date);if(!day){day={d:date,t:0,src:src,r:{}};D.set(date,day)}
  let n=0;
  for(const code in recs){
    const c=String(code).trim().toUpperCase();if(!c)continue;
    const nv=clean(recs[code]);if(nv.p===undefined&&nv.v===undefined)continue;
    const old=day.r[c];
    day.r[c]=old?(mode==='fill'?Object.assign({},nv,old):Object.assign({},old,nv)):nv;n++;
  }
  if(!n&&!Object.keys(day.r).length){D.delete(date);return 0}
  day.t=Date.now();if(src&&(!day.src||mode!=='fill'))day.src=src;
  await putDay(day);await prune();emit();
  return n;
}
async function prune(){
  if(!C.keep)return;
  const cut=new Date(Date.now()-Math.round(C.keep*30.5)*864e5),ck=cut.getUTCFullYear()+'-'+p2(cut.getUTCMonth()+1)+'-'+p2(cut.getUTCDate());
  for(const k of [...D.keys()])if(k<ck){D.delete(k);try{await delDay(k)}catch(e){}}
}
const days=()=>[...D.keys()].sort();
function codes(){const m=new Map();D.forEach(day=>{for(const c in day.r){const x=m.get(c)||{c,n:0,last:'',p:null,k:''};x.n++;if(day.d>=x.last){x.last=day.d;x.p=day.r[c].p;x.k=day.r[c].k||x.k}m.set(c,x)}});return [...m.values()].sort((a,b)=>a.c.localeCompare(b.c))}
function series(code){code=String(code).toUpperCase();return days().filter(k=>D.get(k).r[code]).map(k=>Object.assign({d:k},D.get(k).r[code]))}
const f=v=>v===undefined||v===null?'':String(Math.round(v*1e4)/1e4);
/* text for the chart page: Date Name Open High Low Close Volume (the chart's own parser reads this) */
function text(code){
  const s=series(code);if(!s.length)return '';
  return ['Date\tName\tOpen\tHigh\tLow\tClose\tVolume'].concat(s.filter(x=>x.p!==undefined).map(x=>{
    const o=x.o!==undefined?x.o:(x.y!==undefined?x.y:x.p),h=x.h!==undefined?x.h:Math.max(o,x.p),l=x.l!==undefined?x.l:Math.min(o,x.p);
    return [x.d,String(code).toUpperCase(),f(o),f(h),f(l),f(x.p),f(x.v||0)].join('\t')})).join('\n');
}

/* ---------- sources ---------- */
function liveRecs(){
  const a=LSG('ds_lt_cache');if(!Array.isArray(a)||a.length<50)return null;
  const r={};a.forEach(x=>{if(!x||!x.code)return;const p=x.ltp>0?x.ltp:x.ycp;if(!(p>0)&&!(x.vol>0))return;
    r[x.code]={p,h:x.high>0?x.high:undefined,l:x.low>0?x.low:undefined,y:x.ycp>0?x.ycp:undefined,v:x.vol,t:x.trade,a:x.val,c:x.pct,k:x.cat&&x.cat!=='–'?x.cat:undefined}});
  return Object.keys(r).length>=50?r:null;
}
/* the live page keeps showing the last close on holidays: same prices+volumes as the newest saved day = market was closed */
function sameAsLast(recs,date){
  const ks=days().filter(k=>k!==date);if(!ks.length)return false;
  const last=D.get(ks[ks.length-1]).r;let same=0,tot=0;
  for(const c in recs){const o=last[c];if(!o)continue;tot++;if(o.p===recs[c].p&&(o.v||0)===(recs[c].v||0))same++}
  return tot>=30&&same>=tot*.97;
}
async function collectLive(manual){
  await ready;
  const r=liveRecs();if(!r){if(manual)toast('Daily data এখনো load হয়নি। Table › Daily data খুলে Refresh করুন।');return 0}
  const t=target();
  if(!manual&&!t.final)return 0;
  if(!manual&&D.get(t.d)&&D.get(t.d).src==='live'&&Date.now()-D.get(t.d).t<20*60e3)return 0;
  if(sameAsLast(r,t.d)){C.note=t.d+': বাজার বন্ধ ছিল (আগের দিনের সমান), সেভ করা হয়নি';saveC();emit();if(manual)toast(C.note);return 0}
  const n=await saveDay(t.d,r,'live');
  C.note=t.d+': '+n+' share সেভ হয়েছে';saveC();emit();
  if(manual)toast(C.note);
  driveAuto();
  return n;
}
/* pasted DSE snapshot rows: [Name,Cat,Company,Price,Change %,Volume,Market Cap,P/E,Div Yield] */
async function fromSnapshot(rows){
  const n=dh(),tg=(!isWk(n)&&n.getUTCHours()>=10)?isoD(n):isoD(prevTrading(n));
  const r={};rows.slice(1).forEach(x=>{r[x[0]]={p:x[3],c:x[4],v:x[5],m:x[6],e:x[7],g:x[8],k:x[1]}});
  const k=await saveDay(tg,r,'paste');driveAuto();return{date:tg,n:k};
}
/* one share's history: [{d,c,o,h,l,v}] (chart page) */
async function fromSeries(code,pts,src){
  const r=new Map();
  pts.forEach(z=>{if(!z||!z.d||!(z.c>0))return;const k=String(z.d).slice(0,10);if(!/^\d{4}-\d\d-\d\d$/.test(k))return;if(!r.has(k))r.set(k,{});r.get(k)[String(code).toUpperCase()]={p:z.c,o:z.o,h:z.h,l:z.l,v:z.v}});
  let n=0;for(const [k,v] of r)n+=await saveDay(k,v,src||'paste','fill');
  if(n)driveAuto();return n;
}

/* ---------- 16:00 collector (runs while the app is open) ---------- */
let busy=0;
async function tick(){
  if(busy||!C.auto)return;
  await ready;
  const t=target();if(!t.final)return;
  const have=D.get(t.d);if(have&&have.src==='live')return;           /* today already stored from the live table */
  if(have&&have.src==='skip')return;
  if(Date.now()-C.lastTry<10*60e3)return;                            /* retry every 10 min at most */
  busy=1;C.lastTry=Date.now();saveC();
  try{
    const lt=window.__ltRefresh;if(!lt){busy=0;return}
    await lt();
    await collectLive(false);
  }catch(e){console.error(e)}
  busy=0;
}
setTimeout(tick,6000);setInterval(tick,60e3);
document.addEventListener('visibilitychange',()=>{if(!document.hidden)setTimeout(tick,1500)});

/* ---------- Google Drive ---------- */
const hasDrive=()=>!!(A()&&A().driveOp);
const gEmail=()=>{try{if(A()&&A().googleAuthStatus){const g=JSON.parse(A().googleAuthStatus()||'{}');return g.ok&&g.email?g.email:''}}catch(e){}return''};
const u8b64=u=>{let s='';for(let i=0;i<u.length;i+=0x8000)s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000));return btoa(s)};
const b64u8=b=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u};
async function pipe(u8,Stream){const s=new Blob([u8]).stream().pipeThrough(new Stream('gzip'));return new Uint8Array(await new Response(s).arrayBuffer())}
const gz=async u=>window.CompressionStream?pipe(u,CompressionStream):u;
const gunz=async u=>{if(u.length>2&&u[0]===0x1f&&u[1]===0x8b){if(!window.DecompressionStream)throw new Error('এই phone compressed file খুলতে পারে না');return pipe(u,DecompressionStream)}return u};
const KEYS=['p','o','h','l','y','v','t','a','c','m','e','g','k'];
function pack(){return{v:1,app:'DataShow',saved:Date.now(),keys:KEYS,days:days().map(k=>{const d=D.get(k),r={};for(const c in d.r)r[c]=KEYS.map(x=>d.r[c][x]===undefined?null:d.r[c][x]);return{d:k,t:d.t,s:d.src,r}})}}
function unpack(j){
  if(!j||!Array.isArray(j.days))throw new Error('এটা DataShow history file না');
  const ks=j.keys||KEYS;
  return j.days.map(d=>{const r={};for(const c in d.r){const o={};d.r[c].forEach((v,i)=>{if(v!==null&&v!==undefined)o[ks[i]]=v});r[c]=o}return{d:d.d,t:d.t||0,src:d.s||'drive',r}});
}
const cbs={};let seq=0;
const prevDr=window.__drRes;   /* backup.js also uses driveOp: pass answers that are not ours on to it */
window.__drRes=(id,ok,b64)=>{const c=cbs[id];if(!c){if(prevDr)prevDr(id,ok,b64);return}delete cbs[id];let u;try{u=b64u8(b64)}catch(e){u=new Uint8Array(0)}c(ok,u)};
const drv=(op,name,u8)=>new Promise((res,rej)=>{
  if(!hasDrive())return rej(new Error('Drive শুধু Android app-এ চলে'));
  const id='dr'+(++seq)+Date.now().toString(36);
  const tm=setTimeout(()=>{delete cbs[id];rej(new Error('Drive সাড়া দেয়নি (time out)'))},120000);
  cbs[id]=(ok,u)=>{clearTimeout(tm);ok?res(u):rej(new Error(new TextDecoder().decode(u)||'Drive error'))};
  try{A().driveOp(op,name,u8?u8b64(u8):'',id)}catch(e){clearTimeout(tm);delete cbs[id];rej(e)}
});
/* v48: pull what is already in Drive and merge it in first (new days added, missing fields filled, phone values win), so an upload never loses older days (new phone, reinstall, 2nd device) */
async function pull(){
  try{
    const bin=await drv('get',FILE),j=JSON.parse(new TextDecoder().decode(await gunz(bin))),list=unpack(j);
    await ready;let nd=0;
    for(const d of list){const had=D.has(d.d);const n=await saveDay(d.d,d.r,d.src,'fill');if(!had&&n)nd++}
    return nd;
  }catch(e){if(/No backup file/i.test(e&&e.message||''))return 0;throw e}
}
async function upload(manual){
  try{
    if(!gEmail())throw new Error('আগে Google দিয়ে Sign in করুন');
    await ready;await pull();
    if(!days().length)throw new Error('এখনো কোনো দিনের data জমা হয়নি');
    const raw=new TextEncoder().encode(JSON.stringify(pack())),bin=await gz(raw);
    await drv('put',FILE,bin);
    C.lastUp=Date.now();C.upErr='';saveC();emit();
    if(manual)toast('Google Drive-এ upload হয়েছে ('+(bin.length/1024).toFixed(0)+' KB)');
    return true;
  }catch(e){C.upErr=e.message||String(e);saveC();emit();if(manual)toast('Drive: '+C.upErr);return false}
}
let upT=null;
function driveAuto(){if(!C.drive||!hasDrive()||!gEmail())return;clearTimeout(upT);upT=setTimeout(()=>upload(false),4000)}
async function restore(){
  try{
    if(!gEmail())throw new Error('আগে Google দিয়ে Sign in করুন');
    const bin=await drv('get',FILE),j=JSON.parse(new TextDecoder().decode(await gunz(bin))),list=unpack(j);
    await ready;let nd=0,nc=0;
    for(const d of list){const had=D.has(d.d);const n=await saveDay(d.d,d.r,d.src,'fill');if(!had&&n)nd++;nc+=n}
    toast('Drive থেকে ফিরিয়ে আনা হয়েছে: '+list.length+' দিন ('+nd+' টি নতুন)');
    return true;
  }catch(e){toast('Restore: '+(e.message||e));return false}
}

/* ---------- UI ---------- */
function css(){
  if($('hsCss'))return;
  const s=document.createElement('style');s.id='hsCss';
  s.textContent='#hsS{position:fixed;inset:0;z-index:9995;background:rgba(0,0,0,.45);display:none;align-items:flex-end}'+
  '#hsS>div{background:var(--card,#fff);color:var(--tx,#111);width:100%;max-height:88%;display:flex;flex-direction:column;border-radius:16px 16px 0 0;padding:0 0 calc(14px + env(safe-area-inset-bottom,0px))}'+
  '#hsS .hh{display:flex;align-items:center;gap:8px;padding:12px 14px 8px}#hsS .hh b{flex:1;font-size:1rem}'+
  '#hsS .hb{overflow:auto;padding:0 14px}#hsS .hn{font-size:.76rem;color:var(--mut,#778);margin:2px 0 8px;line-height:1.45}'+
  '#hsS input[type=search]{width:100%;padding:9px 11px;border:1px solid var(--bd,#dde);border-radius:10px;background:transparent;color:inherit;font:inherit;margin-bottom:6px}'+
  '#hsS .hl{display:flex;flex-direction:column}#hsS .hl button{display:flex;justify-content:space-between;align-items:center;gap:8px;text-align:left;padding:9px 4px;border:0;border-bottom:1px solid var(--bd,#e3e6ee);background:none;color:inherit;font:inherit;cursor:pointer}'+
  '#hsS .hl small{color:var(--mut,#778)}'+
  '#hsS .hr{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 0;border-bottom:1px solid var(--bd,#e3e6ee);font-size:.88rem}'+
  '#hsS .hr select{padding:6px 8px;border-radius:8px;border:1px solid var(--bd,#dde);background:transparent;color:inherit;font:inherit}'+
  '#hsS .ha{display:flex;flex-wrap:wrap;gap:6px;margin:10px 0 4px}#hsS .ha button{padding:8px 12px;border-radius:10px;border:1px solid var(--bd,#dde);background:transparent;color:inherit;font:inherit;font-size:.84rem;cursor:pointer}'+
  '#hsS .ha button.pri{background:var(--ac,#2563eb);color:#fff;border-color:transparent}'+
  '#hsS .hst{font-size:.82rem;line-height:1.55;padding:8px 10px;border-radius:10px;background:rgba(37,99,235,.08);margin:0 0 8px}'+
  '#hsS .bad{color:#c0392b}'+
  '#hsBar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:6px 10px;border-bottom:1px solid var(--bd,#e3e6ee);font-size:.8rem;background:var(--card,#fff);color:var(--tx,#111)}'+
  '#hsBar button{padding:6px 10px;border-radius:999px;border:1px solid var(--bd,#dde);background:transparent;color:inherit;font:inherit;cursor:pointer}'+
  '#hsBar button.pri{background:var(--ac,#2563eb);color:#fff;border-color:transparent}'+
  '#hsBar small{color:var(--mut,#778)}';
  document.head.appendChild(s);
}
let root=null,view='pick',q='';
function sheet(){
  css();if(root)return root;
  root=document.createElement('div');root.id='hsS';root.innerHTML='<div><div class="hh"><b id="hsT"></b><button class="alt sm" id="hsX" type="button">✕</button></div><div class="hb" id="hsB"></div></div>';
  document.body.appendChild(root);
  root.addEventListener('click',e=>{if(e.target===root)closeS()});
  root.querySelector('#hsX').onclick=closeS;
  return root;
}
const closeS=()=>{if(root)root.style.display='none'};
function fmtUp(){return C.lastUp?new Date(C.lastUp).toLocaleString('en-GB',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):'এখনো হয়নি'}
function draw(){
  if(!root||root.style.display!=='flex')return;
  const b=$('hsB'),ks=days(),cs=codes();
  if(view==='pick'){
    $('hsT').textContent='📚 Saved shares';
    const qq=q.trim().toUpperCase(),list=cs.filter(x=>!qq||x.c.includes(qq)).slice(0,150);
    b.innerHTML='<div class="hn">'+(ks.length?ks.length+' দিনের data · '+cs.length+' share · সর্বশেষ '+ks[ks.length-1]:'এখনো কোনো data জমা হয়নি। Table › Daily data খুলুন, বা table copy করে Paste করুন।')+'</div>'+
      '<input type="search" id="hsQ" placeholder="Search code…" value="'+esc(q)+'">'+
      '<div class="hl">'+(list.map(x=>'<button type="button" data-c="'+esc(x.c)+'"><span><b>'+esc(x.c)+'</b> <small>'+esc(x.k||'')+'</small></span><small>'+x.n+' দিন'+(x.p!=null?' · '+x.p:'')+'</small></button>').join('')||'<div class="hn">কিছু পাওয়া যায়নি।</div>')+'</div>'+
      '<div class="ha"><button type="button" id="hsArc">📥 DSE Archive (২ বছর)</button><button type="button" id="hsSet">⚙ Settings, Backup</button></div>';
    const qi=$('hsQ');qi.oninput=()=>{q=qi.value;const p=qi.selectionStart;draw();const n=$('hsQ');n.focus();try{n.setSelectionRange(p,p)}catch(e){}};
    b.querySelectorAll('.hl button').forEach(x=>x.onclick=()=>pickCode(x.dataset.c));
    $('hsSet').onclick=()=>{view='set';draw()};
    $('hsArc').onclick=()=>{if(window.__dseArc)window.__dseArc.open();else toast('DSE Archive module load হয়নি')};
  }else{
    $('hsT').textContent='⚙ Saved history';
    const em=gEmail(),sz=ks.reduce((s,k)=>s+Object.keys(D.get(k).r).length,0),t=target();
    b.innerHTML='<div class="hst">'+(ks.length?'<b>'+ks.length+' দিন</b> · '+sz.toLocaleString('en-US')+' record<br>'+ks[0]+' থেকে '+ks[ks.length-1]:'এখনো কোনো data নেই।')+
      '<br>পরের সংগ্রহ: '+(C.auto?t.d+(t.final?' (এখনই নেওয়া যায়)':' দিনের শেষে, '+C.hour+':00 এর পর'):'বন্ধ')+(C.note?'<br>'+esc(C.note):'')+'</div>'+
      '<label class="hr"><span>প্রতিদিন '+C.hour+':00 এ নিজে data নেবে<br><small style="color:var(--mut)">app খোলা থাকলে; বন্ধ থাকলে পরের বার খুললে ধরে নেয়</small></span><input type="checkbox" id="hsAu"'+(C.auto?' checked':'')+'></label>'+
      '<div class="hr"><span>কত দিনের data রাখবে</span><select id="hsKp"><option value="24">2 years</option><option value="36">3 years</option><option value="60">5 years</option><option value="0">Keep all</option></select></div>'+
      '<label class="hr"><span>Google Drive-এ নিজে upload<br><small style="color:var(--mut)">'+(hasDrive()?(em?esc(em):'Google sign in লাগবে'):'শুধু Android app-এ')+'</small></span><input type="checkbox" id="hsDr"'+(C.drive?' checked':'')+'></label>'+
      '<div class="hn" style="margin-top:6px">শেষ Drive upload: '+fmtUp()+(C.upErr?'<br><span class="bad">'+esc(C.upErr)+'</span>':'')+'</div>'+
      '<div class="ha"><button type="button" class="pri" id="hsNow">⬇ এখনই সেভ করুন</button>'+
      (hasDrive()?(em?'':'<button type="button" id="hsGo">Google Sign in</button>')+'<button type="button" id="hsUp">☁ Drive-এ upload</button><button type="button" id="hsRs">☁ Drive থেকে restore</button>':'')+
      '<button type="button" id="hsBk">← Shares</button></div>';
    $('hsKp').value=String(C.keep);
    $('hsAu').onchange=e=>{C.auto=e.target.checked;saveC();draw();if(C.auto)tick()};
    $('hsKp').onchange=e=>{C.keep=+e.target.value;saveC();prune().then(draw)};
    $('hsDr').onchange=e=>{C.drive=e.target.checked;saveC()};
    $('hsNow').onclick=async()=>{const w=window.__ltRefresh;try{if(w)await w()}catch(e){}await collectLive(true);draw()};
    if($('hsGo'))$('hsGo').onclick=()=>{try{A().googleSignIn('hs'+Date.now());toast('Google খুলছে…')}catch(e){toast('Google: '+e.message)}};
    if($('hsUp'))$('hsUp').onclick=async()=>{toast('Upload হচ্ছে…');await upload(true);draw()};
    if($('hsRs'))$('hsRs').onclick=async()=>{toast('Drive থেকে পড়া হচ্ছে…');await restore();draw()};
    $('hsBk').onclick=()=>{view='pick';draw()};
  }
}
function openS(v){sheet();view=v||'pick';root.style.display='flex';draw()}
function pickCode(c){
  const t=text(c);
  if(!t||t.split('\n').length<2){toast(c+': এখনো data নেই');return}
  closeS();
  C.recent=[c,...C.recent.filter(x=>x!==c)].slice(0,5);saveC();emit();
  window.__histLoading=1;
  try{window.__prOpen(t)}catch(e){toast('Projected: '+e.message)}
  setTimeout(()=>{window.__histLoading=0},2500);
  const n=t.split('\n').length-1;if(n<5)toast(c+': মাত্র '+n+' দিনের data আছে, প্রতিদিন বাড়বে।');
}
/* slim bar under the Projected header + a button in the Daily data toolbar */
function emit(){
  const bar=$('hsBar');if(bar){const ks=days();
    bar.innerHTML='<button type="button" class="pri" id="hsOpen">📚 Saved</button>'+C.recent.map(c=>'<button type="button" data-c="'+esc(c)+'">'+esc(c)+'</button>').join('')+'<small>'+(ks.length?ks.length+' দিন':'data নেই')+'</small>';
    $('hsOpen').onclick=()=>openS('pick');bar.querySelectorAll('button[data-c]').forEach(b=>b.onclick=()=>pickCode(b.dataset.c))}
  const l=$('hsLt');if(l){const ks=days();l.textContent='🗂 History · '+ks.length+' দিন'}
  draw();
}
function mount(){
  css();
  const ps=$('prS');
  if(ps&&!$('hsBar')){const h=ps.querySelector('.prh'),bar=document.createElement('div');bar.id='hsBar';if(h)h.insertAdjacentElement('afterend',bar);else ps.insertBefore(bar,ps.firstChild)}
  const tool=document.querySelector('#ltBox .lttool');
  if(tool&&!$('hsLt')){const b=document.createElement('button');b.id='hsLt';b.type='button';b.onclick=()=>openS('set');tool.appendChild(b)}
  ready.then(emit);
}
window.addEventListener('ltdata',()=>{if(C.auto)collectLive(false)});
window.addEventListener('load',mount);if(document.readyState!=='loading')mount();
const _ga=window.__googleAuth;window.__googleAuth=function(id,o){try{if(_ga)_ga.apply(this,arguments)}catch(e){console.error(e)}if(String(id).slice(0,2)==='hs'||id==='recover')setTimeout(draw,300)};

window.__hist={ready,saveDay,collectLive,fromSnapshot,fromSeries,codes,series,text,days,upload,restore,pull,open:openS,pick:pickCode,cfg:()=>C,target,tick,_D:D};
}catch(e){console.error('history init failed',e)}})();
