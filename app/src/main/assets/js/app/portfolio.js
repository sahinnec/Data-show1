/* My portfolio on the Table page (v19; v32 = 3 portfolios).
   v32: a dropdown on top of the portfolio box picks the portfolio: Lanka Bangla (default), First Capital, Midway. Each keeps its own
   statements, Buy/Sell trades, Cards file and Gmail sender. A Holdings PDF or Gmail PDF with a known layout (LB / FC / MW) goes to ITS
   portfolio automatically; Bank Asia layout and unknown PDFs go to the selected portfolio through the preview (check + edit, then Save).
   Storage v32: ds_pf_v2 = {act, a:{lb,fc,mw}}; the old ds_pf_v1 is moved into lb. Gmail sender is per portfolio (ds_gm_cfg.froms).
   v19 text: Button "💼 My portfolio" next to My data / Daily data.
   1) Portfolio PDF  -> opening holdings (Name, Qty, Avg cost) as of a date (preview + edit before saving)
   2) Buy/Sell confirmation PDF (file, or Gmail AUTO) -> trades added DATE-WISE on top of the opening holdings
      (trades dated on/before the opening date are ignored, they are already inside the portfolio PDF)
   3) ➤ Send to Cards -> addFile('My portfolio', Date/Type/Name/Quantity/Price rows) so Cards, Table and Compare
      count it like any other data. After the first send, every change re-sends silently.
   Gmail AUTO = Android.gmailFetch (IMAP + app password) -> window.__gmRes. AUTO and MANUAL are fallbacks of each other.
   Storage: ds_pf_v1 (portfolio), ds_gm_cfg (Gmail settings), ds_gm_seen. All ids/classes start with "gp"/"gm". */
(function(){try{
const g=id=>document.getElementById(id),sw=g('ltSw');if(!sw)return;
const LS=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k)||'null');localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}};
const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MN=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],p2=n=>String(n).padStart(2,'0');
const dtxt=t=>{const d=new Date(t);return p2(d.getUTCDate())+'-'+MN[d.getUTCMonth()]+'-'+d.getUTCFullYear()};
const diso=t=>new Date(t).toISOString().slice(0,10);
const nz=s=>parseFloat(String(s).replace(/,/g,''));
const fm=(n,d)=>(+n).toLocaleString('en-US',{minimumFractionDigits:d===undefined?2:d,maximumFractionDigits:d===undefined?2:d});
const ACCS=[{id:'lb',name:'Lanka Bangla',file:'My portfolio'},{id:'fc',name:'First Capital',file:'My portfolio \u00b7 First Capital'},{id:'mw',name:'Midway',file:'My portfolio \u00b7 Midway'}];
const blank=()=>({open:null,trades:[],sent:0,snaps:[],clients:[]});
let S2=LS('ds_pf_v2');
if(!S2||typeof S2!=='object'){S2={act:'lb',a:{}};const old=LS('ds_pf_v1');if(old&&typeof old==='object')S2.a.lb=old}
S2.a=S2.a||{};
ACCS.forEach(x=>{const a=S2.a[x.id]=Object.assign(blank(),S2.a[x.id]||{});if(a.open&&!(Array.isArray(a.snaps)&&a.snaps.length))a.snaps=[a.open];if(!Array.isArray(a.clients))a.clients=[];if(!Array.isArray(a.trades))a.trades=[]});
if(!ACCS.some(x=>x.id===S2.act))S2.act='lb';
let P=S2.a[S2.act],pendCl='',pendBA=null;
const AID=()=>S2.act,AN=id=>ACCS.find(x=>x.id===id),idOf=A=>{const x=ACCS.find(y=>S2.a[y.id]===A);return x?x.id:S2.act};
const touched=new Set(),learn=(A,c)=>{c=String(c||'').toUpperCase();if(c&&A.clients.indexOf(c)<0)A.clients.push(c)};
let C=Object.assign({user:'',pass:'',from:'',froms:null,days:10,pdfpw:'',auto:0,last:0},LS('ds_gm_cfg')||{});
if(!C.froms||typeof C.froms!=='object')C.froms=C.from?{lb:C.from}:{};
const fromOf=id=>C.froms[id]||'';
let seen=LS('ds_gm_seen')||[],busy=0,isOpen=false;
const saveP=()=>LS('ds_pf_v2',S2),saveC=()=>LS('ds_gm_cfg',C);
const hasBridge=()=>!!(window.Android&&window.Android.gmailFetch);
const hasGoogle=()=>!!(window.Android&&window.Android.googleSignIn&&window.Android.googleAuthStatus);
let googleOk=false,googleEmail='';
const canAuto=()=>hasBridge()&&(googleOk||(!!C.user&&!!C.pass));
function refreshGoogleUI(){
  try{
    if(!hasGoogle()){g('gmGoogleStatus').textContent='Google Sign-In needs the new APK';g('gmGoogleIn').disabled=true;g('gmGoogleOut').hidden=true;return}
    const st=JSON.parse(window.Android.googleAuthStatus()||'{}');
    googleOk=!!st.ok;googleEmail=st.email||'';
    if(googleOk){
      g('gmGoogleStatus').innerHTML='✓ Signed in as <b>'+esc(googleEmail)+'</b>'+(st.displayName?' ('+esc(st.displayName)+')':'');
      g('gmGoogleIn').hidden=true;g('gmGoogleOut').hidden=false;
      if(!C.user)C.user=googleEmail;
    }else{
      g('gmGoogleStatus').textContent='Not signed in with Google';
      g('gmGoogleIn').hidden=false;g('gmGoogleOut').hidden=true;
    }
  }catch(e){g('gmGoogleStatus').textContent='Status error: '+e.message}
}
window.__googleAuth=(id,obj)=>{
  try{
    if(typeof obj==='string')obj=JSON.parse(obj);
    googleOk=!!obj.ok;googleEmail=obj.email||'';
    refreshGoogleUI();
    if(obj.ok)msg('✓ Google signed in: '+googleEmail);
    else if(obj.error)msg('Google: '+obj.error,1);
  }catch(e){}
};
const HDR=['Date','Type','Name','Quantity','Price'];

const GI=(n)=>{const m=(d)=>'<svg class="lti" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+d+'</svg>';
 const D={search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  antenna:'<circle cx="12" cy="11" r="2"/><path d="M8.5 7.5a5 5 0 0 0 0 7M15.5 7.5a5 5 0 0 1 0 7M5.5 4.5a9 9 0 0 0 0 13M18.5 4.5a9 9 0 0 1 0 13M12 13v8"/>',
  tag:'<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9z"/><circle cx="8" cy="8" r="1.4"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  swap:'<path d="M7 4v14M3 8l4-4 4 4M17 20V6M13 16l4 4 4-4"/>',
  card:'<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/>',
  pencil:'<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
  trash:'<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>'};
 return m(D[n])};
const TL=(id,label,title,ic)=>'<button type="button" id="'+id+'" class="gpt1" title="'+title+'" aria-label="'+title+'">'+GI(ic)+'<span class="gpl">'+label+'</span></button>';
/* ---------- UI ---------- */
const st=document.createElement('style');st.textContent=
'#gpBox{border:1px solid var(--bd);border-radius:12px;padding:8px;margin:0 0 8px}#gpBox[hidden]{display:none}'+
'#gpBox input[type=text],#gpBox input[type=password],#gpBox input[type=email],#gpBox input[type=date],#gpBox textarea,#gpBox select{border:1px solid var(--bd);border-radius:9px;background:var(--card);color:var(--tx);padding:7px 8px;font:inherit;font-size:.82rem;min-width:0;width:100%;box-sizing:border-box}'+
'#gpBox textarea{min-height:110px}.gpsum{font-size:.82rem;margin:2px 0 6px}.gpmsg{font-size:.78rem;margin:2px 2px 6px;color:var(--mut)}.gpmsg.bad{color:var(--ld,#d1383d)}'+
'.gpt{width:100%;border-collapse:collapse;font-size:.8rem}.gpt th,.gpt td{padding:5px 6px;border-bottom:1px solid var(--bd);text-align:right}.gpt th:first-child,.gpt td:first-child{text-align:left}'+
'.gpt td.b{color:var(--lu,#0a8f4d)}.gpt td.s{color:var(--ld,#d1383d)}#gpBox details{margin:6px 0}#gpBox summary{cursor:pointer;font-size:.82rem;font-weight:600}'+
'.gpacc{margin:0 0 6px}#gpAc{font-weight:700}#gpSum{display:none}#gpBox .gpbtns{display:flex;flex-wrap:nowrap;gap:3px;margin-bottom:6px;overflow-x:auto;scrollbar-width:none}#gpBox .gpbtns button{flex:0 0 auto;padding:7px 6px;font-size:.72rem;white-space:nowrap}#ltSw.gpopen button[data-lt=my].on{background:transparent;color:var(--ac)}#ltSw{max-width:100%;box-sizing:border-box}#ltSw button{font-size:clamp(.66rem,3.4vw,.88rem);padding-left:2px;padding-right:2px;gap:3px;overflow:hidden;text-overflow:ellipsis}#ltSw button svg{flex:none}'+
'.gpt tr.gpsub td{font-size:.74rem;padding:2px 6px 2px 16px;text-align:left!important;background:transparent!important;color:var(--mu)}.gpt tr.gprow td{font-weight:600}.gpb{color:var(--lu,#0a8f4d)}.gps{color:var(--ld,#d1383d)}.gpd{opacity:.8}.gpmore{font-size:.72rem;padding:2px 8px}.gpx{background:transparent;color:var(--ld,#d1383d);border:0;padding:0 4px}#ltSw button.gpon{background:var(--ac);color:#fff}';
document.head.appendChild(st);
sw.querySelector('button[data-lt="daily"]').insertAdjacentHTML('beforebegin','<button type="button" id="gpTg">'+(window.__ltIC?window.__ltIC.case:'')+'Portfolio</button>');
sw.insertAdjacentHTML('afterend','<div id="gpBox" hidden>'+
'<div class="gpsum" id="gpSum"></div>'+
'<div class="gpbtns">'+TL('gpGm','Gmail','Gmail','antenna')+TL('gpPf','Holdings','Portfolio PDF','tag')+TL('gpSet','Setup','Setup','gear')+TL('gpTr','Buy/Sell','Buy/Sell PDF','swap')+TL('gpEd','Edit','Edit opening','pencil')+TL('gpRs','Delete','Reset','trash')+'<select id="gpAc" aria-label="Portfolio"></select>'+'</div>'+
'<div class="gpfind"><label class="gpsq">'+GI('search')+'<input type="search" id="gpQ" placeholder="Search…" aria-label="Search code"></label><select id="gpS" aria-label="Sector"><option value="">All sectors</option></select><select id="gpK" aria-label="Category"><option value="">All categories</option><option>A</option><option>B</option><option>N</option><option>Z</option></select><button type="button" id="gpAll" class="gpallb" title="Show all Buy/Sell"><span class="gpl">Show all Buy/Sell</span></button></div>'+
'<div class="gpmsg" id="gpMsg"></div>'+
'<div class="ltpanel" id="gpPv" hidden><b>Opening holdings</b><p class="ltnote">Check the shares, one per line: <b>NAME QTY AVG-COST</b>. Fix anything wrong, set the date of the portfolio statement, then Save. Buy/Sell PDFs dated after this date are added on top.</p>'+
'<textarea id="gpTx" placeholder="FAMILYTEX 100 2.15&#10;ONEBANKPLC 50 6.90" spellcheck="false"></textarea>'+
'<div class="ltrow" style="margin-top:6px"><label class="ltnote" style="margin:0;flex:1 1 100%">Portfolio date (as on)</label><input type="date" id="gpDt"></div>'+
'<div class="ltrow"><button type="button" id="gpSv">Save opening</button><button type="button" class="alt" id="gpXf" hidden>Add as transfer-in</button><button type="button" class="alt" id="gpCx">Cancel</button></div></div>'+
'<div class="ltpanel" id="gmPn" hidden><b>Setup</b>'+
'<div class="ltpanel" style="margin:6px 0"><b>Cards</b><p class="ltnote" style="margin:4px 0">Send this portfolio to Cards, Table and Compare. After the first send, every change updates it automatically.</p><div class="ltrow"><button type="button" id="gpSend">➤ Send to Cards</button></div></div>'+
'<b>Gmail</b><p class="ltnote" style="margin:4px 0">The Gmail button on the portfolio page reads the Portfolio statement and Buy/Sell PDFs from your inbox with these settings.</p>'+
'<div id="gmGoogleBox" style="margin:6px 0 10px;padding:8px;border:1px solid var(--bd);border-radius:10px;background:var(--card)">'+
'<div id="gmGoogleStatus" class="ltnote" style="margin:0 0 6px">Not signed in with Google</div>'+
'<div class="ltrow" style="gap:6px"><button type="button" id="gmGoogleIn">Sign in with Google</button>'+
'<button type="button" class="alt" id="gmGoogleOut" hidden>Sign out</button></div>'+
'<p class="ltnote" style="margin:6px 0 0;font-size:.75rem">Recommended: Sign in once → Gmail Auto works without App password.</p></div>'+
'<p class="ltnote">Or use a Gmail <b>App password</b> (Google Account › Security › 2-Step Verification › App passwords). Saved only on this phone. If Auto fails, the file picker always works.</p>'+
'<div class="ltrow"><input type="email" id="gmU" placeholder="Gmail address (optional if signed in)" autocomplete="off"></div><div class="ltrow"><input type="password" id="gmP" placeholder="App password (16 letters) — optional if signed in" autocomplete="off"></div>'+
'<div class="ltrow"><input type="text" id="gmF" placeholder="Broker email of the selected portfolio, e.g. info@lbsbd.com (empty = any sender)" autocomplete="off"></div>'+
'<div class="ltrow"><select id="gmD" aria-label="Look back"><option value="3">Last 3 days</option><option value="10">Last 10 days</option><option value="30">Last 30 days</option></select></div>'+
'<div class="ltrow"><input type="password" id="gmW" placeholder="PDF password (if the PDFs have one)" autocomplete="off"></div>'+
'<label class="ltnote" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="gmA" style="width:auto"> Gmail auto check (app khulle, prottek 6 ghonta por)</label>'+
'<div class="ltrow" style="margin-top:6px"><button type="button" id="gmSv">Save</button><button type="button" class="alt" id="gmCl">Close</button></div></div>'+
'<div id="gpTb"></div>'+
'<input type="file" id="gpFP" accept="application/pdf,.pdf" hidden><input type="file" id="gpFT" accept="application/pdf,.pdf" multiple hidden></div>');
const msg=(t,bad)=>{const m=g('gpMsg'),pv=!g('gpPv').hidden;
 if(!t||bad||pv){m.textContent=t||'';m.className='gpmsg'+(bad?' bad':'');m.style.display=t?'':'none'}
 else{m.textContent='';m.style.display='none';try{gnToast(t)}catch(e){}}};
const msgPick=(t)=>{msg(t,1);g('gpMsg').insertAdjacentHTML('beforeend',' <button type="button" class="alt sm" id="gpPick">🧾 Choose PDF</button>');g('gpPick').onclick=()=>pick('gpFT')};
function apply(){let on=false;try{on=curTab==='table'}catch(e){}
 const d=g('tabShow')&&g('tabShow').classList.contains('ltdaily');
 g('gpBox').hidden=!(on&&!d&&isOpen);g('gpTg').classList.toggle('gpon',on&&!d&&isOpen);sw.classList.toggle('gpopen',on&&!d&&isOpen);if(g('tabShow'))g('tabShow').classList.toggle('gpmode',on&&!d&&isOpen)}

/* ---------- portfolio maths ---------- */
/* v34: a Bank Asia transfer-in saved by this version (src X, no 'old' cost) is ON TOP of the statement whatever its date; older saves (with 'old') keep the old rule */
const isXN=t=>t.src==='X'&&!(t.old>0);
function calc(A){A=A||P;
 const H={},warn=[];let skipped=0;
 const asof=A.open?pDate(A.open.date):null;
 if(A.open)A.open.rows.forEach(r=>{const h=H[r.code]||(H[r.code]={q:0,c:0});h.q+=r.qty;h.c+=r.qty*r.avg});
 const ts=A.trades.map((t,i)=>({t,i,ts:pDate(t.date)||0})).sort((a,b)=>a.ts-b.ts||a.i-b.i);
 const used=[];
 for(const x of ts){const t=x.t;
  if(asof!==null&&x.ts<=asof&&!isXN(t)){skipped++;continue}/* v33: Bank Asia transfer-in (src X) is ON TOP of the statement, whatever its date */
  used.push(t);
  const h=H[t.code]||(H[t.code]={q:0,c:0});
  if(t.type==='Buy'){h.q+=t.qty;h.c+=t.qty*t.rate}
  else{const sq=Math.min(t.qty,h.q);if(t.qty>h.q)warn.push(t.code+': sold '+t.qty+' but only '+h.q+' held (opening missing?)');const a=h.q?h.c/h.q:0;h.c-=a*sq;h.q-=sq}
 }
 const list=Object.keys(H).filter(k=>H[k].q>0).sort().map(k=>({code:k,q:H[k].q,avg:H[k].c/H[k].q,cost:H[k].c}));
 return{list,skipped,warn,used,ts};
}
/* v5: code -> average buy price of the shares still held (active account), used by Table > Daily data 'Avg' column */
window.__pfAvg=function(){const m={};try{calc().list.forEach(r=>{if(r.avg>0)m[r.code]=r.avg})}catch(e){}return m};
const F={q:'',sec:'',cat:'',all:0,exp:{},op:{},sel:-1};
const metaMap=()=>{const m={};try{(LS('ds_lt_cache')||[]).forEach(r=>{if(r&&r.code)m[r.code]=r})}catch(e){}return m};
/* column size: tap a header (Name / Qty / Avg / Mark / Cost / Gain) = that column gets bigger (width + text), after the biggest it goes small again. Saved on the phone. */
const CW_K='ds_gp_cw',CW_MU=[.75,1,1.35,1.75],CW_FS=[.82,1,1.12,1.25],CW_BW=[1.7,.85,1,1,1.3,1.3];
let CW=(()=>{try{const a=JSON.parse(localStorage.getItem(CW_K));if(Array.isArray(a)&&a.length===6)return a.map(v=>v>=0&&v<=3?v|0:1)}catch(e){}return[1,1,1,1,1,1]})();
const cwCols=()=>{const w=CW_BW.map((b,i)=>b*CW_MU[CW[i]]),t=w.reduce((a,b)=>a+b,0);return '<colgroup>'+w.map(x=>'<col style="width:'+(x/t*100).toFixed(1)+'%">').join('')+'</colgroup>'};
const cwHead=()=>'<style>'+CW.map((v,i)=>v===1?'':'#gpBox .gpgrid td:nth-child('+(i+1)+'),#gpBox .gpgrid th:nth-child('+(i+1)+'){font-size:'+CW_FS[v]+'em}').join('')+'#gpBox .gpgrid thead th{cursor:pointer;user-select:none}</style>';
function draw(){{const ab=g('gpAll');if(ab){const n=P.trades.length>4;ab.disabled=!n;ab.querySelector('.gpl').textContent=F.all?'Hide Buy/Sell':'Show all Buy/Sell'}}
 fillAcc();const c=calc(),o=P.open,MM=metaMap();
 const secs=[...new Set(c.list.map(r=>(MM[r.code]||{}).sec).filter(x=>x&&x!=='–'))].sort(),se=g('gpS');
 if(F.sec&&secs.indexOf(F.sec)<0)F.sec='';
 if(se){se.innerHTML='<option value="">All sectors</option>'+secs.map(x=>'<option'+(x===F.sec?' selected':'')+'>'+esc(x)+'</option>').join('')}
 const q=F.q.trim().toUpperCase(),fl=(window.__shFav?window.__shFav.first:(a=>a))(c.list.filter(r=>(!q||r.code.toUpperCase().indexOf(q)>=0)&&(!F.sec||(MM[r.code]||{}).sec===F.sec)&&(!F.cat||(MM[r.code]||{}).cat===F.cat)),r=>r.code);
 g('gpSum').innerHTML=(o?'Opening: <b>'+esc(o.date)+'</b> ('+o.rows.length+' shares)':'Opening: <b>not set</b>')+' · Trades: <b>'+c.used.length+'</b>'+(c.skipped?' (+'+c.skipped+' older, ignored)':'')+' · Holding: <b>'+c.list.length+'</b> shares';
 let h='';
 /* v38: each share's own Buy/Sell sit right under it (latest 4; "Show all" for the rest). Sold-out shares get their own small list at the end. */
 const byCode={};c.ts.forEach(x=>{(byCode[x.t.code]||(byCode[x.t.code]=[])).push(x)});
 const LIM=4,tcell=(x)=>{const t=x.t,old=c.used.indexOf(t)<0;return '<tr class="gpsub" data-sel="'+x.i+'" style="'+(old?'opacity:.5':'')+'"><td><span class="gpd">'+esc(t.date)+'</span> <span class="'+(t.type==='Buy'?'gpb':'gps')+'">'+t.type+'</span> '+fm(t.qty,0)+' @ '+fm(t.rate)+' <button type="button" class="gpx" data-del="'+x.i+'" aria-label="Delete" style="'+(F.sel===x.i?'':'visibility:hidden')+'">✕</button></td><td class="gpq"></td><td></td><td></td><td></td><td></td></tr>'};
 const subs=code=>{const L=(byCode[code]||[]).slice().reverse();if(!L.length)return '';const all=F.all||F.exp[code],sh=all?L:L.slice(0,LIM);
  return sh.map(tcell).join('')+(L.length>LIM?'<tr class="gpsub gpmr"><td colspan="6"><button type="button" class="alt sm gpmore" data-more="'+esc(code)+'">'+(all?'▴ Show latest '+LIM+' only':'▾ Show all '+L.length+' Buy/Sell')+'</button></td></tr>':'')};
 if(fl.length)h+=cwHead()+'<table class="gpt gpgrid">'+cwCols()+'<thead><tr>'+['Name','Qty','Avg','Mark','Cost','Gain'].map((n,i)=>'<th data-c="'+i+'"'+(i===1?' class="gpq"':'')+' title="Tap: column size">'+n+'</th>').join('')+'</tr></thead><tbody>'+fl.map(r=>{const m=MM[r.code]||{},ok=m.ltp>0,gn=ok?m.ltp*r.q-r.cost:null;return '<tr class="gprow" data-open="'+esc(r.code)+'"><td>'+(F.all||F.op[r.code]?'▾ ':'▸ ')+esc(r.code)+(window.__shFav?window.__shFav.btn(r.code):'')+'</td><td class="gpq">'+fm(r.q,0)+'</td><td>'+fm(r.avg)+'</td><td class="gpmk">'+(ok?fm(m.ltp):'–')+'</td><td>'+fm(r.cost)+'</td><td class="'+(gn===null?'':gn>=0?'gpb':'gps')+'">'+(gn===null?'–':(gn>0?'+':'')+fm(gn))+'</td></tr>'+((F.all||F.op[r.code])?subs(r.code):'')}).join('')+(()=>{let gt=0,any=0;fl.forEach(r=>{const m=MM[r.code]||{};if(m.ltp>0){any=1;gt+=m.ltp*r.q-r.cost}});return '<tr><th>Total</th><th class="gpq">'+fm(fl.reduce((a,r)=>a+r.q,0),0)+'</th><th></th><th></th><th>'+fm(fl.reduce((a,r)=>a+r.cost,0))+'</th><th class="'+(!any?'':gt>=0?'gpb':'gps')+'">'+(any?(gt>0?'+':'')+fm(gt):'–')+'</th></tr>'})()+'</tbody></table>';
 else if(c.list.length)h+='<div class="ltnote">No shares match the filter.</div>';
 else h+='<div class="ltnote">No shares yet. Add the Portfolio PDF first, then Buy/Sell PDFs.</div>';
 if(c.warn.length)h+='<div class="gpmsg bad">'+c.warn.map(esc).join('<br>')+'</div>';
 {const held=new Set(c.list.map(r=>r.code)),gone=Object.keys(byCode).filter(k=>!held.has(k)&&(!q||k.toUpperCase().indexOf(q)>=0)).sort();
  if(gone.length&&!F.sec&&!F.cat)h+='<details><summary>Sold-out / not held ('+gone.length+')</summary><table class="gpt"><tbody>'+gone.map(k=>'<tr class="gprow" data-open="'+esc(k)+'"><td colspan="6"><b>'+esc(k)+'</b></td></tr>'+((F.all||F.op[k])?subs(k):'')).join('')+'</tbody></table></details>'}
 g('gpTb').innerHTML=h;
}

/* ---------- send to Cards ---------- */
/* History of portfolio statements: P.snaps = [{date,rows}] oldest first, P.open = the latest one. Same date again = replaced (never added twice). */
function setOpen(A,date,rows){
 const k=pDate(date),S=(A.snaps||[]).filter(x=>pDate(x.date)!==k);
 S.push({date,rows});S.sort((a,b)=>pDate(a.date)-pDate(b.date));
 A.snaps=S;A.open=S[S.length-1];touched.add(idOf(A))}
const R4=x=>String(Math.round(x*10000)/10000);
/* Same share + same date + same Buy/Sell = ONE card (qty added, price = weighted average) */
function trRows(list){
 const G={},ord=[];
 list.forEach(t=>{const k=t.date+'|'+t.type+'|'+t.code;if(!G[k]){G[k]={date:t.date,type:t.type,code:t.code,q:0,v:0};ord.push(k)}G[k].q+=t.qty;G[k].v+=t.qty*t.rate});
 return ord.map(k=>{const g=G[k];return[g.date,g.type,g.code,String(g.q),R4(g.v/g.q)]})}
function applyTr(H,t){const h=H[t.code]||(H[t.code]={q:0,c:0});
 if(t.type==='Buy'){h.q+=t.qty;h.c+=t.qty*t.rate}else{const sq=Math.min(t.qty,h.q),a=h.q?h.c/h.q:0;h.c-=a*sq;h.q-=sq}}
/* Cards rows: the first statement = all its shares (Buy); every LATER statement adds rows ONLY for shares whose quantity changed
   (after the Buy/Sell PDFs between the two dates are counted); Buy/Sell PDFs dated after the newest statement are added on top. */
function cardRowsOut(A){A=A||P;
 if(A.lg)return cardRowsLots(A);
 const out=[],S=(A.snaps&&A.snaps.length)?A.snaps:(A.open?[A.open]:[]);
 if(!S.length)return out;
 const H={};
 S[0].rows.forEach(r=>{out.push([S[0].date,'Buy',r.code,String(r.qty),String(r.avg)]);H[r.code]={q:r.qty,c:r.qty*r.avg}});
 const xr=A.trades.filter(isXN),tr=A.trades.map((t,i)=>({t,ts:pDate(t.date)||0,i})).filter(x=>!isXN(x.t)).sort((a,b)=>a.ts-b.ts||a.i-b.i);
 let lo=pDate(S[0].date);
 for(let k=1;k<S.length;k++){
  const hi=pDate(S[k].date),mid=tr.filter(x=>x.ts>lo&&x.ts<=hi).map(x=>x.t);
  trRows(mid).forEach(r=>out.push(r));mid.forEach(t=>applyTr(H,t));
  const sn={};S[k].rows.forEach(r=>{sn[r.code]=r});
  Object.keys(sn).forEach(code=>{const r=sn[code],h=H[code]||{q:0,c:0},d=r.qty-h.q;
   if(d>0){const pr=(r.qty*r.avg-h.c)/d;out.push([S[k].date,'Buy',code,String(d),R4(pr>0?pr:r.avg)])}
   else if(d<0){out.push([S[k].date,'Sell',code,String(-d),R4(h.q?h.c/h.q:r.avg)])}
   H[code]={q:r.qty,c:r.qty*r.avg}});
  Object.keys(H).forEach(code=>{if(!sn[code]&&H[code].q>0){const h=H[code];out.push([S[k].date,'Sell',code,String(h.q),R4(h.c/h.q)]);H[code]={q:0,c:0}}});
  lo=hi}
 const last=pDate(S[S.length-1].date);
 trRows(tr.filter(x=>x.ts>last).map(x=>x.t)).forEach(r=>out.push(r));
 trRows(xr).forEach(r=>out.push(r));/* v33: Bank Asia shares at the PDF's own price, never changed */
 return out}
/* ---------- v37: broker LEDGER (Client's Ledger Details PDF) ---------- */
/* The ledger lists every Buy / Sale of the account (Particulars = share code, long codes wrap onto the next line: ONEBANKPL + C), plus charges and
   deposits that are ignored. Buy rate = Debit / Qty (brokerage included, same as the "Cost price" of the portfolio statement), Sale rate = Credit / Qty.
   LEDGER_ALIAS = a code that the broker renamed. Share transfers from another broker are NOT in the ledger: add that broker's portfolio PDF as a transfer-in. */
const LEDGER_ALIAS={LHBL:'LHB'};
const isLedger=cells=>cells.some(r=>/CLIENT'?S\s+LEDGER\s+DETAILS/i.test(r.join(' ')));
function parseLedger(cells){
 const re=/^(\d{1,2}-[A-Za-z]{3}-\d{4})\s*(Buy|Sale|Sell)\s+(\S+)\s+([\d,]+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+-?[\d,]+\.\d+$/i;
 const out={client:clientOf(cells),from:null,to:null,trades:[]};let last=null,m;
 for(const r of cells){const l=r.join(' ').replace(/\s+/g,' ').trim();
  if(out.to===null&&(m=l.match(/Transaction\s*Date:?\s*From\s*(\d{1,2}-[A-Za-z]{3}-\d{4})\s*To\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i))){out.from=pDate(m[1]);out.to=pDate(m[2])}
  if((m=l.match(re))){const q=nz(m[4]),buy=/^buy$/i.test(m[2]),mon=nz(buy?m[8]:m[9]);
   if(!(q>0)){last=null;continue}
   last={date:dtxt(pDate(m[1])),type:buy?'Buy':'Sell',code:m[3].toUpperCase(),qty:q,rate:mon/q};out.trades.push(last);continue}
  if(last&&r.length===1&&/^[A-Z0-9()]{1,4}$/.test(l)){last.code+=l;last=null;continue}
  last=null}
 out.trades.forEach(t=>{if(LEDGER_ALIAS[t.code])t.code=LEDGER_ALIAS[t.code]});
 return out}
function addLedger(L,fname){
 if(!L.trades.length)throw new Error((fname||'PDF')+': no Buy/Sale rows found in this ledger');
 const id=accByClient(L.client)||AID(),A=S2.a[id];
 /* an older copy of the ledger is replaced; Buy/Sell confirmations inside the ledger period are already in it */
 A.trades=A.trades.filter(t=>t.src!=='L'&&!(!t.src&&L.from!==null&&L.to!==null&&pDate(t.date)>=L.from&&pDate(t.date)<=L.to));
 L.trades.forEach(t=>A.trades.push({date:t.date,type:t.type,code:t.code,qty:t.qty,rate:t.rate,conf:'ledger|'+(L.client||''),src:'L'}));
 A.lg=1;A.lgFrom=L.from;A.lgTo=L.to;A.sent=1;learn(A,L.client);touched.add(id);
 if(id!==AID())switchAcc(id,1);
 const b=L.trades.filter(t=>t.type==='Buy').length;
 return AN(id).name+' ledger '+(L.from!==null?dtxt(L.from)+' → '+dtxt(L.to):'')+': '+b+' buy, '+(L.trades.length-b)+' sell added'+(A.open?'':' · now add the latest Holdings PDF so the card total matches it')}
/* Cards rows for a ledger portfolio = the FULL history, one row per trade (Buy and Sell, so the Cards filter All / Buy / Sell works), plus:
   - a Sell row on the statement date for shares that the newest portfolio statement no longer has (or has fewer of), a Buy row for missing ones;
   - the buy prices of the lots that are STILL HELD are scaled per share so that qty x price = the statement's Cost Amount.
   So the Cards "Net" view (FIFO: a Sell uses the oldest Buy first - the same rule as cardsNet below) shows exactly the statement: same shares, same qty, same total cost
   (checked 45 shares / 35,279.08). All / Buy / Sell show the real history (sold lots keep their real prices). Trades dated after the statement are added on top. */
const R6=x=>String(Math.round(x*1e6)/1e6);
function cardRowsLots(A){
 const S=(A.snaps&&A.snaps.length)?A.snaps:(A.open?[A.open]:[]),snap=S.length?S[S.length-1]:null,sd=snap?pDate(snap.date):null;
 let seq=0;
 const mk=(date,type,code,q,p,old)=>({ts:pDate(date)||0,b:type==='Buy'?0:1,seq:seq++,d:date,type,code,q,p,old:old||0});
 const ord=(a,b)=>a.ts-b.ts||a.b-b.b||a.seq-b.seq;
 /* same order and FIFO rule as netRows() in pages/compare-show.js */
 const sim=list=>{const L={};list.slice().sort(ord).forEach(x=>{
   if(x.type==='Buy'){(L[x.code]||(L[x.code]=[])).push({x,q:x.q});return}
   const l=L[x.code];if(!l)return;let left=x.q;
   while(left>1e-12&&l.length){if(l[0].q<=left+1e-12){left-=l[0].q;l.shift()}else{l[0].q-=left;left=0}}});return L};
 const xrows=A.trades.filter(isXN).map(t=>mk(t.date,t.type,t.code,t.qty,t.rate,0));
 const all=A.trades.filter(t=>!isXN(t)).map(t=>mk(t.date,t.type,t.code,t.qty,t.rate,t.old));
 const pre=sd===null?all:all.filter(x=>x.ts<=sd),post=sd===null?[]:all.filter(x=>x.ts>sd);
 if(snap){
  const sn={};snap.rows.forEach(r=>{sn[r.code]=r});
  let L=sim(pre);
  const qv=l=>(l||[]).reduce((a,x)=>a+x.q,0),av=l=>{const q=qv(l);return q?l.reduce((a,x)=>a+x.q*x.x.p,0)/q:0};
  Object.keys(L).forEach(c=>{if(!sn[c]&&qv(L[c])>1e-9)pre.push(mk(snap.date,'Sell',c,qv(L[c]),av(L[c])))});
  Object.keys(sn).forEach(c=>{const r=sn[c],q=qv(L[c]);
   if(q>r.qty+1e-9)pre.push(mk(snap.date,'Sell',c,q-r.qty,av(L[c])));
   else if(q<r.qty-1e-9)pre.push(mk(snap.date,'Buy',c,r.qty-q,r.avg||0))});
  L=sim(pre);
  Object.keys(sn).forEach(c=>{const r=sn[c],l=L[c]||[],want=r.qty*r.avg,have=l.reduce((a,x)=>a+x.q*x.x.p,0);
   if(want>0&&have>0){const k=want/have;l.forEach(x=>{x.x.p*=k})}})}
 const rows=pre.concat(post,xrows).sort(ord),xo=rows.some(x=>x.old>0);
 return rows.map(x=>{const r=[x.d,x.type,x.code,String(Math.round(x.q*1e6)/1e6),R6(x.p)];if(xo)r.push(x.old>0?R6(x.old):'');return r})}
function sendCards(silent,id){
 id=id||AID();const A=S2.a[id],r=cardRowsOut(A);
 if(!r.length){if(!silent)msg('Nothing to send yet.',1);return}
 addFile(AN(id).file,[r[0].length>HDR.length?[...HDR,'Bank Asia cost']:HDR,...r],{size:0});A.sent=1;saveP();
 if(!silent){msg('\u2713 '+AN(id).name+' sent to Cards ('+r.length+' rows). Later Buy/Sell PDFs update it automatically.');try{setTab('show')}catch(e){}}
}
const changed=()=>{saveP();const ids=new Set(touched);ids.add(AID());touched.clear();draw();ids.forEach(id=>{try{sendCards(true,id)}catch(e){}})};/* v18: every Save / PDF / Gmail change goes to Cards (and so Table, Compare, Charts) at once, no separate Send needed */

/* v33: Buy Plan page can record a Buy / Sell straight into the active portfolio (then Cards, Table, Compare update by themselves) */
window.__pfTrade=function(type,code,qty,rate){try{qty=+qty;rate=+rate;code=String(code||'').toUpperCase();if(!(qty>0&&rate>0&&code))return false;const A=S2.a[S2.act];
 A.trades.push({date:dtxt(Date.now()+216e5),type:type==='Sell'?'Sell':'Buy',code:code,qty:qty,rate:rate,conf:'bp|'+Date.now(),src:'B'});touched.add(S2.act);changed();return true}catch(e){console.error('pfTrade',e);return false}};
/* ---------- PDF reading ---------- */
const b64u8=b=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u};
async function pdfRead(buf){
 await need('pdf');let pdf;
 try{pdf=await pdfjsLib.getDocument({data:buf,password:C.pdfpw||undefined}).promise}
 catch(e){if(e&&e.name==='PasswordException')throw new Error('This PDF has a password. Put it in Setup › PDF password.');throw e}
 const cells=[];
 for(let p=1;p<=pdf.numPages;p++){const tc=await(await pdf.getPage(p)).getTextContent();toRows(tc.items).forEach(r=>{r=r.map(x=>String(x).replace(/\s+/g,' ').trim()).filter(Boolean);if(r.length)cells.push(r)})}
 return{cells,lines:cells.map(r=>r.join(' '))};
}
const isConf=lines=>/TRADE\s+CONFIRMATION|CONFIRMATION\s+(OF|FOR)\s+TRADE|CONTRACT\s+NOTE/i.test(lines.join(' '));
function parseTrade(lines){
 const o={client:'',date:'',conf:'',trades:[]};let side=null,m;
 const row=/^([A-Z][A-Z0-9&._-]+)\s+(\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)$/;
 for(const l of lines){
  if(!o.client&&(m=l.match(/Client\s*Cod\w*\s+([A-Z0-9]+)/i)))o.client=m[1];
  if(!o.date&&(m=l.match(/Trading\s*Date:?\s*(?:From\s*)?(\d{1,2}-[A-Za-z]{3}-\d{4})/i)))o.date=m[1];
  if(!o.conf&&(m=l.match(/Confirmation\s*N\w*\s+(\d+)\s*-\s*(\d+)/i)))o.conf=m[1]+'-'+m[2];
  if(/^(Buy|Sale|Sell)$/i.test(l)){side=/^buy$/i.test(l)?'Buy':'Sell';continue}
  if(side&&(m=l.match(row)))o.trades.push({type:side,code:m[1],qty:+m[2],rate:nz(m[3])});
 }
 return o}
/* a Buy/Sell confirmation -> trades (same confirmation twice = replaced, never doubled) */
function accByClient(c){c=String(c||'').toUpperCase();if(!c)return null;const x=ACCS.find(y=>S2.a[y.id].clients.indexOf(c)>=0);return x?x.id:null}
function addConfirmation(p,fname){
 if(!p.trades.length)throw new Error((fname||'PDF')+': no Buy/Sale rows found');
 const id=accByClient(p.client)||AID(),A=S2.a[id];
 const date=p.date||dtxt(Date.now());
 if(A.lg&&A.lgTo!==null&&A.lgTo!==undefined&&pDate(date)<=A.lgTo)return AN(id).name+' '+date+': already inside the ledger, skipped';
 const key=(p.client||'')+'|'+date+'|'+(p.conf||fname||'');
 A.trades=A.trades.filter(t=>t.conf!==key);
 p.trades.forEach(t=>A.trades.push({date,type:t.type,code:t.code,qty:t.qty,rate:t.rate,conf:key}));touched.add(id);
 const b=p.trades.filter(t=>t.type==='Buy').length;
 return AN(id).name+' '+date+': '+b+' buy, '+(p.trades.length-b)+' sell ('+p.trades.map(t=>t.code+' '+(t.type==='Buy'?'+':'-')+t.qty).join(', ')+')';
}
/* portfolio statement -> proposed opening rows. Layout is detected by data pattern (code + numbers), so it needs no fixed columns. */
const SKIP=/^(TOTAL|GRAND|SUB|PAGE|CLIENT|NAME|BO|DATE|PRINTED|BALANCE|CASH|LEDGER|MARKET|PORTFOLIO|SECTOR|INSTRUMENT|SCRIP|CODE|SL|NO|ID|PHONE|ADDRESS|EXPOSURE|EQUITY|AVAILABLE|IMMATURED|UNCLEAR|CURRENT|ACCRUED|REALIZED|UNREALIZED|LOAN|PURCHASE|NET|GAIN|CAPITAL|DEPOSIT|WITHDRAW|ACCOUNT)\b/i;
function parsePortfolio(cells){
 {const lb=parsePortfolioLB(cells);if(lb)return lb}
 {const ln=parsePortfolioLN(cells);if(ln)return ln}
 {const fc=parsePortfolioFC(cells);if(fc)return fc}
 {const mw=parsePortfolioMW(cells);if(mw)return mw}
 let asof=null,hdr=null;
 for(const r of cells){const l=r.join(' ');
  const m=l.match(/(?:as\s*(?:on|of|at)|up\s*to|till|statement\s*date|report\s*date|date)\s*[:\-]?\s*(\d{1,2}[-\/. ][A-Za-z]{3}[a-z]*[-\/., ]+\d{2,4}|\d{1,2}[-\/.]\d{1,2}[-\/.]\d{2,4}|\d{4}-\d{1,2}-\d{1,2})/i);
  if(m&&pDate(m[1])!==null&&asof===null)asof=pDate(m[1]);
  if(!hdr&&r.length>=3&&r.filter(c=>/qty|quantity|avg|average|cost|rate|price|value|balance|instrument|scrip|symbol|company/i.test(c)&&isNaN(nz(c))).length>=3)hdr=r}
 const out=[];
 for(const r of cells){
  if(r===hdr)continue;
  const ci=r.findIndex(c=>/^[A-Za-z][A-Za-z0-9&._-]{2,24}$/.test(c)&&!SKIP.test(c)&&isNaN(nz(c)));
  if(ci<0)continue;
  const nums=r.slice(ci+1).filter(c=>/^-?[\d,]*\.?\d+$/.test(c)&&c!=='').map(nz);
  if(nums.length<2)continue;
  let qi=-1,ai=-1;
  if(hdr&&hdr.length===r.length){
   const L=hdr.map(x=>x.toLowerCase());
   const qn=L.findIndex((x,i)=>i>ci&&/qty|quantity|shares|balance|holding/.test(x)),an=L.findIndex((x,i)=>i>ci&&/avg|average/.test(x))>=0?L.findIndex((x,i)=>i>ci&&/avg|average/.test(x)):L.findIndex((x,i)=>i>ci&&/cost.*(rate|price)|buy.*(rate|price)|rate/.test(x));
   if(qn>=0&&an>=0){const q=nz(r[qn]),a=nz(r[an]);if(!isNaN(q)&&!isNaN(a)){out.push({code:r[ci].toUpperCase(),qty:q,avg:a});continue}}
  }
  const q=nums.findIndex(n=>n>=1&&Math.round(n)===n);
  if(q<0)continue;
  const a=nums.slice(q+1).find(n=>n>0&&Math.round(n*100)/100===n&&n<100000);
  out.push({code:r[ci].toUpperCase(),qty:nums[q],avg:a===undefined?0:a});
 }
 const m={};out.forEach(o=>{const k=m[o.code];if(k){k.avg=(k.avg*k.qty+o.avg*o.qty)/(k.qty+o.qty);k.qty+=o.qty}else m[o.code]={code:o.code,qty:o.qty,avg:o.avg}});
 return{asof,rows:Object.values(m)};
}
/* LankaBangla "CLIENT WISE PORTFOLIO STATEMENT" (verified on a real PDF): row = CODE CAT SALEABLE LIEN LOCK TOTAL-QTY COST-PRICE COST-AMT MKT-PRICE MKT-VALUE %PORT GAIN %GAIN.
   Qty = Total Qty (it includes shares bought today that are not yet saleable), avg = cost amount / total qty. The date used is "Printed On" (the
   "As On" line of this statement can show a later day); the total cost line is checked against the sum of the rows. */
function parsePortfolioLB(cells){
 const re=/^([A-Z0-9][A-Z0-9&._()\-]*)\s+([A-Z])\s+([\d,]+)\s+\d+\s+\d+\s+([\d,]+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+[\d,]+\.\d+\s+[\d,]+\.\d+\s+\d+\.\d+\s+-?[\d,]+\.\d+\s+-?[\d,]+\.\d+$/;
 let printed=null,ason=null,tot=null,sum=0;const rows=[];let m;
 for(const r of cells){const l=r.join(' ');
  if(printed===null&&(m=l.match(/Printed\s*On:?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i)))printed=pDate(m[1]);
  if(ason===null&&(m=l.match(/As\s*On:?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i)))ason=pDate(m[1]);
  if((m=l.match(re))){const q=nz(m[4]),pr=nz(m[5]),am=nz(m[6]);
   rows.push({code:m[1],qty:q,avg:(q>0&&Math.abs(am/q-pr)<=pr*0.01+0.005)?am/q:pr});sum+=am;continue}
  if((m=l.match(/^Total:?\s+([\d,]+\.\d+)\s+[\d,]+\.\d+\s+100\b/)))tot=nz(m[1]);
 }
 if(!rows.length)return null;
 const asof=printed!==null?printed:ason;
 let note='Found '+rows.length+' shares';
 if(tot!==null)note+=Math.abs(tot-sum)<1?' · total cost matches the PDF ('+fm(tot)+') ✓':' · total cost differs from the PDF ('+fm(sum)+' vs '+fm(tot)+'), check the list';
 if(printed!==null&&ason!==null&&printed!==ason)note+=' · date = printed '+dtxt(printed)+' (statement says As On '+dtxt(ason)+')';
 return{asof,rows,note:note+'. Check, then Save.'};
}
/* v26: NEW LankaBangla layout (seen on the 07/08-Nov-2026 statement): NO category column and the first column is the COMPANY NAME, not the trading code
   (only a few rows show a code, with a leading *, e.g. *BATBC). Row = NAME SALEABLE LIEN LOCK TOTAL-QTY COST-PRICE COST-AMT MKT-PRICE MKT-VALUE %PORT GAIN %GAIN.
   A long name can touch the saleable qty (\"...PLC21\"), so the row is read from the RIGHT: the last 10 numbers are fixed, what is left = name + saleable qty.
   Qty = Total Qty, avg = cost amount / total qty, date = Printed On (else As On), same rules as the old LB layout. Names -> codes with baCode() (BA_ALIAS table). */
function parsePortfolioLN(cells){
 const re=/^(.+?)\s*([\d,]+)\s+\d+\s+\d+\s+([\d,]+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+[\d,]+\.\d+\s+[\d,]+\.\d+\s+\d+\.\d+\s+-?[\d,]+\.\d+\s+-?[\d,]+\.\d+$/;
 let known=null;try{known=typeof knownCodes==='function'?knownCodes():null}catch(e){}
 const rows=[],guess=[];let sum=0,m,printed=null,ason=null;
 for(const r of cells){const l=r.join(' ').replace(/\s+/g,' ').trim();
  if(printed===null&&(m=l.match(/Printed\s*On:?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i)))printed=pDate(m[1]);
  if(ason===null&&(m=l.match(/As\s*On:?\s*(\d{1,2}-[A-Za-z]{3}-\d{4})/i)))ason=pDate(m[1]);
  if(!(m=l.match(re)))continue;
  const nm=m[1].replace(/^\*+\s*/,'').trim(),q=nz(m[3]),pr=nz(m[4]),am=nz(m[5]);
  if(!/[A-Za-z]/.test(nm)||/^(TOTAL|GRAND|SUB|PAGE)\b/i.test(nm)||!(q>0))continue;
  const c=baCode(nm,known);if(!c.ok)guess.push(nm+' \u2192 '+c.code);
  rows.push({code:c.code,qty:q,avg:(Math.abs(am/q-pr)<=pr*0.01+0.005)?am/q:pr});sum+=am}
 if(!rows.length)return null;
 const o=stmtPack(rows,cells,sum,'LankaBangla layout');if(!o)return null;
 o.asof=printed!==null?printed:ason;
 const dn=(printed!==null&&ason!==null&&printed!==ason)?' \u00b7 date = printed '+dtxt(printed)+' (statement says As On '+dtxt(ason)+')':'';
 o.note=o.note.replace(/\. Check, then Save\.$/,'')+dn+' \u00b7 this statement lists company names, so share codes were matched by name'+(guess.length?' \u2014 please check: '+guess.join(', '):'')+'. Check, then Save.';
 return o}
/* Statement layouts seen so far (3): LankaBangla (above), First Capital Securities (FC) and Midway Securities (MW). Each one has its own row pattern; the first that finds rows wins.
   FC  "Portfolio Statement As On: 27-Oct-2026": row = CODE CAT TOTAL SALEABLE AVGCOST TOTALCOST BEP MKTRATE MKTVALUE UNREALISED(+arrow, %) REALISED %MKTVAL (code may hold brackets: AMCL(PRAN))
   MW  "Portfolio Statement As On : 28 Oct 2026": row = CODE (CAT) TOTALQTY SALEABLEQTY LOCK/PLEDGE("-" or number) AVGCOST BREAKEVEN TOTALCOST MKTRATE MKTVALUE UNREALISED G/L% PE;
       sections (Saleable / Un-...) each end with a "Total :" line, the last "Total :" is the grand total.
   Qty = Total quantity (includes shares that are not saleable yet), avg = Average cost. */
function stmtDate(cells){let m,ason=null,pr=null;
 for(const r of cells){const l=r.join(' ');
  if(ason===null&&(m=l.match(/Portfolio\s+Statement\s+As\s+On\s*:?\s*(\d{1,2}[-\/. ][A-Za-z]{3}[a-z]*[-\/. ]\d{2,4})/i)))ason=pDate(m[1]);
  if(pr===null){
   if((m=l.match(/Printed\s*On\s*:?\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i))){const x=+m[1],y=+m[2];pr=x>12?Date.UTC(+m[3],y-1,x):Date.UTC(+m[3],x-1,y)} /* Midway prints M/D/YYYY */
   else if((m=l.match(/Printed\s*On\s*:?\s*(\d{1,2}[-\/. ][A-Za-z]{3}[a-z]*[-\/. ]\d{2,4})/i)))pr=pDate(m[1])}}
 return{asof:pr!==null?pr:ason,ason,printed:pr}}
function stmtTotalNote(cells,sum){let seenTot=false,hit=false,tv=null,m;
 for(const r of cells){const l=r.join(' ');if(!/^(Grand\s+)?Total\s*:?/i.test(l))continue;
  const nums=(l.match(/-?[\d,]+\.\d+/g)||[]).map(nz);if(!nums.length)continue;seenTot=true;tv=nums[0];if(nums.some(n=>Math.abs(n-sum)<1))hit=true}
 if(hit)return' · total cost matches the PDF ('+fm(sum)+') ✓';
 return seenTot?' · total cost differs from the PDF ('+fm(sum)+' vs '+fm(tv)+'), check the list':''}
function stmtPack(rows,cells,sum,name){if(!rows.length)return null;
 const mg={};rows.forEach(o=>{const k=mg[o.code];if(k){k.avg=(k.avg*k.qty+o.avg*o.qty)/(k.qty+o.qty);k.qty+=o.qty}else mg[o.code]={code:o.code,qty:o.qty,avg:o.avg,mp:o.mp}});
 const list=Object.values(mg);
 const sd=stmtDate(cells);let dn='';
 if(sd.printed!==null&&sd.ason!==null&&sd.printed!==sd.ason)dn=' · date = printed '+dtxt(sd.printed)+' (statement says As On '+dtxt(sd.ason)+')';
 return{asof:sd.asof,rows:list,note:name+': found '+list.length+' shares'+stmtTotalNote(cells,sum)+dn+'. Check, then Save.'}}
function parsePortfolioFC(cells){
 const re=/^([A-Z0-9][A-Z0-9&._()\-]*)\s+([A-Z])\s+([\d,]+)\s+([\d,]+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+(-?[\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)(?:\s|$)/;
 const rows=[];let sum=0,m;
 for(const r of cells){const l=r.join(' ').replace(/[\u25B2\u25BC\u25B4\u25BE\u2191\u2193]/g,' ').replace(/\s+/g,' ').trim();
  if((m=l.match(re))){const q=nz(m[3]),av=nz(m[5]),tc=nz(m[6]);
   if(!(q>0))continue;
   rows.push({code:m[1],qty:q,avg:(Math.abs(tc/q-av)<=av*0.01+0.005)?tc/q:av});sum+=tc}}
 return stmtPack(rows,cells,sum,'First Capital layout')}
function parsePortfolioMW(cells){
 const re=/^(?:\d+\s+)?([A-Z0-9][A-Z0-9&._()\-]*)\s*(?:\(([A-Z])\))?\s+([\d,]+)\s+([\d,]+)\s+(?:-|[\d,]+)\s+([\d,]+\.\d+)\s+(-?[\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)(?:\s|$)/;
 const rows=[];let sum=0,m;
 for(const r of cells){const l=r.join(' ').replace(/\s+/g,' ').trim();
  if((m=l.match(re))){const q=nz(m[3]),av=nz(m[5]),tc=nz(m[7]);
   if(!(q>0))continue;
   rows.push({code:m[1].replace(/\(([A-Z])\)$/,''),qty:q,avg:(Math.abs(tc/q-av)<=av*0.01+0.005)?tc/q:av});sum+=tc}}
 return stmtPack(rows,cells,sum,'Midway layout')}
/* Bank Asia Securities "CLIENT WISE PORTFOLIO STATEMENT": row = COMPANY NAME TOTAL SALEABLE RATE COST-AMT MKT-PRICE MKT-VALUE RECEIVE DELIVERY GAIN %GAIN.
   It lists company NAMES, not trading codes, so names are mapped to codes (BA_ALIAS, the live table codes, or a name that already is a code);
   anything not sure is listed in the note: check those codes in the preview. avg = cost amount / total qty. Date = Printed On (else As On). */
const BA_ALIAS={'ab bank 1st mf':'ABB1STMF','amcl':'AMCL(PRAN)','batbc':'BATBC','first bangladesh fix incom fund':'FBFIF','first bangladesh fixed income fund':'FBFIF','first janata bank mf':'1JANATAMF','grameenphone ltd':'GP','grameenphone':'GP','ific bank 1st mf':'IFIC1STMF','mbl 1st mutual fund':'MBL1STMF','php first mf':'PHPMF1','popular life 1st mf':'POPULAR1MF'};
/* v26: company names printed by the new LankaBangla layout -> DSE trading code (a name that already is a code, like *BATBC, needs no entry).
   If the live table is loaded (>=150 codes) a code that is not in it is listed in the preview note as "please check". */
(function(){const L={'Eastern Bank PLC':'EBL','Express Insurance Limited':'EXPRESSINS','LafargeHolcim Bangladesh PLC.':'LHB','Summit Power Limited':'SUMITPOWER',
 'Taufika Foods and Lovello Ice-cream PLC':'TAUFIKA','Uttara Bank PLC':'UTTARABANK','1st BD FIX INC FUND':'FBFIF','Active Fine Chemical':'ACTIVEFINE',
 'Agricultural Marketing Company Ltd. (Pran)':'AMCL(PRAN)','Alif Manufacturing Company Ltd.':'ALIF','Appollo Ispat Complex Limited':'APOLOISPAT','Baraka Power Limited':'BARAKAPOWER',
 'BEXIMCO LTD.':'BEXIMCO','CENTRAL PHARMACEUTICALS LIMITED':'CENTRALPHL','Doreen Power Generations and Systems Limited':'DOREENPWR','Energypac Power Generation PLC':'EPGL',
 'Familytex (BD) Limited':'FAMILYTEX','Far Chemical Industries Limited':'FARCHEM','Fu-Wang Ceramic Industries Ltd.':'FUWANGCER','Intech Limited':'INTECH',
 'Islami Bank Bangladesh PLC':'ISLAMIBANK','Keya Cosmetics Ltd':'KEYACOSMET','LIBRA INFUSION LTD':'LIBRAINFU','National Bank Ltd.':'NBL','NURANI DYEING & SWEATER LIMITED':'NURANI',
 'Olympic Accessories Limited':'OAL','ONE BANK PLC':'ONEBANKPLC','ORION INF.(MALA)':'ORIONINFU','PREMIER BANK PLC':'PREMIERBAN','QUEEN SOUTH TEXTILE MILLS LTD.':'QUEENSOUTH',
 'Ratanpur Steel Re-Rolling Mills Limited':'RSRMSTEEL','S. S. Steel Limited':'SSSTEEL','SAIF Powertec Limited':'SAIFPOWER','Sharp Industries PLC':'SHARPIND',
 'Shinepukur Ceramics Limited':'SHINEPUKUR','Trust Bank 1st MF':'TRUSTB1MF','ZAHEEN SPINNING LIMITED':'ZAHEENSPIN'};
 Object.keys(L).forEach(n=>{const k=n.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();if(!BA_ALIAS[k])BA_ALIAS[k]=L[n]})})();
function baCode(name,known){name=String(name).replace(/^\*+\s*/,'').trim();
 const k=name.toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 if(BA_ALIAS[k]){const c=BA_ALIAS[k];return{code:c,ok:(known&&!known.has(c.toUpperCase()))?0:1}}
 const u=name.toUpperCase().replace(/[^A-Z0-9]/g,'');
 if(known&&known.has(u))return{code:u,ok:1};
 if(/^[A-Z0-9][A-Z0-9&._()\-]{1,14}$/.test(name))return{code:name,ok:1};
 return{code:u,ok:0}}
function parsePortfolioBA(cells){
 const re=/^([A-Za-z][A-Za-z0-9&._() \-]*?)\s+([\d,]+)\s+([\d,]+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+([\d,]+\.\d+)\s+\d+\s+\d+\s+-?[\d,]+\.\d+\s+-?[\d,]+\.\d+$/;
 let known=null;try{known=typeof knownCodes==='function'?knownCodes():null}catch(e){}
 const rows=[],guess=[];let sum=0,m,ason=null;
 for(const r of cells){const l=r.join(' ').replace(/\s+/g,' ').trim();
  if(ason===null&&(m=l.match(/As\s*On:?\s*(\d{1,2}[-\/. ][A-Za-z]{3}[a-z]*[-\/. ]\d{2,4})/i)))ason=pDate(m[1]);
  if((m=l.match(re))){const q=nz(m[2]),rate=nz(m[4]),am=nz(m[5]);if(!(q>0))continue;
   const c=baCode(m[1].trim(),known);if(!c.ok)guess.push(m[1].trim()+' \u2192 '+c.code);
   rows.push({code:c.code,qty:q,avg:(Math.abs(am/q-rate)<=rate*0.01+0.005)?am/q:rate,mp:nz(m[6])});sum+=am}}
 const o=stmtPack(rows,cells,sum,'Bank Asia layout');if(!o)return null;o.ba=1;
 if(o.asof===null||o.asof===undefined)o.asof=ason;
 o.note=o.note.replace(/\. Check, then Save\.$/,'')+' \u00b7 this statement lists company names, so share codes were matched by name'+(guess.length?' \u2014 please check: '+guess.join(', '):'')+'. Check, then Save.';
 return o}
function clientOf(cells){let m;for(const r of cells){const l=r.join(' ');if((m=l.match(/(?:Client|Investor)\s*Code\s*:?\s*([A-Z0-9]{3,})/i)))return m[1].toUpperCase()}return ''}
function readStmt(cells){let o;
 if((o=parsePortfolioLB(cells))&&o.rows.length)return{id:'lb',o,cl:clientOf(cells)};
 if((o=parsePortfolioLN(cells))&&o.rows.length)return{id:'lb',o,cl:clientOf(cells)};
 if((o=parsePortfolioFC(cells))&&o.rows.length)return{id:'fc',o,cl:clientOf(cells)};
 if((o=parsePortfolioMW(cells))&&o.rows.length)return{id:'mw',o,cl:clientOf(cells)};
 if((o=parsePortfolioBA(cells))&&o.rows.length)return{id:null,o,cl:clientOf(cells)};
 return null}
function fillAcc(){const se=g('gpAc');if(!se)return;
 se.innerHTML=ACCS.map(x=>{const a=S2.a[x.id],n=a.open?calc(a).list.length:0;return'<option value="'+x.id+'"'+(x.id===S2.act?' selected':'')+'>'+esc(x.name)+(n?' ('+n+')':'')+'</option>'}).join('')}
function switchAcc(id,quiet){
 if(!AN(id))return;S2.act=id;P=S2.a[id];saveP();pendCl='';
 F.q='';F.sec='';F.cat='';try{g('gpQ').value='';g('gpS').value='';g('gpK').value=''}catch(e){}
 g('gpPv').hidden=true;if(!g('gmPn').hidden)fillC();draw();if(!quiet)msg('')}
/* Cards page PDF upload of a broker statement = the SAME as Portfolio > Holdings: it REPLACES the saved opening (never adds a second copy),
   Buy/Sell PDFs dated after it are added on top. An older statement than the saved one is ignored. Returns {note} or null (not a statement). */
window.__stmtOpen=function(cells){
 const rs=readStmt(cells);
 /* v33: Bank Asia statement (company names, no broker/account id) sent from the preview or pasted: it was NOT recognised here, so it fell through to the
    generic table (value|label columns, no shares). Now it opens the same checked preview as Table > Portfolio > Portfolio PDF (nothing is saved until Save). */
 if(rs&&!rs.id&&rs.o&&rs.o.ba&&rs.o.rows.length){
  pendCl=rs.cl;pendBA={mp:{}};rs.o.rows.forEach(x=>{pendBA.mp[x.code]=x.mp});
  const o=rs.o;
  /* the preview's Send switches tab AFTER this returns, so go to the portfolio page a moment later */
  setTimeout(()=>{try{setTab('table');if(!isOpen)g('gpTg').click();draw();apply();
   showPreview(o.rows,o.asof,(o.note||'Found '+o.rows.length+' shares.')+' · If these shares were TRANSFERRED into '+AN(AID()).name+' from this broker, tap “Add as transfer-in” (valued at the market price of the statement, like the broker does).')}catch(e){console.error(e)}},400);
  return{note:'Bank Asia portfolio read: '+o.rows.length+' shares. Opening the Portfolio page to check them…'}}
 if(!rs||!rs.id)return null;
 const id=rs.id,A=S2.a[id],o=rs.o,nm=AN(id).name;
 const t=o.asof!==null&&o.asof!==undefined?o.asof:Date.now();
 if(A.open){const cur=pDate(A.open.date);if(cur!==null&&t<cur)return{note:nm+': this statement ('+dtxt(t)+') is older than the saved portfolio ('+A.open.date+'), so it was ignored.'}}
 setOpen(A,dtxt(t),o.rows);learn(A,rs.cl);if(id!==AID())switchAcc(id,1);saveP();draw();sendCards(true,id);touched.delete(id);
 return{note:nm+' portfolio updated (not added again): '+o.rows.length+' shares as on '+A.open.date+'. Cards get new rows only for shares that changed; Buy/Sell PDFs after this date add on top.'}};
/* Cards page PDF upload of a Buy/Sell confirmation or a broker LEDGER = the SAME as Portfolio > Buy/Sell: it goes into the portfolio trades
   (same confirmation twice = replaced, ledger = replaces the older ledger), then Cards are rebuilt. It is never added as a separate file,
   so the same trade can not be counted twice. Returns {note} or null (not a trade PDF). */
window.__tradePdf=function(cells,fname){
 const lines=cells.map(r=>r.join(' '));
 try{
  if(isLedger(cells)){const t=addLedger(parseLedger(cells),fname);changed();return{note:'✓ '+t+' (replaced, not added again)'}}
  const pt=parseTrade(lines);
  if(isConf(lines)||pt.trades.length){
   const id=accByClient(pt.client)||AID(),t=addConfirmation(pt,fname);changed();
   if(!S2.a[id].sent&&(S2.a[id].open||(S2.a[id].snaps&&S2.a[id].snaps.length)))try{sendCards(true,id)}catch(e){}
   return{note:'✓ '+t+' (same confirmation again = replaced, not added twice)'+(S2.a[id].open?'':' · add the Portfolio statement PDF too, so Cards can show it')}}
 }catch(e){return{note:(fname||'PDF')+': '+(e&&e.message||e)}}
 return null};
/* v34: is a Bank Asia statement ALREADY inside the saved LankaBangla statement? When shares are transferred in, the LankaBangla statement holds them but the
   LankaBangla ledger has no Buy for them. So: saved statement qty - (qty from the ledger/trades up to the statement date) >= the Bank Asia qty means "already inside".
   Returns true / false, or null when there is no ledger to compare with. */
function baInside(rows,A){A=A||P;if(!A.open||!rows||!rows.length)return null;
 const ls=A.trades.filter(t=>t.src==='L');if(!ls.length)return null;
 const asof=pDate(A.open.date),H={};
 A.trades.forEach(t=>{if(isXN(t)||t.src==='X')return;const ts=pDate(t.date)||0;if(asof!==null&&ts>asof)return;H[t.code]=(H[t.code]||0)+(t.type==='Buy'?t.qty:-t.qty)});
 const O={};A.open.rows.forEach(r=>{O[r.code]=(O[r.code]||0)+r.qty});
 let hit=0;rows.forEach(r=>{if((O[r.code]||0)-(H[r.code]||0)>=r.qty-0.5)hit++});
 return hit===rows.length}
const rowsToText=rows=>rows.map(r=>r.code+' '+r.qty+' '+(+r.avg.toFixed(4))).join('\n');
function textToRows(t){
 const rows=[],bad=[];
 t.split(/\r?\n/).forEach(l=>{l=l.trim();if(!l)return;
  const m=l.match(/^([A-Za-z0-9][A-Za-z0-9&._()-]*)[\s,;\t]+([\d,]+(?:\.\d+)?)(?:[\s,;\t]+([\d,]+(?:\.\d+)?))?$/);
  if(!m)bad.push(l);else rows.push({code:m[1].toUpperCase(),qty:nz(m[2]),avg:m[3]?nz(m[3]):0})});
 return{rows,bad}}
let precise={};
function showPreview(rows,asof,note){
 precise={};rows.forEach(r=>{precise[r.code]=r});
 g('gpPv').hidden=false;g('gpTx').value=rowsToText(rows);g('gpXf').hidden=!pendBA;
 g('gpDt').value=asof!==null&&asof!==undefined?diso(asof):(P.open?diso(pDate(P.open.date)):'');
 if(pendBA){const k=baInside(rows);if(k!==null)note=(note||'')+(k?' \u00b7 \u2713 These shares are ALREADY inside the saved LankaBangla statement, so they are not added again (\u201cAdd as transfer-in\u201d will not add them).':' \u00b7 These shares are NOT in the saved LankaBangla statement: \u201cAdd as transfer-in\u201d adds them at the Bank Asia PDF price.')}
 if(note)msg(note,rows.length?0:1);g('gpPv').scrollIntoView({block:'nearest'})}

/* ---------- file handlers ---------- */
async function onTradeFile(f){
 const d=await pdfRead(await f.arrayBuffer());
 if(isLedger(d.cells))return addLedger(parseLedger(d.cells),f.name);
 if(!isConf(d.lines))throw new Error(f.name+': this is not a Buy/Sell confirmation PDF (use 📕 Portfolio PDF for the portfolio statement).');
 return addConfirmation(parseTrade(d.lines),f.name)}
async function onPortfolioFile(f){
 const d=await pdfRead(await f.arrayBuffer());pendBA=null;
 if(isLedger(d.cells)){const t=addLedger(parseLedger(d.cells),f.name);changed();msg('\u2713 '+t);return}
 if(isConf(d.lines)){const t=addConfirmation(parseTrade(d.lines),f.name);changed();msg('This was a Buy/Sell confirmation, added as a trade: '+t);return}
 const rs=readStmt(d.cells);let r,sn='';
 if(rs&&rs.id){if(rs.id!==AID()){switchAcc(rs.id,1);sn=' \u2192 opened in the '+AN(rs.id).name+' portfolio.'}r=rs.o;pendCl=rs.cl}
 else{r=rs?rs.o:parsePortfolio(d.cells);pendCl=clientOf(d.cells)}
 if(rs&&!rs.id&&rs.o.ba){pendBA={mp:{}};r.rows.forEach(x=>{pendBA.mp[x.code]=x.mp})}
 showPreview(r.rows,r.asof,r.rows.length?(r.note||'Found '+r.rows.length+' shares. Check them, set the date, then Save.')+sn+(pendBA?' \u00b7 If these shares were TRANSFERRED into '+AN(AID()).name+' from this broker, tap \u201cAdd as transfer-in\u201d (valued at the market price of the statement, like the broker does).':''):'Could not read the shares from this PDF. Type them below (NAME QTY AVG-COST per line) and Save.');
}
function pick(id){const i=g(id);i.value='';try{i.click()}catch(e){}}

/* ---------- Gmail AUTO ---------- */
const cbs={};let seq=0;
window.__gmRes=(id,ok,p)=>{const c=cbs[id];delete cbs[id];if(!c)return;try{c(ok,new TextDecoder('utf-8').decode(b64u8(p)))}catch(e){c(false,String(e&&e.message||e))}};
function bridgeFetch(){return new Promise((res,rej)=>{
 const id='gm'+(++seq);
 const tm=setTimeout(()=>{delete cbs[id];rej(new Error('Gmail did not answer (time out)'))},90000);
 cbs[id]=(ok,t)=>{clearTimeout(tm);if(!ok)return rej(new Error(t||'Gmail error'));try{res(JSON.parse(t))}catch(e){rej(new Error('Gmail answer unreadable'))}};
 try{window.Android.gmailFetch(C.user,C.pass,fromOf(AID()),+C.days||10,id)}catch(e){clearTimeout(tm);delete cbs[id];rej(e)}})}
async function runAuto(silent){
 if(!hasBridge())throw new Error('Gmail Auto needs the new APK (this one has no Gmail support).');
 if(!googleOk&&(!C.user||!C.pass))throw new Error('Sign in with Google (Setup) or set Gmail address + App password.');
 msg(googleOk?'Checking Gmail (Google account)…':'Checking Gmail…');
 let raw;try{raw=await bridgeFetch()}finally{C.last=Date.now();saveC()}
 let list=Array.isArray(raw)?raw:((raw&&raw.p)||[]);const nMail=Array.isArray(raw)||!raw||raw.n===undefined?-1:raw.n;
 const key=a=>(a.name||'')+'|'+(a.date||'')+'|'+(a.id||'');
 if(silent)list=list.filter(a=>!seen.includes(key(a)));
 if(!list.length)throw new Error(silent?'No new PDF in Gmail.':(nMail>=0?'Gmail connected: '+nMail+' mail(s) in the last '+C.days+' days'+(fromOf(AID())?' from '+fromOf(AID()):'')+', but no PDF attachment. ':'No PDF mail found'+(fromOf(AID())?' from '+fromOf(AID()):'')+' in the last '+C.days+' days. ')+'Check the Broker email in Setup (empty = any sender) or choose a longer period.');
 const ok=[],bad=[],pfs=[];let other=0,old=0;
 for(const a of list){
  try{const d=await pdfRead(b64u8(a.b64).buffer);
   if(isLedger(d.cells)){ok.push(addLedger(parseLedger(d.cells),a.name));seen.push(key(a));continue}
   const pt=parseTrade(d.lines);
   if(isConf(d.lines)||pt.trades.length){ok.push(addConfirmation(pt,a.name));seen.push(key(a));continue}
   /* a broker portfolio statement (LankaBangla / First Capital / Midway layouts) */
   const rs=readStmt(d.cells),o=rs&&rs.id?rs.o:null;
   if(o&&o.rows.length){
    const t=(o.asof!==null&&o.asof!==undefined)?o.asof:(a.date?Math.floor(a.date/864e5)*864e5:Date.now());
    pfs.push({id:rs.id,t,rows:o.rows,cl:rs.cl});seen.push(key(a));continue}
   other++;seen.push(key(a))}
  catch(e){bad.push((e&&e.message)||String(e))}
 }
 /* portfolio statements, oldest first: the SAME date is replaced (never added twice), a date older than the saved one is ignored,
    so the holdings always equal the newest statement (+ Buy/Sell PDFs dated after it) */
 pfs.sort((x,y)=>x.t-y.t);const pfOk=[];
 for(const f of pfs){const A=S2.a[f.id],cur=A.open?pDate(A.open.date):null;
  if(cur!==null&&f.t<cur){old++;continue}
  setOpen(A,dtxt(f.t),f.rows);learn(A,f.cl);pfOk.push({id:f.id,date:dtxt(f.t)})}
 const byId={};pfOk.forEach(x=>{byId[x.id]=x});
 if(pfOk.length&&!byId[AID()])switchAcc(pfOk[pfOk.length-1].id,1);
 if(seen.length>200)seen=seen.slice(-200);LS('ds_gm_seen',seen);
 if(ok.length||pfOk.length)changed();
 if(!ok.length&&!pfOk.length){
  if(old&&!bad.length)return '✓ Gmail: portfolio is already up to date (as on '+(P.open?P.open.date:'?')+').';
  throw new Error(bad[0]||(other?other+' PDF found but none is a Buy/Sell confirmation or a portfolio statement.':'Could not read the PDF from Gmail.'))}
 return '✓ Gmail: '+Object.keys(byId).map(id=>AN(id).name+' as on '+byId[id].date+' ('+S2.a[id].open.rows.length+' shares)').join(' · ')+(pfOk.length&&ok.length?' · ':'')+ok.join(' · ')+(old?' · '+old+' older portfolio ignored':'')+(bad.length?' · '+bad.length+' failed':'')+(other?' · '+other+' other PDF skipped':'');
}
async function go(){
 if(busy)return;busy=1;g('gpGm').disabled=true;
 try{msg(await runAuto(false))}
 catch(e){msgPick('Gmail: '+((e&&e.message)||e)+' → choose the Buy/Sell PDF by hand.');pick('gpFT')}
 busy=0;g('gpGm').disabled=false}

/* ---------- events ---------- */
sw.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.id==='gpTg'){isOpen=!isOpen;if(isOpen){draw();let m='my';try{m=localStorage.getItem('ds_lt_mode')}catch(x){}if(m&&m.indexOf('daily')>=0){const my=sw.querySelector('button[data-lt="my"]');if(my)my.click();isOpen=true}}}
 else if(b.dataset.lt)isOpen=false;
 setTimeout(apply,0)});
g('gpAc').onchange=e=>switchAcc(e.target.value);
g('gpPf').onclick=()=>pick('gpFP');
g('gpTr').onclick=()=>pick('gpFT');
g('gpGm').onclick=go;
g('gpFP').onchange=async e=>{const f=(e.target.files||[])[0];if(!f||busy)return;busy=1;msg('Reading portfolio PDF…');
 try{await onPortfolioFile(f)}catch(er){showPreview([],null);msg(((er&&er.message)||er)+' You can type the shares below.',1)}busy=0};
g('gpFT').onchange=async e=>{const fs=Array.from(e.target.files||[]);if(!fs.length||busy)return;busy=1;msg('Reading PDF…');
 const ok=[],bad=[];
 for(const f of fs){try{ok.push(await onTradeFile(f))}catch(er){bad.push((er&&er.message)||String(er))}}
 if(ok.length){changed();msg('✓ '+ok.join(' · ')+(bad.length?' · '+bad.length+' failed ('+bad[0]+')':''))}
 else if(canAuto()){msg('Could not read the file ('+(bad[0]||'?')+'). Trying Gmail…',1);try{msg(await runAuto(false))}catch(er){msg('PDF: '+(bad[0]||'failed')+' · Gmail: '+er.message,1)}}
 else msg(bad[0]||'Could not read the PDF.',1);
 busy=0};
g('gpEd').onclick=()=>{pendBA=null;showPreview(P.open?P.open.rows:[],P.open?pDate(P.open.date):null,P.open?'':'Type the shares below (NAME QTY AVG-COST per line), set the date and Save.')};
g('gpSv').onclick=()=>{
 const r=textToRows(g('gpTx').value),dv=g('gpDt').value;
 r.rows.forEach(x=>{const o=precise[x.code];if(o&&o.qty===x.qty&&Math.abs(o.avg-x.avg)<=0.00006)x.avg=o.avg});/* the box shows 4 decimals: keep the exact PDF value if the line was not changed, so totals match the PDF to the paisa */
 if(!r.rows.length){msg('Write at least one line: NAME QTY AVG-COST'+(r.bad.length?' (cannot read: '+r.bad[0]+')':''),1);return}
 if(!dv){msg('Set the portfolio date first.',1);return}
 const t=Date.UTC(+dv.slice(0,4),+dv.slice(5,7)-1,+dv.slice(8,10));
 setOpen(P,dtxt(t),r.rows);if(pendCl){learn(P,pendCl);pendCl='';}g('gpPv').hidden=true;changed();
 msg('✓ Opening saved: '+r.rows.length+' shares as on '+P.open.date+(r.bad.length?' · '+r.bad.length+' line(s) skipped':''))};
g('gpCx').onclick=()=>{g('gpPv').hidden=true;pendBA=null};
/* shares moved in from another broker (e.g. Bank Asia -> LankaBangla): Buy at the statement's market price on the statement date */
g('gpXf').onclick=()=>{
 const r=textToRows(g('gpTx').value),dv=g('gpDt').value;
 if(!r.rows.length){msg('Nothing to transfer.',1);return}
 if(!dv){msg('Set the date of the transfer first.',1);return}
 const t=Date.UTC(+dv.slice(0,4),+dv.slice(5,7)-1,+dv.slice(8,10)),date=dtxt(t),key='xfer|'+date;
 /* v26: the transfer day is usually BEFORE the saved LankaBangla statement (the statement already holds those shares, so Holdings must not change).
    The transfer is still recorded on its real day: Price = market price of that day (the LankaBangla rate), Bank Asia cost kept in its own column.
    Cards then use the full-history mode (P.lg) that rebuilds the lots and scales them to the statement cost, so the totals match the statement. */
 P.trades=P.trades.filter(x=>x.conf!==key&&!(x.src==='X'&&x.old>0));/* also drops transfer-ins saved by older versions */
 if(baInside(r.rows)===true){pendBA=null;g('gpPv').hidden=true;changed();msg('\u2713 These Bank Asia shares are already inside the LankaBangla statement ('+P.open.date+'), so nothing was added (no double count).');return}
 /* v33: the Bank Asia shares are ADDED on top of the portfolio at the price printed in the Bank Asia PDF (cost amount / qty). Nothing is scaled to match
    any statement total, and they count in Holdings whatever the date. Same date again = replaced, never added twice. */
 P.trades=P.trades.filter(x=>x.conf!==key);let val=0;
 r.rows.forEach(x=>{if(!(x.qty>0&&x.avg>0))return;val+=x.qty*x.avg;P.trades.push({date,type:'Buy',code:x.code,qty:x.qty,rate:x.avg,conf:key,src:'X'})});
 touched.add(AID());pendBA=null;g('gpPv').hidden=true;changed();
 msg('\u2713 Transfer-in added: '+r.rows.length+' shares dated '+date+', value Tk '+fm(val)+'. They are counted in Holdings and Cards at the price from the Bank Asia PDF.')};
g('gpSend').onclick=()=>sendCards(false);
let rsT=0;
const rsL=t=>{const e=g('gpRs').querySelector('.gpl');if(e)e.textContent=t};
g('gpRs').onclick=()=>{if(Date.now()-rsT<4000){S2.a[AID()]=blank();P=S2.a[AID()];saveP();draw();msg('Portfolio cleared (the "My portfolio" entry in Cards stays until you delete it there).');rsL('Delete');rsT=0}else{rsT=Date.now();rsL('Tap again');setTimeout(()=>{rsL('Delete');rsT=0},4000)}};
g('gpAll').addEventListener('click',()=>{F.all=F.all?0:1;F.exp={};draw()});
g('gpTb').addEventListener('click',e=>{const th=e.target.closest('th[data-c]');if(th){const i=+th.dataset.c;CW[i]=(CW[i]+1)%4;try{localStorage.setItem(CW_K,JSON.stringify(CW))}catch(x){}draw();return}const mb=e.target.closest('[data-more],[data-moreall]');if(mb){if(mb.dataset.moreall){F.all=F.all?0:1;F.exp={}}else{const k=mb.dataset.more;F.exp[k]=!F.exp[k]}draw();return}const b=e.target.closest('[data-del]');if(b){F.sel=-1;P.trades.splice(+b.dataset.del,1);changed();return}
 const tr=e.target.closest('tr[data-sel]');if(tr){const i=+tr.dataset.sel;F.sel=F.sel===i?-1:i;draw();return}
 const ro=e.target.closest('tr[data-open]');if(ro){const k=ro.dataset.open;F.op[k]=!F.op[k];F.sel=-1;draw()}});
const fillC=()=>{g('gmU').value=C.user;g('gmP').value=C.pass;g('gmF').value=fromOf(AID());g('gmD').value=String(C.days);g('gmW').value=C.pdfpw;g('gmA').checked=!!C.auto;refreshGoogleUI()};
g('gpSet').onclick=()=>{const p=g('gmPn');p.hidden=!p.hidden;if(!p.hidden)fillC()};
g('gmCl').onclick=()=>{g('gmPn').hidden=true};
g('gmA').addEventListener('change',()=>{C.auto=g('gmA').checked?1:0;saveC();
 if(C.auto&&!canAuto())msg('Auto check chalu holo, kintu age Setup e Google sign-in ba Gmail + App password dite hobe.',1);
 else msg(C.auto?'Gmail auto check chalu (app khulle, 6 ghonta por por).':'Gmail auto check bondho.')});
g('gmSv').onclick=()=>{C.user=g('gmU').value.trim();C.pass=g('gmP').value.replace(/\s+/g,'');C.froms[AID()]=g('gmF').value.trim();C.days=+g('gmD').value||10;C.pdfpw=g('gmW').value;C.auto=g('gmA').checked?1:0;saveC();g('gmPn').hidden=true;msg('Saved.')};
g('gmGoogleIn').onclick=()=>{
  if(!hasGoogle()){msg('Google Sign-In needs the new APK',1);return}
  const id='g'+Date.now();
  try{window.Android.googleSignIn(id);msg('Opening Google…')}catch(e){msg('Google Sign-In error: '+e.message,1)}
};
g('gmGoogleOut').onclick=()=>{
  try{window.Android.googleSignOut()}catch(e){}
  googleOk=false;googleEmail='';
  refreshGoogleUI();
  msg('Signed out from Google');
};
if(typeof setTab==='function'){const o=window.setTab;window.setTab=function(){const r=o.apply(this,arguments);try{apply()}catch(e){}return r}}
g('gpQ').oninput=e=>{F.q=e.target.value;draw()};g('gpS').onchange=e=>{F.sec=e.target.value;draw()};g('gpK').onchange=e=>{F.cat=e.target.value;draw()};
try{window.addEventListener('ltdata',()=>{try{draw()}catch(e){}})}catch(e){}
draw();apply();
try{refreshGoogleUI()}catch(e){}

/* auto check when the app opens (silent: only a status line, no file picker) */
if(C.auto&&canAuto()&&Date.now()-(C.last||0)>6*3600e3){
 setTimeout(async()=>{if(busy)return;busy=1;try{msg(await runAuto(true))}catch(e){msg('Gmail auto: '+((e&&e.message)||e),1)}busy=0},4000)}
window.addEventListener('dsfav',()=>{try{draw()}catch(e){}});
}catch(err){console.error('portfolio',err)}})();
