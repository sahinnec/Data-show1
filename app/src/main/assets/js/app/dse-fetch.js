/* Projected page: search a DSE share code -> fetch its Day End Archive (last 2 years) from the DSE API, or load a longer CSV file.
   API: https://www.dse.com.bd/api/live/data-archive/day-end?from=YYYY-MM-DD&to=YYYY-MM-DD&inst=CODE&page=N (paged, 500 rows/page)
   The reply is parsed by key names (date / code / open / high / low / close / volume), so small field-name changes still work. */
(function(){
  const $=id=>document.getElementById(id),toast=m=>{try{window.gnToast&&gnToast(m)}catch(e){}};
  const prS=$('prS');if(!prS)return;
  const API='https://www.dse.com.bd/api/live/data-archive/day-end';
  let seq=0;const cbs={};const prev=window.__urlRes;
  window.__urlRes=function(id,ok,p){
    if(String(id).slice(0,2)==='dx'){const c=cbs[id];delete cbs[id];if(c){try{const b=atob(p),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);c(ok,new TextDecoder('utf-8').decode(u))}catch(e){c(false,String(e))}}return}
    if(typeof prev==='function')return prev.apply(this,arguments);
  };
  const get=u=>new Promise((res,rej)=>{
    if(window.Android&&window.Android.fetchUrl){const id='dx'+(++seq);cbs[id]=(ok,t)=>ok?res(t):rej(new Error(t));window.Android.fetchUrl(u,id);return}
    fetch(u).then(r=>{if(!r.ok)throw new Error('HTTP '+r.status);return r.text()}).then(res,rej)});
  const nk=k=>String(k).toLowerCase().replace(/[^a-z0-9]/g,'');
  const num=v=>{const x=parseFloat(String(v==null?'':v).replace(/,/g,''));return isNaN(x)?0:x};
  const A={date:['date','tradingdate','tradedate','day'],code:['tradingcode','code','inst','instrument','symbol','scrip'],open:['openp','open','openprice'],high:['high','highprice'],low:['low','lowprice'],close:['closep','close','closeprice'],ltp:['ltp','lasttradeprice'],ycp:['ycp'],vol:['volume','vol','totalvolume']};
  function findRows(j){
    let best=null;
    (function walk(o,d){if(best||d>4||!o||typeof o!=='object')return;
      if(Array.isArray(o)){
        if(o.length&&Array.isArray(o[0])&&Array.isArray(j.cols||(j.data&&j.data.cols))){return}
        if(o.length&&typeof o[0]==='object'&&o[0]&&!Array.isArray(o[0])&&Object.keys(o[0]).some(k=>A.date.includes(nk(k)))){best=o;return}
        o.forEach(x=>walk(x,d+1));return}
      Object.keys(o).forEach(k=>walk(o[k],d+1))})(j,0);
    if(best)return best;
    /* {cols:[..], rows:[[..]]} shape (same style as the live snapshot API) */
    let found=null;
    (function walk(o,d){if(found||d>4||!o||typeof o!=='object'||Array.isArray(o))return;
      if(Array.isArray(o.cols)&&Array.isArray(o.rows)){found=o.rows.map(r=>{const m={};o.cols.forEach((c,i)=>m[c]=r[i]);return m});return}
      Object.keys(o).forEach(k=>walk(o[k],d+1))})(j,0);
    return found||[];
  }
  function pages(j){let n=0;(function walk(o,d){if(!o||typeof o!=='object'||d>3)return;Object.keys(o).forEach(k=>{const q=nk(k),v=o[k];
    if(typeof v==='number'&&/^(totalpages|pagecount|lastpage|pages|totalpage)$/.test(q))n=Math.max(n,v);
    else if(v&&typeof v==='object'&&!Array.isArray(v))walk(v,d+1)})})(j,0);return n}
  function norm(rows,code){
    const out=new Map();
    rows.forEach(r=>{const m={};Object.keys(r).forEach(k=>{m[nk(k)]=r[k]});
      const pick=n=>{for(const a of A[n])if(m[a]!==undefined&&m[a]!==null&&m[a]!=='')return m[a];return undefined};
      const ds=String(pick('date')||'').slice(0,10);if(!/^\d{4}-\d\d-\d\d$/.test(ds))return;
      const c=pick('code');if(c&&code&&String(c).toUpperCase()!==code)return;
      let cl=num(pick('close'));if(!(cl>0))cl=num(pick('ltp'));if(!(cl>0))cl=num(pick('ycp'));if(!(cl>0))return;
      let o=num(pick('open'));if(!(o>0))o=cl;
      let h=num(pick('high'));if(!(h>0))h=Math.max(o,cl);let l=num(pick('low'));if(!(l>0))l=Math.min(o,cl);
      out.set(ds,[ds,code,o,h,l,cl,num(pick('vol'))])});
    return [...out.values()].sort((a,b)=>a[0]<b[0]?-1:1);
  }
  const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  let busy=0;
  async function fetchCode(code,opt){
    code=String(code||'').trim().toUpperCase();
    if(!code){toast('Share code likhun (jemon ACI)');return false}
    if(busy){toast('Ekta fetch cholche, ektu opekkha korun');return false}busy=1;setB(1);let okk=false;
    try{
      const to=new Date(),fr=new Date();fr.setFullYear(fr.getFullYear()-2);
      let all=[],first='';
      for(let p=1;p<=8;p++){
        toast(code+': DSE theke data anchi… (page '+p+')');
        const u=API+'?from='+iso(fr)+'&to='+iso(to)+'&inst='+encodeURIComponent(code)+'&page='+p;
        const t=await get(u);let j;try{j=JSON.parse(t)}catch(e){throw new Error('DSE JSON deyni (shuru: '+t.slice(0,60).replace(/\s+/g,' ')+')')}
        const rows=findRows(j);if(!rows.length){if(p===1)window.__dxLast=t.slice(0,300);break}
        const sig=JSON.stringify(rows[0]);if(sig===first)break;first=sig;
        all=all.concat(rows);const tp=pages(j);
        if(tp?p>=tp:rows.length<400)break;
      }
      const L=norm(all,code);
      if(!L.length)throw new Error(code+': kono data paini (code thik ache? reply: '+String(window.__dxLast||'').slice(0,80)+')');
      const txt=['Date\tName\tOpen\tHigh\tLow\tClose\tVolume'].concat(L.map(r=>r.join('\t'))).join('\n');
      window.__prOpen(txt,{replace:1,view:opt&&opt.view});okk=true;
      toast(code+': '+L.length+' diner data ('+L[0][0]+' → '+L[L.length-1][0]+'). Er beshi lagle CSV din.');
    }catch(e){
      let t='';try{t=window.__hist&&window.__hist.text(code)||''}catch(x){}
      if(opt&&opt.fallback&&t){window.__prOpen(t,{replace:1,view:opt.view});okk=true;toast(code+': offline, app-e joma data dekhano hoyeche')}
      else toast('Fetch hoyni: '+(e.message||e))}
    busy=0;setB(0);return okk;
  }
  /* v37: last n day-end rows of one share (for the mini bars). One page, last ~16 days. */
  window.__dseLast=async function(code,n){
    code=String(code||'').trim().toUpperCase();if(!code)return [];
    const to=new Date(),fr=new Date(Date.now()-18*864e5);
    const t=await get(API+'?from='+iso(fr)+'&to='+iso(to)+'&inst='+encodeURIComponent(code)+'&page=1');
    const j=JSON.parse(t),L=norm(findRows(j),code);return L.slice(-(n||5)).map(r=>({d:r[0],c:r[5]}));
  };
  /* ---- v27: buttons live in the header row (Paste | CSV | DSE Fetch | App data | From preview); the search box + dropdown is inside the chart page ---- */
  function setB(b){const g=$('prGo');if(g){g.disabled=!!b;g.textContent=b?'⏳ …':'🔍 DSE Fetch'}}
  const frm=()=>{try{return $('prW').querySelector('iframe').contentDocument}catch(e){return null}};
  $('prGo').onclick=()=>{
    const d=frm(),q=d&&d.getElementById('stq');
    const v=q?String(q.value||'').trim():'';
    if(!v){toast('Share code likhun ba search theke bachun (jemon ACI)');try{q&&q.focus()}catch(e){}return}
    fetchCode(v)};
  $('prCsv').onclick=()=>$('prxF').click();
  $('prxF').onchange=async e=>{const f=e.target.files&&e.target.files[0];e.target.value='';if(!f)return;
    try{
      let t='';
      if(/\.(xlsx|xls|xlsm|xlsb|ods)$/i.test(f.name)){
        await need('xlsx');const wb=XLSX.read(await f.arrayBuffer(),{type:'array',cellDates:true});
        const A=XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1,raw:false,defval:''});
        t=A.map(r=>r.map(v=>window.isoDay(String(v).replace(/[\t\r\n]+/g,' '))).join('\t')).join('\n');
      }else{
        t=(await f.text()).replace(/^\ufeff/,'').replace(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/g,'\t').replace(/"/g,'');
      }
      if(!t.trim()){toast('File khali');return}
      window.__prOpen(t);toast(f.name+' load hoyeche');
    }catch(err){console.error(err);toast('File pora jayni: '+(err.message||err))}};

  /* ---- all DSE instruments for the search dropdown ----
     Source: the live snapshot the Table page already saved (ds_lt_cache), else DSE snapshot API. Cached in ds_pr_codes for a day. */
  const CK='ds_pr_codes';
  const rd=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};
  let codes=[];
  function fromRows(rows){const m=new Map();(rows||[]).forEach(r=>{const c=r&&String(r.code||'').trim();if(!c||/\s/.test(c))return;m.set(c.toUpperCase(),[c,String(r.sec&&r.sec!=='–'?r.sec:'')])});return [...m.values()].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)}
  function load(){
    const own=rd(CK);if(own&&Array.isArray(own.l)&&own.l.length)codes=own.l;
    const lt=fromRows(rd('ds_lt_cache'));
    if(lt.length>codes.length||(lt.length&&!codes.length)){
      /* keep sector text from the older list when the table cache has none */
      const sec=new Map(codes.map(x=>[x[0].toUpperCase(),x[1]]));
      codes=lt.map(x=>[x[0],x[1]||sec.get(x[0].toUpperCase())||'']);
    }
    return codes}
  let fetching=0;
  async function refresh(force){
    load();
    const own=rd(CK);
    if(!force&&own&&own.l&&own.l.length&&Date.now()-(own.t||0)<864e5)return;
    if(fetching)return;fetching=1;
    try{
      const t=await get('https://www.dse.com.bd/api/live/snapshot');const j=JSON.parse(t),P=j&&j.prices;
      if(!P||!Array.isArray(P.cols)||!Array.isArray(P.rows))throw new Error('no prices');
      const I={};P.cols.forEach((c,i)=>{I[c]=i});if(I.code===undefined)throw new Error('no code col');
      const rows=P.rows.filter(r=>I.assetType===undefined||r[I.assetType]!=='GOVDBT').map(r=>({code:r[I.code],sec:I.sector!==undefined?r[I.sector]:''}));
      const l=fromRows(rows);
      if(l.length){codes=l;try{localStorage.setItem(CK,JSON.stringify({t:Date.now(),l}))}catch(e){}}
    }catch(e){/* offline / blocked: the dropdown still works from the Table page cache, or type a code and press Enter */}
    fetching=0;
  }
  window.__dseCodes=()=>codes.length?codes:load();
  window.__dseCodesRefresh=refresh;
  load();setTimeout(()=>refresh(),2500);
  window.__prFetchCode=fetchCode;
  window.__shareGo=code=>fetchCode(code,{view:'both',fallback:1}); /* one tap: DSE data -> chart + projected on one page */
})();
