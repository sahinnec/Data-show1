/* Buy Plan (Projected page > "🎯 Buy Plan" section, above the Screener).
   Finds shares that are LOW priced + HIGH volatility (and pass the other checks), then says
     - where to buy and how much (3-step ladder from a budget you set),
     - where to sell and how much (50% at target 1, rest at target 2, stop level),
     - for shares you already hold: sell some / sell all / average down (how many to add, new average).
   Alerts (while the app is open, Dhaka time, Sun-Thu):
     - open + delay (default 10:00 + 60 min = 11:00): "buy now?" check with fresh live prices,
     - plan time (default 15:00): refreshes data, builds the plan for the next trading day.
   Data : saved history (window.__hist._D, ~2 years) + live table (localStorage ds_lt_cache) + portfolio (ds_pf_v2).
   Settings: localStorage ds_bp_cfg.  Last plan: ds_bp_plan.  Fired alerts: ds_bp_fired.
   This is arithmetic on past prices, not a promise and not financial advice. */
(function(){try{
const LSG=k=>{try{return JSON.parse(localStorage.getItem(k)||'null')}catch(e){return null}};
const LSS=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const N=v=>typeof v==='number'&&isFinite(v);
const CK='ds_bp_cfg',PK='ds_bp_plan',FK='ds_bp_fired';
const DEF={on:1,maxP:60,minVol:2,minTurn:1,posMax:40,rsiMax:50,budget:1000,ckmin:0,ver:33,topN:8,open:'10:00',delay:60,close:'14:30',plan:'15:00',eps:0,notif:1};
let cfg=Object.assign({},DEF,LSG(CK)||{});
const saveCfg=()=>LSS(CK,cfg);
if(!(cfg.ver>=33)){cfg.budget=1000;cfg.ver=33;saveCfg()}   /* v33: budget per share = 1000 Tk */
let tab='buy',edit=0,model=null,msig='',lastSig='',msg='',form=null;

/* ---------- small maths ---------- */
const r1=v=>Math.round(v*10)/10;                      /* DSE price step is 0.1 */
const f2=v=>N(v)?v.toFixed(2):'–';
const f1=v=>N(v)?v.toFixed(1):'–';
const fq=v=>Math.round(v).toLocaleString('en-US');
function rsiLast(c,n,upTo){                              /* Wilder RSI at index upTo */
  if(upTo<n)return null;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;
  for(let i=n+1;i<=upTo;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n}
  return l===0?100:100-100/(1+g/l)}
function rsiAll(c,n){const o=new Array(c.length).fill(null);if(c.length<=n)return o;let g=0,l=0;for(let i=1;i<=n;i++){const d=c[i]-c[i-1];if(d>0)g+=d;else l-=d}g/=n;l/=n;o[n]=l===0?100:100-100/(1+g/l);
  for(let i=n+1;i<c.length;i++){const d=c[i]-c[i-1];g=(g*(n-1)+Math.max(d,0))/n;l=(l*(n-1)+Math.max(-d,0))/n;o[i]=l===0?100:100-100/(1+g/l)}return o}
function emaArr(c,n){const k=2/(n+1),o=[];let e=c[0];for(let i=0;i<c.length;i++){e=i?c[i]*k+e*(1-k):c[i];o.push(e)}return o}
const hh=(s,i,n)=>{let m=-1e18;for(let j=Math.max(0,i-n+1);j<=i;j++)m=Math.max(m,s[j].h);return m},ll=(s,i,n)=>{let m=1e18;for(let j=Math.max(0,i-n+1);j<=i;j++)m=Math.min(m,s[j].l);return m};
const mean=a=>a.reduce((x,y)=>x+y,0)/(a.length||1);
const sd=a=>{const m=mean(a);return Math.sqrt(mean(a.map(v=>(v-m)**2)))};

/* ---------- time (Asia/Dhaka) ---------- */
function dhaka(){
  const s=new Date().toLocaleString('en-US',{timeZone:'Asia/Dhaka',hour12:false,weekday:'short',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const m=s.match(/(\w+),?\s+(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+)/);if(!m)return null;
  const wd={Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6}[m[1]];
  return{wd,key:m[4]+'-'+m[2]+'-'+m[3],min:(+m[5]%24)*60+ +m[6]}}
const hm=t=>{const p=String(t||'').split(':');return (+p[0]||0)*60+(+p[1]||0)};
const isTradeDay=w=>w>=0&&w<=4;                          /* Sun-Thu */

/* ---------- series from saved history ---------- */
function seriesMap(){
  const H=window.__hist,D=H&&H._D,ser=new Map();if(!D||!D.size)return{ser,dates:[]};
  const dates=[...D.keys()].sort();
  dates.forEach(d=>{const r=D.get(d).r;for(const c in r){const x=r[c];if(!(x&&x.p>0))continue;let a=ser.get(c);if(!a){a=[];ser.set(c,a)}
    a.push({d,p:x.p,o:x.o>0?x.o:x.p,h:x.h>0?x.h:x.p,l:x.l>0?x.l:x.p,v:x.v||0})}});
  return{ser,dates}}

/* ---------- one share: metrics + plan ---------- */
function metrics(a,ltp,lvol){
  if(!a||a.length<60)return null;
  const s=a.slice();                                      /* work on a copy, add today's live price if newer than history */
  if(N(ltp)&&ltp>0){const L=s[s.length-1];if(Math.abs(L.p-ltp)>1e-9){s.push({d:'live',p:ltp,h:Math.max(ltp,L.p),l:Math.min(ltp,L.p),v:0})}}
  const n=s.length,c=s.map(x=>x.p),P=c[n-1];
  const w=s.slice(-Math.min(500,n));
  const lo=Math.min(...w.map(x=>x.l)),hi=Math.max(...w.map(x=>x.h)),pos=hi>lo?(P-lo)/(hi-lo)*100:50;
  const rets=[];for(let i=Math.max(1,n-60);i<n;i++)rets.push((c[i]/c[i-1]-1)*100);
  const vol=sd(rets);
  let tr=[];for(let i=Math.max(1,n-14);i<n;i++)tr.push(Math.max(s[i].h-s[i].l,Math.abs(s[i].h-c[i-1]),Math.abs(s[i].l-c[i-1])));
  const atr=Math.max(mean(tr),P*0.01);
  const last20=s.slice(-20),last60=s.slice(-60),last10=s.slice(-10);
  const sup=Math.min(...last20.map(x=>x.l)),res=Math.max(...last60.map(x=>x.h));
  const turn=mean(s.slice(-21,-1).filter(x=>x.v>0).map(x=>x.p*x.v)||[0])||0;
  const rsi=rsiLast(c,14,n-1),rsiPrev=rsiLast(c,14,n-2);
  const low10=Math.min(...last10.map(x=>x.l)),bounce=P>low10*1.01;
  /* MACD 12-26-9 */
  const e12=emaArr(c,12),e26=emaArr(c,26),ml=e12.map((v,i)=>v-e26[i]),sg=emaArr(ml,9),hs=ml.map((v,i)=>v-sg[i]);
  const macd={h:hs[n-1],hp:hs[n-2],h2:hs[n-3],m:ml[n-1],cross:hs.slice(-3).some((v,i,arr)=>i>0&&arr[i-1]<=0&&v>0)};
  macd.up=n>=35&&hs[n-1]>hs[n-2]&&(hs[n-2]>=hs[n-3]||macd.cross);
  /* Bollinger 20,2 */
  const w20=c.slice(-20),bm=mean(w20),bs=sd(w20),bu=bm+2*bs,bl=bm-2*bs,pb=bu>bl?(P-bl)/(bu-bl):0.5;
  const pbPrev=(()=>{const w=c.slice(-21,-1),m0=mean(w),s0=sd(w),l0=m0-2*s0;return c[n-2]<l0})();
  const boll={pb,low:pb<=0.3||(pbPrev&&P>bl),bl,bu,bm};
  /* Ichimoku 9-26-52 (cloud = values from 26 bars ago) */
  let ich=null;if(n>=80){const T=i=>(hh(s,i,9)+ll(s,i,9))/2,K=i=>(hh(s,i,26)+ll(s,i,26))/2,t=T(n-1),k=K(n-1),i0=n-27,sa=(T(i0)+K(i0))/2,sb=(hh(s,i0,52)+ll(s,i0,52))/2,top=Math.max(sa,sb),bot=Math.min(sa,sb);
    ich={t,k,top,bot,above:P>top,inside:P<=top&&P>=bot,tk:t>=k,ok:t>=k||P>top}}
  /* Money Flow Index 14 (saved-history bars, volume needed) */
  let mfi=null,mfiP=null;{const hs2=a.slice(-20),tp=hs2.map(x=>(x.h+x.l+x.p)/3),f=(end)=>{let up=0,dn=0;for(let i=end-13;i<=end;i++){const m=tp[i]*hs2[i].v;if(tp[i]>tp[i-1])up+=m;else if(tp[i]<tp[i-1])dn+=m}return dn===0?(up?100:50):100-100/(1+up/dn)};
    if(hs2.length>=20&&hs2.some(x=>x.v>0)){mfi=f(hs2.length-1);mfiP=f(hs2.length-4)}}
  /* Classic pivot from the last saved day */
  const ld=a[a.length-1],pv=(ld.h+ld.l+ld.p)/3,pivot={p:pv,s1:2*pv-ld.h,s2:pv-(ld.h-ld.l),r1:2*pv-ld.l};
  pivot.ok=P<=pv*1.005&&P>=pivot.s2*0.985;
  /* Volume spike (today's live volume counts if known) */
  const hv=a.slice(-21,-1).map(x=>x.v).filter(v=>v>0),av=mean(hv)||0,rv=Math.max(...a.slice(-3).map(x=>x.v),lvol>0?lvol:0),vr=av>0?rv/av:0,upDay=P>=c[Math.max(0,n-2)];
  const vsp={r:vr,ok:vr>=1.8&&upDay};
  /* Smart money (accumulation guess): last 10 saved days - volume on up days vs down days, price still in the lower half */
  let uv=0,dv=0;a.slice(-10).forEach((x,i,arr)=>{const pr=i?arr[i-1].p:x.o;if(x.p>pr)uv+=x.v;else if(x.p<pr)dv+=x.v});
  const sr=dv>0?uv/dv:(uv>0?9:1),smart={r:sr,ok:sr>=1.3&&pos<=50};
  /* Price action: hammer / bullish engulfing / higher-low breakout on the last bar */
  const b0=s[n-1],b1=s[n-2],o0=b0.o>0?b0.o:b1.p,o1=b1.o>0?b1.o:b1.p,body=Math.abs(b0.p-o0),rng=Math.max(1e-9,b0.h-b0.l),lw=Math.min(o0,b0.p)-b0.l;
  const hammer=lw>=2*Math.max(body,rng*0.05)&&(b0.p-b0.l)/rng>=0.6,eng=b1.p<o1&&b0.p>o0&&b0.p>=o1&&o0<=b1.p,hl=b0.l>b1.l&&b0.p>b1.h;
  const pa={hammer,eng,hl,ok:hammer||eng||hl,name:hammer?'Hammer':eng?'Bullish engulfing':hl?'Higher low + breakout':''};
  return{n,P,lo,hi,pos,vol,atr,sup,res,turn,rsi,rsiPrev,bounce,days:a.length,macd,boll,ich,mfi,mfiP,pivot,vsp,smart,pa}}

function backtest(a,cfgx){                                /* what happened after the same entry signal in the past (10 trading days later) */
  const n=a.length;if(n<130)return null;const c=a.map(x=>x.p),R=rsiAll(c,14);let last=-99,k=0,w=0,sum=0;
  for(let t=100;t<n-10;t++){
    const lo=Math.min(...a.slice(Math.max(0,t-250),t+1).map(x=>x.l)),hi=Math.max(...a.slice(Math.max(0,t-250),t+1).map(x=>x.h));
    const pos=hi>lo?(c[t]-lo)/(hi-lo)*100:50,l10=Math.min(...a.slice(t-9,t+1).map(x=>x.l));
    if(R[t]!=null&&R[t]<=cfgx.rsiMax&&pos<=cfgx.posMax&&c[t]>l10*1.01&&t-last>=5){last=t;const rt=(c[t+10]/c[t]-1)*100;k++;if(rt>0)w++;sum+=rt}}
  return k?{k,win:w/k*100,avg:sum/k}:{k:0,win:0,avg:0}}

function planFor(m,budget){
  const P=m.P,atr=m.atr;
  let b1=r1(P-0.2*atr),b2=r1(P-0.8*atr),b3=r1(Math.max(m.sup,P-1.5*atr));
  if(b2>=b1)b2=r1(b1-0.1);if(b3>=b2)b3=r1(b2-0.1);if(b3<=0)b3=r1(Math.max(0.1,b2*0.97));
  const stop=r1(Math.max(0.1,Math.min(m.sup,b3)-0.5*atr));
  let t1=r1(Math.min(m.res,P+1.5*atr));if(t1<P*1.03)t1=r1(P*1.03);
  let t2=r1(Math.max(t1*1.02,Math.min(Math.max(m.res,t1),P+3*atr)));if(t2<=t1)t2=r1(t1*1.03);
  const fr=[.4,.3,.3],lv=[b1,b2,b3],q=lv.map((p,i)=>Math.max(0,Math.floor(budget*fr[i]/p)));
  const tq=q.reduce((x,y)=>x+y,0),cost=q.reduce((x,y,i)=>x+y*lv[i],0),avg=tq?cost/tq:P;
  const risk=(avg-stop)/avg*100,rew1=(t1-avg)/avg*100;
  return{b:lv,q,tq,avg:r1(avg),cost,stop,t1,t2,risk,rew1,rr:risk>0?rew1/risk:0}}

/* ---------- portfolio holdings (same maths as the Portfolio page) ---------- */
function pd(s){if(s==null)return 0;const t=String(s).trim();let m=t.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);if(m)return Date.UTC(+m[1],+m[2]-1,+m[3]);
  m=t.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{4})/);if(m)return Date.UTC(+m[3],+m[2]-1,+m[1]);const x=Date.parse(t);return isNaN(x)?0:x}
function holdings(){
  try{const S=LSG('ds_pf_v2');if(!S||!S.a)return[];const A=S.a[S.act]||S.a.lb;if(!A)return[];
    const H={};const asof=A.open?pd(A.open.date):null;
    if(A.open&&A.open.rows)A.open.rows.forEach(r=>{const h=H[r.code]||(H[r.code]={q:0,c:0});h.q+=r.qty;h.c+=r.qty*r.avg});
    (A.trades||[]).map((t,i)=>({t,i,ts:pd(t.date)})).sort((a,b)=>a.ts-b.ts||a.i-b.i).forEach(x=>{const t=x.t;if(asof!==null&&asof&&x.ts<=asof)return;
      const h=H[t.code]||(H[t.code]={q:0,c:0});if(t.type==='Buy'){h.q+=t.qty;h.c+=t.qty*t.rate}else{const sq=Math.min(t.qty,h.q),a=h.q?h.c/h.q:0;h.c-=a*sq;h.q-=sq}});
    return Object.keys(H).filter(k=>H[k].q>0).sort().map(k=>({code:String(k).toUpperCase(),q:H[k].q,avg:H[k].c/H[k].q}))}
  catch(e){return[]}}

/* ---------- the model ---------- */
const hs=t=>{let h=0;for(let i=0;i<t.length;i++)h=(h*31+t.charCodeAt(i))|0;return h};
const sigNow=()=>[localStorage.getItem('ds_lt_time')||'',window.__hist&&window.__hist._D?window.__hist._D.size:0,(LSG('ds_lt_cache')||[]).length,JSON.stringify(cfg),hs(localStorage.getItem('ds_pf_v2')||'')].join('|');
function build(){
  const {ser,dates}=seriesMap(),live=LSG('ds_lt_cache')||[],lm={};
  live.forEach(r=>{if(r&&r.code&&!/\s/.test(r.code)){const p=r.ltp>0?r.ltp:r.ycp;lm[String(r.code).toUpperCase()]={ltp:p>0?p:null,vol:r.vol||0,eps:r.eps,sec:r.sec&&r.sec!=='–'?r.sec:'',pct:r.pct}}});
  const picks=[],all=[];let scanned=0;
  ser.forEach((a,code)=>{const L=lm[code]||{};const m=metrics(a,L.ltp,L.vol);if(!m)return;scanned++;
    const req={cheap:m.P<=cfg.maxP,vol:m.vol>=cfg.minVol,liq:m.turn>=cfg.minTurn*1e6&&m.days>=120};
    all.push({code,m,L,req});
    if(!(req.cheap&&req.vol&&req.liq))return;
    const bt=backtest(a,cfg),opt=[
      ['pos','2 বছরের নিচের দিকে ('+f1(m.pos)+'%)',m.pos<=cfg.posMax],
      ['rsi','RSI '+f1(m.rsi)+' (≤'+cfg.rsiMax+')',N(m.rsi)&&m.rsi<=cfg.rsiMax],
      ['bnc','নিচ থেকে উঠছে (১০ দিনের low-এর ১%+ উপরে)',m.bounce],
      ['eps',N(L.eps)?'EPS '+f2(L.eps):'EPS নেই',cfg.eps?(N(L.eps)&&L.eps>0):(!N(L.eps)||L.eps>0)],
      ['bt',bt&&bt.k>=4?'আগে একই সংকেতে '+f1(bt.win)+'% বার ১০ দিনে বেড়েছে (n='+bt.k+')':'আগের সংকেত কম',bt&&bt.k>=4&&bt.win>=50&&bt.avg>0],
      ['macd','MACD histogram '+(N(m.macd.h)?m.macd.h.toFixed(2):'–')+(m.macd.cross?' (নতুন bullish cross)':m.macd.up?' (উপরে উঠছে)':' (নিচে/স্থির)'),m.macd.up],
      ['bb','Bollinger %B '+f2(m.boll.pb)+(m.boll.low?' (নিচের band-এর কাছে/ফিরছে)':''),m.boll.low],
      ['ich',m.ich?'Ichimoku: '+(m.ich.above?'cloud-এর উপরে':m.ich.inside?'cloud-এর ভিতরে':'cloud-এর নিচে')+', Tenkan '+(m.ich.tk?'≥':'<')+' Kijun':'Ichimoku: history কম (৮০ দিন লাগে)',!!(m.ich&&m.ich.ok)],
      ['mfi',N(m.mfi)?'Money Flow (MFI) '+f1(m.mfi)+(m.mfi>m.mfiP?' ↑':' ↓'):'Money Flow: volume data নেই',N(m.mfi)&&(m.mfi<=25||(m.mfi<=45&&m.mfi>m.mfiP))],
      ['piv','Pivot '+f1(m.pivot.p)+' · S1 '+f1(m.pivot.s1)+' · S2 '+f1(m.pivot.s2)+(m.pivot.ok?' (support-এর কাছে)':''),m.pivot.ok],
      ['sm','Smart money (জমা হওয়ার আন্দাজ): ওঠা-দিনের/নামা-দিনের volume = '+f1(m.smart.r)+'x',m.smart.ok],
      ['pa','Price action: '+(m.pa.name||'বিশেষ কিছু নেই'),m.pa.ok],
      ['vs','Volume spike '+f1(m.vsp.r)+'x (গড়ের)',m.vsp.ok]];
    const score=opt.filter(o=>o[2]).length;
    if(score>=6)picks.push({code,m,L,opt,score,bt,plan:planFor(m,cfg.budget)})});
  picks.sort((x,y)=>y.score-x.score||y.m.vol-x.m.vol);
  /* is the live price already inside the first buy step? */
  picks.forEach(p=>{p.now=p.m.P<=p.plan.b[0]*1.005;p.gap=(p.m.P/p.plan.b[0]-1)*100});
  /* holdings advice */
  const hold=holdings().map(h=>{const a=ser.get(h.code),L=lm[h.code]||{},m=metrics(a,L.ltp,L.vol);if(!m)return{code:h.code,q:h.q,avg:h.avg,none:1};
    const pl=planFor(m,cfg.budget),P=m.P,pc=(P/h.avg-1)*100;let act='hold',txt='',add=null,sell=null;
    if(P<=pl.stop){act='stop';sell=h.q;txt='দাম stop ('+f1(pl.stop)+') ভেঙেছে — আরও নামার ঝুঁকি। ক্ষতি কাটার কথা ভাবুন (সব বিক্রি)।'}
    else if(P>=pl.t2&&P>h.avg){act='sell';sell=h.q;txt='Target 2 ('+f1(pl.t2)+') ছুঁয়েছে — বাকি সব বিক্রির সময়।'}
    else if(P>=pl.t1&&P>h.avg){act='sell';sell=Math.max(1,Math.floor(h.q*.5));txt='Target 1 ('+f1(pl.t1)+') ছুঁয়েছে — অর্ধেক ('+fq(sell)+' টি) বিক্রি করে লাভ তুলুন, বাকিটা Target 2 পর্যন্ত।'}
    else if(P<h.avg&&pc<=-4&&m.pos<=cfg.posMax+10&&(!N(m.rsi)||m.rsi<=cfg.rsiMax)&&P>pl.stop){
      const cap=Math.max(0,Math.floor(cfg.budget/P)),Q=Math.min(h.q,cap);
      if(Q>0){act='avg';const na=(h.q*h.avg+Q*P)/(h.q+Q);add={q:Q,p:r1(P),na,be:(na/P-1)*100};txt='Average করার জায়গা: '+fq(Q)+' টি ≈'+f1(P)+'-এ কিনলে নতুন average '+f2(na)+' (এখন '+f2(h.avg)+'), break-even-এ লাগবে +'+f1(add.be)+'%। stop '+f1(pl.stop)+'-এর নিচে গেলে আর কিনবেন না।'}}
    if(!txt)txt=P<h.avg?'এখনও average-এর শর্ত মেলেনি (দাম ≥৪% নিচে + নিচের দিকে + RSI কম লাগে)। অপেক্ষা করুন।':'Target 1 ('+f1(pl.t1)+') আসেনি, hold করুন।';
    return{code:h.code,q:h.q,avg:h.avg,P,pc,m,pl,act,txt,add,sell}});
  return{picks,hold,scanned,days:dates.length,last:dates.length?dates[dates.length-1]:'',live:live.length,time:localStorage.getItem('ds_lt_time')||''}}
const getModel=force=>{const s=sigNow();if(force||!model||s!==msig){model=build();msig=s}return model};

/* ---------- drawing ---------- */
const CSS='#bp .bt{display:flex;gap:6px;overflow-x:auto;margin:6px 0 8px}#bp .bt button,#bp .bh button{flex:0 0 auto;border:1px solid var(--bd);background:var(--bg);color:var(--tx);border-radius:18px;padding:6px 12px;font:600 12.5px system-ui;width:auto}#bp .bt button.on,#bp .bh button.on{background:var(--ac);color:#fff;border-color:var(--ac)}'
+'#bp .bh{display:flex;gap:6px;align-items:center;justify-content:space-between}#bp .bh span{font-size:11.5px;color:var(--mu)}#bp .bh div{display:flex;gap:6px}#bp .bh button{padding:4px 10px;border-radius:10px}'
+'#bp .bk{border:1px solid var(--bd);border-radius:12px;margin:0 0 8px;background:var(--bg);overflow:hidden}#bp .bk .tp{display:flex;align-items:center;gap:8px;padding:9px 10px;cursor:pointer}#bp .bk .tp b{font-size:14px}#bp .bk .tp small{flex:1;color:var(--mu);font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
+'#bp .tag{font:700 11px system-ui;padding:2px 8px;border-radius:9px;background:var(--card);border:1px solid var(--bd);color:var(--mu)}#bp .tag.g{background:rgba(8,153,129,.15);color:var(--up);border-color:transparent}#bp .tag.r{background:rgba(242,54,69,.13);color:var(--dn);border-color:transparent}#bp .tag.y{background:rgba(245,158,11,.16);color:#b45309;border-color:transparent}'
+'#bp .bd{padding:0 10px 10px;font-size:12.5px;line-height:1.55}#bp table{width:100%;border-collapse:collapse;margin:5px 0;font-size:12.5px}#bp td,#bp th{padding:3px 4px;border-bottom:1px solid var(--bd);text-align:right}#bp td:first-child,#bp th:first-child{text-align:left}#bp .ck{color:var(--mu);font-size:10.5px;line-height:1.28}#bp .ck.cl{margin:2px 0 4px}#bp .ck.cl div{padding:0}#bp .cs{display:flex;gap:6px;align-items:center;font-size:11px;color:var(--mu);margin:2px 0}#bp .cs b{font-weight:700}#bp .cs button{margin-left:auto}#bp .ac{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}#bp .fm{display:flex;gap:6px;align-items:flex-end;flex-wrap:wrap;margin-top:6px;padding:8px;border:1px dashed var(--ac);border-radius:10px}#bp .fm label{font-size:11px;color:var(--mu);display:flex;flex-direction:column;gap:2px}#bp .fm input{width:90px;padding:5px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--tx)}#bp .ck i{font-style:normal;color:var(--up)}#bp .ck u{text-decoration:none;color:var(--dn)}'
+'#bp .nt{color:var(--mu);font-size:11.5px;margin:4px 2px 8px}#bp .al{border:1px solid var(--ac);border-radius:12px;padding:8px 10px;margin:6px 0;font-size:12.5px;background:var(--card);white-space:pre-line}'
+'#bp .sf{display:grid;grid-template-columns:1fr 1fr;gap:6px 10px;margin:6px 0}#bp .sf label{font-size:11.5px;color:var(--mu);display:flex;flex-direction:column;gap:2px}#bp .sf input{width:100%;padding:6px;border:1px solid var(--bd);border-radius:8px;background:var(--bg);color:var(--tx)}';
function actTag(a){return a==='sell'?'<span class="tag g">বিক্রি</span>':a==='stop'?'<span class="tag r">stop ভাঙা</span>':a==='avg'?'<span class="tag y">average</span>':'<span class="tag">hold</span>'}
function pickHtml(p,i){const m=p.m,pl=p.plan,o=openId===p.code;
  let h='<div class="bk"><div class="tp" data-o="'+esc(p.code)+'"><b>'+esc(p.code)+'</b><small>'+esc(p.L.sec||'')+' · ঝুঁকি/vol '+f1(m.vol)+'%</small><span class="tag '+(p.now?'g':'')+'">'+(p.now?'এখন কিনুন':'অপেক্ষা '+f1(p.gap)+'%')+'</span>'+(HELD[p.code]?'<span class="tag y">আছে '+fq(HELD[p.code].q)+'</span>':'')+'<span class="tag">'+f2(m.P)+'</span><span class="tag">'+p.score+'/'+p.opt.length+'</span></div>';
  if(o){h+='<div class="bd">'+ckHtml(p)
    +'<table><tr><th>কেনার ধাপ</th><th>দাম ≤</th><th>পরিমাণ</th><th>টাকা</th></tr>'
    +pl.b.map((x,k)=>'<tr><td>ধাপ '+(k+1)+' ('+['৪০%','৩০%','৩০%'][k]+')</td><td>'+f1(x)+'</td><td>'+fq(pl.q[k])+'</td><td>'+fq(pl.q[k]*x)+'</td></tr>').join('')
    +'<tr><td><b>মোট</b></td><td>avg '+f2(pl.avg)+'</td><td>'+fq(pl.tq)+'</td><td>'+fq(pl.cost)+'</td></tr></table>'
    +'<table><tr><th>বিক্রি</th><th>দাম</th><th>কতটা</th><th>লাভ</th></tr>'
    +'<tr><td>Target 1</td><td>'+f1(pl.t1)+'</td><td>৫০%</td><td>+'+f1((pl.t1/pl.avg-1)*100)+'%</td></tr>'
    +'<tr><td>Target 2</td><td>'+f1(pl.t2)+'</td><td>বাকি ৫০%</td><td>+'+f1((pl.t2/pl.avg-1)*100)+'%</td></tr>'
    +'<tr><td>Stop (সব বিক্রি)</td><td>'+f1(pl.stop)+'</td><td>১০০%</td><td>'+f1((pl.stop/pl.avg-1)*100)+'%</td></tr></table>'
    +'<div class="ck">ঝুঁকি '+f1(pl.risk)+'% : লাভ (T1) '+f1(pl.rew1)+'% · অনুপাত '+f1(pl.rr)+' · 2 বছরের range '+f1(m.lo)+' – '+f1(m.hi)+' · support '+f1(m.sup)+' · resistance '+f1(m.res)+'</div>'
    +'<div class="ac"><button type="button" class="tag" data-c="'+esc(p.code)+'" style="cursor:pointer">📈 chart খুলুন</button><button type="button" class="tag g" data-a="fb" data-code="'+esc(p.code)+'" style="cursor:pointer">✅ কিনেছি</button></div>'+formHtml(p.code)+'</div>'}
  return h+'</div>'}

/* checklist: small text, can be minimized to one line (button inside, remembered in settings) */
function ckHtml(p){const ok=p.opt.filter(x=>x[2]).length,bad=p.opt.length-ok;
  const btn='<button type=\"button\" class=\"tag\" data-a=\"ck\" style=\"cursor:pointer\">'+(cfg.ckmin?'▾ খুলুন':'▴ ছোট করুন')+'</button>';
  if(cfg.ckmin)return '<div class=\"cs\"><span>শর্ত: <b style=\"color:var(--up)\">✔ '+ok+'</b> · <b style=\"color:var(--dn)\">✘ '+bad+'</b></span>'+btn+'</div>';
  return '<div class=\"cs\"><span>শর্ত: <b style=\"color:var(--up)\">✔ '+ok+'</b> · <b style=\"color:var(--dn)\">✘ '+bad+'</b></span>'+btn+'</div><div class=\"ck cl\">'+p.opt.map(x=>'<div>'+(x[2]?'<i>✔</i> ':'<u>✘</u> ')+esc(x[1])+'</div>').join('')+'</div>'}
/* \"bought / sold\" mini form (goes straight into the portfolio -> Cards, Table, Compare, and this page update by themselves) */
function formHtml(code){if(!form||form.code!==code)return '';
  return '<div class=\"fm\"><b style=\"font-size:12px;width:100%\">'+(form.type==='Sell'?'💰 বিক্রি হয়েছে':'✅ কেনা হয়েছে')+' — '+esc(code)+'</b><label>পরিমাণ<input data-q type=\"number\" inputmode=\"decimal\" value=\"'+esc(form.q)+'\"></label><label>দাম (৳)<input data-p type=\"number\" inputmode=\"decimal\" step=\"0.1\" value=\"'+esc(form.p)+'\"></label><button type=\"button\" class=\"tag g\" data-a=\"fs\" style=\"cursor:pointer\">সেভ</button><button type=\"button\" class=\"tag\" data-a=\"fc\" style=\"cursor:pointer\">বাতিল</button></div>'}
const ui=()=>[tab,edit,openId,msg,cfg.ckmin,form?form.code+form.type:''].join('|');
let openId='',HELD={};
const held=()=>{const o={};try{holdings().forEach(h=>{o[h.code]=h})}catch(e){}return o};
function html(){
  const m=getModel();HELD=held();
  let h='<h1>🎯 Buy Plan</h1><div class="bh"><span>'+m.scanned+' share · history '+m.days+' দিন'+(m.last?' (to '+esc(m.last)+')':'')+(m.time?' · live '+esc(m.time):'')+'</span><div><button type="button" data-a="ref">🔄</button><button type="button" data-a="alert">🔔</button><button type="button" data-a="edit" class="'+(edit?'on':'')+'">⚙</button></div></div>';
  const pl=LSG(PK);
  if(msg)h+='<div class="al">'+esc(msg)+'</div>';
  if(edit){const F=[['maxP','সর্বোচ্চ দাম (৳)'],['minVol','ন্যূনতম volatility (দৈনিক σ %)'],['minTurn','ন্যূনতম গড় লেনদেন (মিলিয়ন ৳/দিন)'],['posMax','২ বছরের range-এ সর্বোচ্চ অবস্থান %'],['rsiMax','সর্বোচ্চ RSI'],['budget','প্রতি share-এ বাজেট (৳)'],['open','Market খোলে (HH:MM)'],['delay','কেনার alert খোলার কত মিনিট পর'],['close','Market বন্ধ (HH:MM)'],['plan','পরের দিনের plan সময় (HH:MM)']];
    h+='<div class="sf">'+F.map(f=>'<label>'+f[1]+'<input data-f="'+f[0]+'" value="'+esc(cfg[f[0]])+'"></label>').join('')+'<label><input type="checkbox" data-f="on" '+(cfg.on?'checked':'')+' style="width:auto"> Alert চালু</label><label><input type="checkbox" data-f="eps" '+(cfg.eps?'checked':'')+' style="width:auto"> EPS ধনাত্মক হতেই হবে</label></div><button type="button" class="tag" data-a="reset">Default-এ ফেরান</button>'}
  h+='<div class="bt"><button type="button" data-t="buy" class="'+(tab==='buy'?'on':'')+'">🛒 কিনুন ('+m.picks.length+')</button><button type="button" data-t="hold" class="'+(tab==='hold'?'on':'')+'">💼 আমার holding ('+m.hold.length+')</button><button type="button" data-t="plan" class="'+(tab==='plan'?'on':'')+'">📅 আগামী plan</button></div>';
  if(!m.scanned)return h+'<div class="nt">Saved history লাগবে (Table → Daily data / Saved data)। কমপক্ষে ৬০ দিনের data থাকলে হিসাব হয়; ১২০+ দিন হলে ভালো।</div>';
  if(tab==='buy'){
    h+=m.picks.length?m.picks.slice(0,cfg.topN).map(pickHtml).join(''):'<div class="nt">এখন শর্ত মেলে এমন share নেই। ⚙ থেকে সর্বোচ্চ দাম বা volatility শর্ত বদলে দেখুন।</div>';
    if(m.picks.length>cfg.topN)h+='<button type="button" class="tag" data-a="more">আরও '+(m.picks.length-cfg.topN)+'টি দেখান</button>';
    h+='<div class="nt">বাছাই: দাম ≤ '+cfg.maxP+'৳, volatility ≥ '+cfg.minVol+'%, গড় লেনদেন ≥ '+cfg.minTurn+' মিলিয়ন ৳ — তারপর ১৩টির মধ্যে ৬+ শর্ত (নিচের দিকে অবস্থান, RSI, উঠতে শুরু, EPS, আগের সংকেতের ফল, MACD, Bollinger, Ichimoku, Money Flow, Pivot, Smart money, Price action, Volume spike)। Smart money শুধু volume দেখে আন্দাজ — broker/order data নেই। "এখন কিনুন" মানে live দাম প্রথম ধাপের দামের মধ্যে আছে।</div>'}
  else if(tab==='hold'){
    h+=m.hold.length?m.hold.map(x=>x.none?'<div class="bk"><div class="tp"><b>'+esc(x.code)+'</b><small>history কম, হিসাব হয়নি</small></div></div>':
      '<div class="bk"><div class="tp" data-c="'+esc(x.code)+'"><b>'+esc(x.code)+'</b><small>'+fq(x.q)+' টি · avg '+f2(x.avg)+' · এখন '+f2(x.P)+' ('+(x.pc>=0?'+':'')+f1(x.pc)+'%)</small>'+actTag(x.act)+'</div><div class="bd">'+esc(x.txt)+'<div class="ck">T1 '+f1(x.pl.t1)+' · T2 '+f1(x.pl.t2)+' · stop '+f1(x.pl.stop)+'</div><div class="ac"><button type="button" class="tag r" data-a="fsl" data-code="'+esc(x.code)+'" style="cursor:pointer">💰 বেচেছি</button><button type="button" class="tag g" data-a="fb" data-code="'+esc(x.code)+'" style="cursor:pointer">➕ আরও কিনেছি</button></div>'+formHtml(x.code)+'</div></div>').join(''):'<div class="nt">Portfolio-তে কোনো holding পাওয়া যায়নি (Table → Portfolio তে PDF/Gmail থেকে যোগ করুন)।</div>'}
  else{
    h+=pl&&pl.items?'<div class="al">'+esc(pl.text)+'</div>':'<div class="nt">এখনও plan তৈরি হয়নি। প্রতিদিন '+esc(cfg.plan)+'-এ (app খোলা থাকলে) নিজে তৈরি হবে, অথবা 🔔 চেপে এখনই বানান।</div>'}
  h+='<div class="nt">এটি পুরনো দামের হিসাব — গ্যারান্টি বা বিনিয়োগ পরামর্শ নয়। DSE-র circuit breaker, T+2 settlement (আজ কেনা share আজ বেচা যায় না) মাথায় রাখুন।</div>';
  return h}

/* ---------- mount inside the Projected iframe ---------- */
const frm=()=>document.getElementById('prF');
function idoc(){try{const f=frm(),d=f&&f.contentDocument;return d&&d.getElementById('sc')?d:null}catch(e){return null}}
function draw(d){d=d||mount();if(!d)return;const el=d.getElementById('bp');if(!el)return;el.innerHTML=html();lastSig=sigNow()+'|'+ui()}
function openChart(code){try{const H=window.__hist;if(H&&H.series&&H.series(code).length>=5){H.pick(code);return}}catch(e){}try{if(window.__prFetchCode){window.__prFetchCode(code);return}}catch(e){}try{window.gnToast&&gnToast(code+': data নেই')}catch(e){}}
function onClick(e){const t=e.target,q=s=>t.closest&&t.closest(s);
  const a=q('[data-a]');if(a){const k=a.dataset.a;
    if(k==='ref'){getModel(true);draw()}
    else if(k==='edit'){edit=edit?0:1;draw()}
    else if(k==='more'){cfg.topN+=8;saveCfg();draw()}
    else if(k==='reset'){cfg=Object.assign({},DEF);saveCfg();draw()}
    else if(k==='alert'){runPlan(true)}
    else if(k==='ck'){cfg.ckmin=cfg.ckmin?0:1;saveCfg();draw()}
    else if(k==='fb'||k==='fsl'){const code=a.dataset.code,type=k==='fsl'?'Sell':'Buy',mm=getModel(),pk=mm.picks.find(x=>x.code===code),hd=mm.hold.find(x=>x.code===code),P=(pk&&pk.m.P)||(hd&&hd.P)||0;
      let q=1;if(type==='Buy')q=pk?Math.max(1,pk.plan.tq):Math.max(1,Math.floor(cfg.budget/(P||1)));else q=hd?(hd.sell||hd.q):1;
      form={code:code,type:type,q:Math.round(q),p:P?r1(P):''};draw()}
    else if(k==='fc'){form=null;draw()}
    else if(k==='fs'){const box=a.closest('.fm'),q=parseFloat(box.querySelector('[data-q]').value),pr=parseFloat(box.querySelector('[data-p]').value);
      if(!(q>0&&pr>0)){msg='পরিমাণ আর দাম দুটোই দিন।';draw();return}
      const ok=typeof window.__pfTrade==='function'&&window.__pfTrade(form.type,form.code,q,pr);
      msg=ok?'✔ '+form.code+': '+fq(q)+' টি @ '+f2(pr)+' '+(form.type==='Sell'?'বিক্রি':'কেনা')+' portfolio-তে যোগ হয়েছে — Cards ও এই পেজ নিজে update হয়েছে।':'সেভ হয়নি — Portfolio লোড হয়নি।';
      const wasBuy=form.type==='Buy';form=null;if(ok&&wasBuy)tab='hold';model=null;msig='';draw()}
    return}
  const c=q('[data-c]');if(c){openChart(c.dataset.c);return}
  const tb=q('[data-t]');if(tb){tab=tb.dataset.t;draw();return}
  const o=q('[data-o]');if(o){const id=o.dataset.o;openId=openId===id?'':id;draw()}}
function onChange(e){const t=e.target;if(!t.dataset||!t.dataset.f)return;const k=t.dataset.f;
  if(t.type==='checkbox')cfg[k]=t.checked?1:0;else if(/^(open|close|plan)$/.test(k)){if(/^\d{1,2}:\d{2}$/.test(t.value.trim()))cfg[k]=t.value.trim()}else{const v=parseFloat(t.value);if(isFinite(v)&&v>=0)cfg[k]=v}
  saveCfg();model=null;draw()}
function mount(){const d=idoc();if(!d)return false;
  if(!d.getElementById('bpCss')){const st=d.createElement('style');st.id='bpCss';st.textContent=CSS;d.head.appendChild(st)}
  let el=d.getElementById('bp');if(!el){el=d.createElement('div');el.className='c';el.id='bp';const sc=d.getElementById('sc');sc.parentNode.insertBefore(el,sc)}
  if(!el.__bp){el.__bp=1;el.addEventListener('click',onClick);el.addEventListener('change',onChange)}
  return d}
function tick(){try{const d=mount();if(!d)return;if(d.documentElement.getAttribute('data-v')!=='proj')return;
  if(form&&d.getElementById('bp').firstChild)return;if(lastSig!==sigNow()+'|'+ui()||!d.getElementById('bp').firstChild)draw(d)}catch(e){console.error('buyplan',e)}}

/* ---------- alerts ---------- */
function banner(title,text){
  try{let b=document.getElementById('bpBanner');if(!b){b=document.createElement('div');b.id='bpBanner';b.style.cssText='position:fixed;left:8px;right:8px;top:max(8px,env(safe-area-inset-top));z-index:99999;background:#111827;color:#fff;border-radius:12px;padding:10px 12px;font:13px/1.5 system-ui;box-shadow:0 6px 24px rgba(0,0,0,.35);white-space:pre-line;max-height:55vh;overflow:auto';document.body.appendChild(b)}
    b.innerHTML='<b style="font-size:14px">'+esc(title)+'</b><button type="button" style="float:right;background:#374151;color:#fff;border:0;border-radius:8px;padding:2px 10px;width:auto" id="bpX">✕</button><div style="margin-top:4px">'+esc(text)+'</div>';b.style.display='block';document.getElementById('bpX').onclick=()=>{b.style.display='none'}}catch(e){}
  try{window.gnToast&&gnToast(title)}catch(e){}
  try{navigator.vibrate&&navigator.vibrate([200,100,200])}catch(e){}
  try{if(cfg.notif&&window.Notification&&Notification.permission==='granted')new Notification(title,{body:text.slice(0,180)})}catch(e){}}
function waitLive(ms){return new Promise(res=>{let done=0;const fin=()=>{if(!done){done=1;window.removeEventListener('ltdata',fin);res()}};window.addEventListener('ltdata',fin);setTimeout(fin,ms);
  try{const w=window.__ltRefresh;if(w){const r=w();if(r&&r.then)r.then(()=>setTimeout(fin,1500),()=>{})}else fin()}catch(e){fin()}})}
function textBuy(m){
  const now=m.picks.filter(p=>p.now).slice(0,5),wait=m.picks.filter(p=>!p.now).slice(0,3),L=[];
  if(now.length){L.push('🟢 এখন কেনার জায়গায়:');now.forEach(p=>L.push('• '+p.code+' এখন '+f2(p.m.P)+' → ধাপ ১: ≤'+f1(p.plan.b[0])+' এ '+fq(p.plan.q[0])+' টি; ধাপ ২: ≤'+f1(p.plan.b[1])+' এ '+fq(p.plan.q[1])+'; ধাপ ৩: ≤'+f1(p.plan.b[2])+' এ '+fq(p.plan.q[2])+' | T1 '+f1(p.plan.t1)+' (৫০% বেচুন), T2 '+f1(p.plan.t2)+', stop '+f1(p.plan.stop)))}
  else L.push('এই মুহূর্তে কোনো share প্রথম কেনার ধাপে নেই।');
  if(wait.length){L.push('⏳ অপেক্ষা:');wait.forEach(p=>L.push('• '+p.code+' '+f2(p.m.P)+' → '+f1(p.plan.b[0])+'-এ নামলে কিনুন'))}
  const ha=m.hold.filter(x=>x.act&&x.act!=='hold');
  if(ha.length){L.push('💼 Holding:');ha.forEach(x=>L.push('• '+x.code+': '+x.txt))}
  return L.join('\n')}
async function runBuy(manual){
  await waitLive(9000);const m=getModel(true);const t=textBuy(m);msg='⏰ '+new Date().toLocaleTimeString('en-GB')+' কেনার check\n'+t;draw();
  banner('🟢 কেনার check (market খোলার '+cfg.delay+' মিনিট পর)',t)}
async function runPlan(manual){
  await waitLive(9000);const m=getModel(true),d=dhaka();
  let nd=d?d.key:'',w=d?d.wd:0;/* next trading day label */
  const names=['রবি','সোম','মঙ্গল','বুধ','বৃহ','শুক্র','শনি'];let k=1,nw=(w+1)%7;while(!isTradeDay(nw)&&k<7){nw=(nw+1)%7;k++}
  const L=['📅 আগামী কার্যদিবসের ('+names[nw]+'বার) plan — '+(m.last?'data '+m.last+' পর্যন্ত':'')];
  const top=m.picks.slice(0,Math.min(5,cfg.topN));
  if(top.length){L.push('কিনতে চাইলে (দাম নামলে ধাপে ধাপে):');top.forEach(p=>L.push('• '+p.code+' (এখন '+f2(p.m.P)+'): ≤'+f1(p.plan.b[0])+' → '+fq(p.plan.q[0])+' | ≤'+f1(p.plan.b[1])+' → '+fq(p.plan.q[1])+' | ≤'+f1(p.plan.b[2])+' → '+fq(p.plan.q[2])+' | বিক্রি T1 '+f1(p.plan.t1)+' (অর্ধেক), T2 '+f1(p.plan.t2)+', stop '+f1(p.plan.stop)))}
  else L.push('কেনার মতো share এই শর্তে মেলেনি।');
  if(m.hold.length){L.push('Holding:');m.hold.forEach(x=>{if(x.none)return;L.push('• '+x.code+' ('+fq(x.q)+' টি, avg '+f2(x.avg)+', এখন '+f2(x.P)+'): '+x.txt)})}
  const text=L.join('\n');LSS(PK,{at:Date.now(),for:nw,items:top.map(p=>p.code),text});msg='';tab='plan';draw();
  banner('📅 আগামী দিনের plan তৈরি',text)}
let busy=0;
function sched(){
  if(!cfg.on||busy)return;const d=dhaka();if(!d||!isTradeDay(d.wd))return;
  const fired=LSG(FK)||{};if(fired.day!==d.key){for(const k in fired)delete fired[k];fired.day=d.key}
  const tBuy=hm(cfg.open)+(+cfg.delay||0),tCl=hm(cfg.close),tPl=hm(cfg.plan);
  if(!fired.buy&&d.min>=tBuy&&d.min<tCl){fired.buy=1;LSS(FK,fired);busy=1;runBuy().finally(()=>{busy=0});return}
  if(!fired.plan&&d.min>=tPl&&d.min<tPl+360){fired.plan=1;LSS(FK,fired);busy=1;runPlan().finally(()=>{busy=0})}}
if(typeof document!=='undefined'){
  setInterval(tick,1300);setInterval(sched,20000);setTimeout(sched,6000);
  window.addEventListener('ltdata',()=>{msig=''});
  document.addEventListener('click',function ask(){try{if(window.Notification&&Notification.permission==='default')Notification.requestPermission()}catch(e){}document.removeEventListener('click',ask)},true)}
window.__buyplan={html,textBuy,build,getModel,runBuy,runPlan,cfg:()=>cfg,planFor,metrics,backtest};
}catch(err){console.error('buyplan init',err)}})();
