/* Screener (Projected page > "🔎 Screener" section).
   Filters with a count, tap a filter = list of matching shares, tap a share = its chart.
   Groups: Technical (RSI, MACD, SMA, Golden/Death cross, EMA, Bollinger, ADX, Trend), Price & Volume, Fundamental, Dividend.
   Data   : live DSE table (localStorage ds_lt_cache: price, volume, trade, EPS, P/E, NAV, ROE, dividend ...)
            + saved day-by-day history (window.__hist._D, IndexedDB "dsHistory") for the indicators and 52-week / average-volume filters.
   Show / hide : the "🔎 Screener" button in the Projected top bar hides the whole section; the ⚙ button inside lets you hide single filters.
   Settings: localStorage ds_sc_cfg.  Everything is drawn inside the Projected iframe (#sc). */
(function(){try{
const LSG=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const CK='ds_sc_cfg';
let cfg=Object.assign({cat:'tech',hide:{}},LSG(CK)||{});if(!cfg.hide||typeof cfg.hide!=='object')cfg.hide={};
const saveCfg=()=>{try{localStorage.setItem(CK,JSON.stringify({cat:cfg.cat,hide:cfg.hide}))}catch(e){}};
let edit=0,openId='',showN={},model=null,msig='',lastSig='';

/* ---------- indicators (pure functions) ---------- */
const sma=(c,n)=>{const e=c.length;if(e<n)return null;let s=0;for(let i=e-n;i<e;i++)s+=c[i];return s/n};
function emaArr(c,n){const k=2/(n+1),o=[];let e=c[0];for(let i=0;i<c.length;i++){e=i?c[i]*k+e*(1-k):c[i];o.push(e)}return o}
function rsiArr(c,n){if(c.length<n+1)return null;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;
  const o=[];o[n]=l===0?100:100-100/(1+g/l);
  for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=l===0?100:100-100/(1+g/l)}return o}
function adx(h,l,c,n){const m=c.length-1;if(m<2*n)return null;const tr=[],pd=[],md=[];
  for(let i=1;i<=m;i++){const up=h[i]-h[i-1],dn=l[i-1]-l[i];tr.push(Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])));pd.push(up>dn&&up>0?up:0);md.push(dn>up&&dn>0?dn:0)}
  let a=0,p=0,q=0;for(let i=0;i<n;i++){a+=tr[i];p+=pd[i];q+=md[i]}
  const dx=[],push=()=>{const pi=a?100*p/a:0,mi=a?100*q/a:0;dx.push(pi+mi?100*Math.abs(pi-mi)/(pi+mi):0)};push();
  for(let i=n;i<m;i++){a=a-a/n+tr[i];p=p-p/n+pd[i];q=q-q/n+md[i];push()}
  if(dx.length<n)return null;let x=0;for(let i=0;i<n;i++)x+=dx[i];x/=n;for(let i=n;i<dx.length;i++)x=(x*(n-1)+dx[i])/n;return x}
function tech(a){
  const c=a.map(x=>x.p),h=a.map(x=>x.h),l=a.map(x=>x.l),n=c.length,t={n,c:c[n-1]};
  t.s20=sma(c,20);t.s50=sma(c,50);t.s200=sma(c,200);
  if(n>=50){t.e20=emaArr(c,20)[n-1];t.e50=emaArr(c,50)[n-1]}
  const r=rsiArr(c,14);if(r){t.rsi=r[n-1];t.rsip=r[n-2]}
  if(n>=35){const e12=emaArr(c,12),e26=emaArr(c,26),m=e12.map((v,i)=>v-e26[i]),sg=emaArr(m,9);t.macd=m[n-1];t.sig=sg[n-1]}
  if(n>=20){let v=0;for(let i=n-20;i<n;i++)v+=(c[i]-t.s20)*(c[i]-t.s20);const sd=Math.sqrt(v/20),up=t.s20+2*sd,lo=t.s20-2*sd;t.bb=up>lo?(c[n-1]-lo)/(up-lo):null}
  t.adx=adx(h,l,c,14);
  if(n>=60){const w=a.slice(-250);t.hi=Math.max(...w.map(x=>x.h));t.lo=Math.min(...w.map(x=>x.l))}
  if(n>=6){const vs=a.slice(-21,-1).map(x=>x.v);t.av=vs.reduce((p,q)=>p+q,0)/vs.length}
  return t}

/* ---------- filters ---------- */
const N=v=>typeof v==='number'&&isFinite(v);
const GROUPS=[
 {id:'tech',ic:'📈',n:'Technical',items:[
  ['rsi30','RSI Below 30 (Oversold)','RSI ৩০ এর নিচে',15,s=>N(s.t.rsi)&&s.t.rsi<30],
  ['rsix','RSI Crosses 50','আজ RSI ৫০ লাইন পার হয়েছে',16,s=>N(s.t.rsi)&&N(s.t.rsip)&&((s.t.rsip<50&&s.t.rsi>=50)||(s.t.rsip>50&&s.t.rsi<=50))],
  ['rsi70','RSI Above 70 (Overbought)','RSI ৭০ এর উপরে',15,s=>N(s.t.rsi)&&s.t.rsi>70],
  ['rsi40','RSI Above 40','RSI ৪০ এর উপরে',15,s=>N(s.t.rsi)&&s.t.rsi>40],
  ['rsi60','RSI Below 60','RSI ৬০ এর নিচে',15,s=>N(s.t.rsi)&&s.t.rsi<60],
  ['macdb','MACD Buy Signal','MACD > Signal লাইন',35,s=>N(s.t.macd)&&s.t.macd>s.t.sig],
  ['macds','MACD Sell Signal','MACD < Signal লাইন',35,s=>N(s.t.macd)&&s.t.macd<s.t.sig],
  ['macd0','MACD Above Zero','MACD শূন্যের উপরে',35,s=>N(s.t.macd)&&s.t.macd>0],
  ['a20','Price Above SMA 20','দাম > SMA 20',20,s=>N(s.t.s20)&&s.t.c>s.t.s20],
  ['a50','Price Above SMA 50','দাম > SMA 50',50,s=>N(s.t.s50)&&s.t.c>s.t.s50],
  ['a200','Price Above SMA 200','দাম > SMA 200',200,s=>N(s.t.s200)&&s.t.c>s.t.s200],
  ['gc','Golden Cross (SMA 20 > SMA 50)','গোল্ডেন ক্রস',50,s=>N(s.t.s50)&&s.t.s20>s.t.s50],
  ['dc','Death Cross (SMA 20 < SMA 50)','ডেথ ক্রস',50,s=>N(s.t.s50)&&s.t.s20<s.t.s50],
  ['eb','EMA Bullish (EMA 20 > EMA 50)','EMA 20 > EMA 50 (তেজি)',50,s=>N(s.t.e50)&&s.t.e20>s.t.e50],
  ['bbb','Bollinger Buy (Near Lower Band)','দাম নিচের ব্যান্ডের কাছে',20,s=>N(s.t.bb)&&s.t.bb<=.1],
  ['bbs','Bollinger Sell (Near Upper Band)','দাম উপরের ব্যান্ডের কাছে',20,s=>N(s.t.bb)&&s.t.bb>=.9],
  ['adx','Strong Trend (ADX > 25)','শক্তিশালী ট্রেন্ড',29,s=>N(s.t.adx)&&s.t.adx>25],
  ['tbu','Trend BULLISH','দাম > SMA 20 > SMA 50',50,s=>N(s.t.s50)&&s.t.c>s.t.s20&&s.t.s20>s.t.s50],
  ['tbe','Trend BEARISH','দাম < SMA 20 < SMA 50',50,s=>N(s.t.s50)&&s.t.c<s.t.s20&&s.t.s20<s.t.s50]]},
 {id:'pv',ic:'💰',n:'Price & Volume',items:[
  ['gain','Top Gainers (Last Day)','গতদিনের দাম বেড়েছে',0,s=>N(s.pct)&&s.pct>0,(a,b)=>b.pct-a.pct],
  ['lose','Top Losers (Last Day)','গতদিনের দাম কমেছে',0,s=>N(s.pct)&&s.pct<0,(a,b)=>a.pct-b.pct],
  ['p6','Price Below 6 (Penny)','৬ টাকার নিচে',0,s=>s.ltp<6],
  ['p615','Price 6-15','৬-১৫ টাকা',0,s=>s.ltp>=6&&s.ltp<15],
  ['p1550','Price 15-50','১৫-৫০ টাকা',0,s=>s.ltp>=15&&s.ltp<50],
  ['p50100','Price 50-100','৫০-১০০ টাকা',0,s=>s.ltp>=50&&s.ltp<100],
  ['p100500','Price 100-500','১০০-৫০০ টাকা',0,s=>s.ltp>=100&&s.ltp<500],
  ['p500','Price Above 500 (Premium)','৫০০+ টাকা',0,s=>s.ltp>=500],
  ['h52','Near 52W High','৫২ সপ্তাহের সর্বোচ্চের ৫% এর মধ্যে',60,s=>N(s.t.hi)&&s.ltp>=s.t.hi*.95],
  ['l52','Near 52W Low','৫২ সপ্তাহের সর্বনিম্নের ৫% এর মধ্যে',60,s=>N(s.t.lo)&&s.ltp<=s.t.lo*1.05],
  ['v1m','Volume 1M+','ভলিউম ১০ লক্ষ+',0,s=>s.vol>=1e6],
  ['vhi','High Volume (2x Avg)','ভলিউম গড়ের ২ গুণ+',6,s=>N(s.t.av)&&s.t.av>0&&s.vol>=2*s.t.av],
  ['vlo','Low Volume (0.5x Avg)','ভলিউম গড়ের অর্ধেকের কম',6,s=>N(s.t.av)&&s.t.av>0&&s.vol<.5*s.t.av],
  ['pvu','Price & Volume Up','দাম ও ভলিউম দুটোই বাড়ছে',6,s=>N(s.t.av)&&s.pct>0&&s.vol>s.t.av],
  ['pvd','Price & Volume Down','দাম ও ভলিউম দুটোই কমছে',6,s=>N(s.t.av)&&s.pct<0&&s.vol<s.t.av],
  ['tr5k','High Trade Count (5000+)','ট্রেড সংখ্যা ৫০০০+',0,s=>s.trade>=5000],
  ['to100','Turnover > 100M BDT','টার্নওভার ১০ কোটি+',0,s=>s.val>=100]]},
 {id:'fund',ic:'🏢',n:'Fundamental',items:[
  ['pe10','PE Below 10','PE < 10 (Value)',0,s=>N(s.pe)&&s.pe>0&&s.pe<10],
  ['pe15','PE Below 15','PE < 15',0,s=>N(s.pe)&&s.pe>0&&s.pe<15],
  ['pe20','PE Above 20','PE > 20',0,s=>N(s.pe)&&s.pe>20],
  ['epsp','Positive EPS','EPS পজিটিভ',0,s=>N(s.eps)&&s.eps>0],
  ['epsn','Negative EPS','EPS নেগেটিভ (লোকসান)',0,s=>N(s.eps)&&s.eps<0],
  ['eps5','EPS > 5','EPS ৫+',0,s=>N(s.eps)&&s.eps>5],
  ['bnav','Trading Below NAV','NAV এর নিচে ট্রেড',0,s=>N(s.nav)&&s.nav>0&&s.ltp<s.nav],
  ['nvp','NAV/Price Ratio > 1.5','NAV ÷ দাম > 1.5',0,s=>N(s.nav)&&s.nav>0&&s.nav/s.ltp>1.5],
  ['roe15','ROE > 15%','ROE ১৫% এর বেশি',0,s=>N(s.roe)&&s.roe>15]]},
 {id:'div',ic:'💵',n:'Dividend',items:[
  ['d50','Cash Dividend 50%+','ক্যাশ ডিভিডেন্ড ৫০%+',0,s=>N(s.div)&&s.div>=50],
  ['d20','Cash Dividend 20%+','ক্যাশ ডিভিডেন্ড ২০%+',0,s=>N(s.div)&&s.div>=20],
  ['dy5','Dividend Yield > 5%','ডিভিডেন্ড ইল্ড ৫%+',0,s=>N(s.dy)&&s.dy>5],
  ['dy8','Dividend Yield > 8%','ডিভিডেন্ড ইল্ড ৮%+',0,s=>N(s.dy)&&s.dy>8],
  ['dgive','Gives Dividend','ডিভিডেন্ড দেয়',0,s=>N(s.div)&&s.div>0],
  ['dno','No Dividend','কোনো ডিভিডেন্ড নেই',0,s=>N(s.div)&&s.div===0]]}
];

/* ---------- data ---------- */
function build(){
  const H=window.__hist,D=H&&H._D,ser=new Map();
  const dates=D&&D.size?[...D.keys()].sort():[];
  dates.forEach(d=>{const r=D.get(d).r;for(const c in r){const x=r[c];if(!(x&&x.p>0))continue;let a=ser.get(c);if(!a){a=[];ser.set(c,a)}a.push({d,p:x.p,h:x.h>0?x.h:x.p,l:x.l>0?x.l:x.p,v:x.v||0})}});
  const live=LSG('ds_lt_cache'),stocks=[];
  const mk=(code,o)=>{const a=ser.get(code)||[];o.code=code;o.t=a.length>=2?tech(a):{n:a.length};stocks.push(o)};
  if(Array.isArray(live)&&live.length>=50){
    live.forEach(r=>{if(!r||!r.code||/\s/.test(r.code))return;const ltp=r.ltp>0?r.ltp:r.ycp;if(!(ltp>0))return;
      mk(String(r.code).toUpperCase(),{ltp,pct:r.pct,vol:r.vol||0,val:r.val||0,trade:r.trade||0,eps:r.eps,pe:r.pe,nav:r.nav,roe:r.roe,div:r.div,dy:r.dy,sec:r.sec&&r.sec!=='–'?r.sec:''})})}
  else if(dates.length){
    const last=D.get(dates[dates.length-1]).r;
    for(const c in last){const x=last[c];if(!(x.p>0))continue;mk(c,{ltp:x.p,pct:x.c,vol:x.v||0,val:x.a||0,trade:x.t||0,eps:undefined,pe:x.e,nav:undefined,roe:undefined,div:undefined,dy:x.g,sec:''})}}
  const maxN=Math.max(0,...stocks.map(s=>s.t.n||0));
  const out={stocks,maxN,last:dates.length?dates[dates.length-1]:'',days:dates.length,res:{}};
  GROUPS.forEach(g=>g.items.forEach(it=>{
    const list=[];stocks.forEach(s=>{let ok=false;try{ok=!!it[4](s)}catch(e){}if(ok)list.push(s)});
    list.sort(it[5]||((a,b)=>(b.val||0)-(a.val||0)));
    out.res[it[0]]={list,need:it[3],short:it[3]>0&&maxN<it[3]}}));
  return out}
const sigNow=()=>[localStorage.getItem('ds_lt_time')||'',window.__hist&&window.__hist._D?window.__hist._D.size:0,(LSG('ds_lt_cache')||[]).length].join('|');
function getModel(force){const s=sigNow();if(force||!model||s!==msig){model=build();msig=s}return model}

/* ---------- drawing (inside the Projected iframe) ---------- */
const CSS='#sc .scc{display:flex;gap:6px;overflow-x:auto;margin:6px 0 8px;padding-bottom:2px}#sc .scc button,#sc .sct button{flex:0 0 auto;border:1px solid var(--bd);background:var(--bg);color:var(--tx);border-radius:18px;padding:6px 12px;font:600 12.5px system-ui;width:auto}#sc .scc button.on{background:var(--ac);color:#fff;border-color:var(--ac)}'
+'#sc .sct{display:flex;gap:6px;align-items:center;justify-content:space-between}#sc .sct span{font-size:11.5px;color:var(--mu)}#sc .sct div{display:flex;gap:6px}#sc .sct button{padding:4px 10px;border-radius:10px}#sc .sct button.on{background:var(--ac);color:#fff;border-color:var(--ac)}'
+'#sc .scr{display:flex;align-items:center;gap:9px;padding:10px;border:1px solid var(--bd);border-radius:12px;margin:0 0 7px;background:var(--bg);cursor:pointer}#sc .scr .dot{width:7px;height:7px;border-radius:50%;background:var(--mu);flex:0 0 auto}#sc .scr.has .dot{background:var(--up)}'
+'#sc .scr .nm{flex:1;min-width:0}#sc .scr .nm b{display:block;font-size:13.5px}#sc .scr .nm small{color:var(--mu);font-size:11.5px}#sc .scr .ct{min-width:38px;text-align:center;padding:3px 9px;border-radius:9px;font-weight:700;font-size:13px;background:var(--card);border:1px solid var(--bd);color:var(--mu)}#sc .scr.has .ct{background:rgba(8,153,129,.15);color:var(--up);border-color:transparent}'
+'#sc .scr .ar{color:var(--mu);font-size:16px}#sc .scr.op .ar{transform:rotate(90deg)}#sc .scr input{width:auto}'
+'#sc .scl{margin:-2px 0 9px;border:1px solid var(--bd);border-radius:10px;overflow:hidden}#sc .sl{display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:1px solid var(--bd);cursor:pointer;font-size:13px}#sc .sl:last-child{border:0}#sc .sl b{min-width:78px}#sc .sl small{flex:1;color:var(--mu);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px}#sc .sl .p{font-variant-numeric:tabular-nums}#sc .sl .u{color:var(--up)}#sc .sl .d{color:var(--dn)}#sc .more{width:100%;border:0;border-radius:0;padding:8px;background:var(--bg);color:var(--ac);font-weight:600}#sc .scn{color:var(--mu);font-size:11.5px;margin:4px 2px 8px}';
const fx=(v,d)=>N(v)?v.toFixed(d):'–';
function html(){
  const m=getModel(),g=GROUPS.find(x=>x.id===cfg.cat)||GROUPS[0];
  let h='<h1>🔎 Screener</h1><div class="sct"><span>'+(m.stocks.length?m.stocks.length+' shares':'No live data')+' · history '+m.days+' day'+(m.days==1?'':'s')+(m.last?' (to '+esc(m.last)+')':'')+'</span><div><button type="button" data-a="ref">🔄</button><button type="button" data-a="edit" class="'+(edit?'on':'')+'">⚙</button></div></div>';
  h+='<div class="scc">'+GROUPS.map(x=>'<button type="button" data-c="'+x.id+'" class="'+(x.id===g.id?'on':'')+'">'+x.ic+' '+x.n+'</button>').join('')+'</div>';
  if(!m.stocks.length)h+='<div class="scn">Table → Daily data খুলে একবার live data আনুন (বা Saved history তে data রাখুন), তারপর 🔄 চাপুন।</div>';
  let shown=0;
  g.items.forEach(it=>{const id=it[0],hid=!!cfg.hide[id];if(hid&&!edit)return;shown++;
    const r=m.res[id],c=r.list.length,op=openId===id&&!edit;
    h+='<div class="scr '+(c?'has ':'')+(op?'op':'')+'" data-i="'+id+'">'+(edit?'<input type="checkbox" data-h="'+id+'" '+(hid?'':'checked')+'>':'<span class="dot"></span>')+'<div class="nm"><b>'+esc(it[1])+'</b><small>'+esc(it[2])+(r.short?' · history '+m.maxN+'/'+r.need+' দিন লাগবে':'')+'</small></div><span class="ct">'+(r.short?'–':c)+'</span>'+(edit?'':'<span class="ar">›</span>')+'</div>';
    if(op&&c){const k=showN[id]||40;
      h+='<div class="scl">'+r.list.slice(0,k).map(s=>'<div class="sl" data-s="'+esc(s.code)+'"><b>'+esc(s.code)+'</b><small>'+esc(s.sec)+'</small><span class="p">'+fx(s.ltp,2)+'</span><span class="p '+(s.pct>0?'u':s.pct<0?'d':'')+'">'+(N(s.pct)?(s.pct>0?'+':'')+s.pct.toFixed(2)+'%':'')+'</span></div>').join('')+(c>k?'<button type="button" class="more" data-m="'+id+'">আরও দেখান (+40) · মোট '+c+'</button>':'')+'</div>'}
    else if(op&&!c)h+='<div class="scn">কোনো share মেলেনি।</div>'});
  if(edit)h+='<div class="scn">⚙ মোড: টিক তুলে দিলে ওই filter লুকাবে। <a data-a="all" style="color:var(--ac)">সব দেখান</a></div>';
  else if(!shown)h+='<div class="scn">সব filter লুকানো। ⚙ চেপে আবার দেখান।</div>';
  h+='<div class="scn">Technical filter গুলো saved history থেকে হিসাব হয় (সর্বশেষ saved দিন পর্যন্ত); দিন কম থাকলে সংখ্যার জায়গায় – দেখায়। বাকিগুলো live DSE table থেকে। এটি তথ্য, বিনিয়োগ পরামর্শ নয়।</div>';
  return h}

/* ---------- mount into the iframe ---------- */
const frm=()=>document.getElementById('prF');
function idoc(){try{const f=frm(),d=f&&f.contentDocument;return d&&d.getElementById('sc')?d:null}catch(e){return null}}
function draw(d){d=d||idoc();if(!d)return;const el=d.getElementById('sc');if(!el)return;
  const y=el.scrollTop;el.innerHTML=html();lastSig=sigNow()+'|'+JSON.stringify(cfg)+'|'+edit+'|'+openId}
function openChart(code){
  try{const H=window.__hist;if(H&&H.series&&H.series(code).length>=5){H.pick(code);return}}catch(e){}
  try{if(window.__prFetchCode){window.__prFetchCode(code);return}}catch(e){}
  try{window.gnToast&&gnToast(code+': data নেই')}catch(e){}}
function onClick(e){
  const t=e.target,q=s=>t.closest&&t.closest(s);
  const a=q('[data-a]');if(a){const k=a.dataset.a;if(k==='ref'){getModel(true);draw()}else if(k==='edit'){edit=edit?0:1;draw()}else if(k==='all'){cfg.hide={};saveCfg();draw()}return}
  const hc=q('[data-h]');if(hc){const id=hc.dataset.h;if(hc.checked)delete cfg.hide[id];else cfg.hide[id]=1;saveCfg();return}
  const c=q('[data-c]');if(c){cfg.cat=c.dataset.c;openId='';saveCfg();draw();return}
  const mo=q('[data-m]');if(mo){showN[mo.dataset.m]=(showN[mo.dataset.m]||40)+40;draw();return}
  const s=q('[data-s]');if(s){openChart(s.dataset.s);return}
  const r=q('[data-i]');if(r&&!edit){const id=r.dataset.i;openId=openId===id?'':id;draw()}}
function mount(){
  const d=idoc();if(!d)return false;
  if(!d.getElementById('scCss')){const st=d.createElement('style');st.id='scCss';st.textContent=CSS;d.head.appendChild(st)}
  const el=d.getElementById('sc');if(!el.__sc){el.__sc=1;el.addEventListener('click',onClick)}
  return d}
function tick(){
  try{const d=mount();if(!d)return;
    if(d.documentElement.getAttribute('data-v')!=='proj'||d.documentElement.classList.contains('h-sc'))return;   /* only work while the section can be seen */
    if(lastSig!==sigNow()+'|'+JSON.stringify(cfg)+'|'+edit+'|'+openId||!d.getElementById('sc').firstChild)draw(d)}
  catch(e){console.error('screener',e)}}
if(typeof document!=='undefined'){setInterval(tick,1200);window.addEventListener('ltdata',()=>{msig=''});}
window.__screener={tech,GROUPS,build,html,rsiArr,adx,sma,emaArr};
}catch(err){console.error('screener init',err)}})();
