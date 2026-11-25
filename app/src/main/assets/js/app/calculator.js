/* Floating calculator.
   - Opened from the + menu (next to Settings). Small movable window; it never covers the whole screen.
   - While it is open, tapping any number on a card puts that number into the calculator.
     A calculated number (Total amount, T.AVG, F.Avg, Gain ...) carries its formula in data-calc="10×4",
     so the calculator shows "10×4" and the result 40, i.e. how the total was made.
   - No eval(): the expression is parsed by a small recursive-descent parser. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const PK='ds_calc_pos';
let expr='',done=false,box=null,eEl=null,rEl=null,pos=null;

/* ---------- expression parser: + - × ÷ ( ) %  (100+10% = 110, like a phone calculator) ---------- */
function evalExpr(src){
  let s=String(src).replace(/×|\*/g,'*').replace(/÷|\//g,'/').replace(/[−–]/g,'-').replace(/\s+/g,'');
  while(/[+\-*/(]$/.test(s))s=s.slice(0,-1);
  if(!s)return null;
  let open=(s.match(/\(/g)||[]).length-(s.match(/\)/g)||[]).length;while(open-->0)s+=')';
  let i=0;
  const fail=()=>{throw new Error('x')};
  function factor(){
    let c=s[i],r;
    if(c==='-'){i++;const f=factor();return{v:-f.v,p:false}}
    if(c==='+'){i++;return factor()}
    if(c==='('){i++;const e=expr();if(s[i]!==')')fail();i++;r={v:e.v,p:false}}
    else{const m=/^(\d+\.?\d*|\.\d+)/.exec(s.slice(i));if(!m)fail();i+=m[0].length;r={v:parseFloat(m[0]),p:false}}
    while(s[i]==='%'){i++;r={v:r.v/100,p:true}}
    return r}
  function term(){
    let a=factor();
    while(s[i]==='*'||s[i]==='/'){const op=s[i++],b=factor();a={v:op==='*'?a.v*b.v:a.v/b.v,p:false}}
    return a}
  function expr(){
    let a=term();
    while(s[i]==='+'||s[i]==='-'){const op=s[i++],b=term(),rv=b.p?a.v*b.v:b.v;a={v:op==='+'?a.v+rv:a.v-rv,p:false}}
    return a}
  try{const r=expr();if(i!==s.length)fail();return isFinite(r.v)?r.v:NaN}catch(e){return NaN}
}
const fmtRes=v=>{if(v===null)return '0';if(!isFinite(v))return 'Error';let r=Number(v.toPrecision(12));if(Math.abs(r)<1e-12)r=0;return r.toLocaleString('en-US',{maximumFractionDigits:8})};
const plainNum=v=>String(Number(v.toPrecision(12)));
/* spaces around binary operators so the formula is easy to read: 10 × 4 */
const pretty=s=>s.replace(/([+−×÷])/g,(m,o,off)=>{const p=s[off-1];return(off>0&&p!=='('&&!/[+−×÷]/.test(p))?' '+o+' ':o});

/* ---------- state helpers ---------- */
const isOp=c=>c==='+'||c==='−'||c==='×'||c==='÷';
const endsNum=()=>/[\d.]$/.test(expr);
function draw(){
  if(!box)return;
  const v=evalExpr(expr),hasOp=/[+−×÷%()]/.test(expr.replace(/^−/,''));
  eEl.textContent=expr?pretty(expr)+(done?' =':''):'';
  const bad=expr&&Number.isNaN(v);
  rEl.classList.toggle('err',!!bad);
  rEl.textContent=bad?(/[+−×÷]$/.test(expr)?'…':'Error'):(expr?fmtRes(v):'0');
  if(!hasOp&&!done&&expr&&!bad)eEl.textContent='';
  eEl.scrollTop=eEl.scrollHeight;
}
function press(k){
  if(k==='C'){expr='';done=false;return draw()}
  if(k==='⌫'){if(done){done=false;return draw()}expr=expr.slice(0,-1);return draw()}
  if(k==='='){if(expr&&!Number.isNaN(evalExpr(expr)))done=true;return draw()}
  if(isOp(k)){
    if(done){const v=evalExpr(expr);expr=Number.isNaN(v)?'':plainNum(v).replace('-','−');done=false}
    if(!expr){if(k==='−')expr='−';return draw()}
    const last=expr.slice(-1);
    if(last==='('){if(k==='−')expr+=k;return draw()}
    if(isOp(last)){if(expr==='−'||/\(−$/.test(expr))return draw();expr=expr.slice(0,-1)+k}else expr+=k;
    return draw()}
  if(k==='('){if(done){expr='';done=false}if(endsNum()||/[)%]$/.test(expr))expr+='×';expr+='(';return draw()}
  if(k===')'){const o=(expr.match(/\(/g)||[]).length,c=(expr.match(/\)/g)||[]).length;if(o>c&&!isOp(expr.slice(-1))&&expr.slice(-1)!=='(')expr+=')';return draw()}
  if(k==='%'){if(done){done=false}if(endsNum()||expr.slice(-1)===')')expr+='%';return draw()}
  /* digit or dot */
  if(done){expr='';done=false}
  if(/[)%]$/.test(expr))expr+='×';
  if(k==='.'){const last=expr.split(/[+−×÷()%]/).pop();if(last.includes('.'))return;if(!last)expr+='0'}
  if(k==='0'||/\d/.test(k)){const last=expr.split(/[+−×÷()%]/).pop();if(last==='0'&&k!=='.')expr=expr.slice(0,-1)}
  expr+=k;draw();
}

/* ---------- put a value from a card into the calculator ---------- */
function insert(text){
  /* text: a plain number like "1,014.04" / "-2.00", or a formula like "200×5.0702" */
  let t=String(text).replace(/,/g,'').replace(/[-–]/g,'−').replace(/\*/g,'×').replace(/\//g,'÷').replace(/\s+/g,'');
  if(!t)return;
  const isF=/[+−×÷()%]/.test(t.replace(/^−/,''));
  if(done){expr='';done=false}
  if(endsNum()){expr=expr.replace(/[\d.]+$/,'');if(/(^|\()−$/.test(expr))expr=expr.slice(0,-1)}
  else if(/[)%]$/.test(expr)){toast('Choose + − × ÷ first');return}
  const bare=!expr||expr.slice(-1)==='(';
  if(bare)expr+=t;
  else expr+=(isF||t[0]==='−')?'('+t+')':t;
  draw();
}
function toast(m){try{gnToast(m)}catch(e){}}

/* Find the number the finger touched. Returns {text, el} or null. */
const NUMRE=/[-−+]?\d[\d,]*(?:\.\d+)?|[-−+]?\.\d+/g;
const ONLYNUM=/^[-−+]?\d[\d,]*(?:\.\d+)?\s*%?$/;
function pick(e){
  const t=e.target;if(!t||!t.closest)return null;
  if(t.closest('#dcalc,#docBottom,#docAddMenu,button,input,textarea,select,a,label,[contenteditable="true"]'))return null;
  if(!t.closest('#list,#res,#docViewer,.gt,table,#homeBox,#ntS'))return null;
  let el=t.closest('[data-calc]');
  if(el)return{text:el.dataset.calc,el};
  const it=t.closest('.it');
  if(it){const nus=it.querySelectorAll('.nu');if(nus.length===1){const n=nus[0];return n.dataset.calc?{text:n.dataset.calc,el:n}:fromText(n)}}
  /* exact point in the text */
  try{
    const r=document.caretRangeFromPoint&&document.caretRangeFromPoint(e.clientX,e.clientY);
    if(r&&r.startContainer.nodeType===3&&t.contains(r.startContainer)){
      const tx=r.startContainer.nodeValue,off=r.startOffset;let best=null,bd=1e9,m;NUMRE.lastIndex=0;
      while((m=NUMRE.exec(tx))){const a=m.index,b=a+m[0].length,d=off<a?a-off:off>b?off-b:0;if(d<bd){bd=d;best={m:m[0],a,b}}}
      if(best&&bd<=3){
        const rg=document.createRange();rg.setStart(r.startContainer,best.a);rg.setEnd(r.startContainer,best.b);
        const rc=rg.getBoundingClientRect(),pad=14;
        if(e.clientX>=rc.left-pad&&e.clientX<=rc.right+pad&&e.clientY>=rc.top-pad&&e.clientY<=rc.bottom+pad)return{text:best.m,el:r.startContainer.parentElement||t}}}
  }catch(er){}
  /* a small element holding exactly one number (label + number) */
  const c=t.closest('span,b,div,td,th,i');
  if(c&&c.textContent.length<=40&&!c.querySelector('.item')){const f=fromText(c);if(f)return f}
  return null;
}
function fromText(el){
  const s=(el.textContent||'').trim(),m=s.match(NUMRE);
  if(!m||m.length!==1)return null;return{text:m[0],el};
}
function flash(el){try{el.classList.add('calc-hit');setTimeout(()=>el.classList.remove('calc-hit'),380)}catch(e){}}

/* While the calculator is open, taps on numbers go to it (capture phase: before the card's own tap handlers). */
document.addEventListener('click',e=>{
  if(!box||!box.classList.contains('on'))return;
  const p=pick(e);if(!p)return;
  e.preventDefault();e.stopImmediatePropagation();
  insert(p.text);flash(p.el);try{navigator.vibrate&&navigator.vibrate(8)}catch(_){}
},true);
/* no long-press "select card" while using the calculator */
document.addEventListener('pointerdown',e=>{
  if(!box||!box.classList.contains('on'))return;
  const t=e.target;if(t&&t.closest&&t.closest('#list .item')&&!t.closest('button,input,select,textarea'))e.stopPropagation();
},true);

/* ---------- window ---------- */
const KEYS=[['7','8','9','÷','C'],['4','5','6','×','⌫'],['1','2','3','−','('],['0','.','%','+',')']];
function build(){
  box=document.createElement('div');box.id='dcalc';box.setAttribute('role','dialog');box.setAttribute('aria-label','Calculator');
  let k='';KEYS.forEach(r=>r.forEach(x=>{const c=/[÷×−+]/.test(x)?'op':(x==='C'||x==='⌫')?'fn':'';k+=`<button type="button" data-k="${x}"${c?` class="${c}"`:''}>${x}</button>`}));
  k+='<button type="button" class="eq" data-k="=">=</button>';
  box.innerHTML='<div class="ch"><span>🧮 Calculator</span><button type="button" data-w="min" aria-label="Minimize">▾</button><button type="button" data-w="x" aria-label="Close">✕</button></div>'
   +'<div class="cd"><div class="ce"></div><div class="cr">0</div></div><div class="ck">'+k+'</div><div class="ch2">Tap any number on a card to use it.<br>Drag the top bar to move.</div>';
  document.body.appendChild(box);
  eEl=box.querySelector('.ce');rEl=box.querySelector('.cr');
  box.querySelector('.ck').addEventListener('click',e=>{const b=e.target.closest('button[data-k]');if(b)press(b.dataset.k)});
  box.querySelector('.ch').addEventListener('click',e=>{const b=e.target.closest('button[data-w]');if(!b)return;if(b.dataset.w==='x')close();else{box.classList.toggle('min');b.textContent=box.classList.contains('min')?'▴':'▾';save();clamp()}});
  /* drag by the top bar */
  const ch=box.querySelector('.ch');let sx=0,sy=0,ox=0,oy=0,drag=false;
  ch.addEventListener('pointerdown',e=>{if(e.target.closest('button'))return;drag=true;sx=e.clientX;sy=e.clientY;ox=pos.x;oy=pos.y;try{ch.setPointerCapture(e.pointerId)}catch(_){}ch.style.cursor='grabbing'});
  ch.addEventListener('pointermove',e=>{if(!drag)return;pos.x=ox+e.clientX-sx;pos.y=oy+e.clientY-sy;clamp()});
  const end=()=>{if(!drag)return;drag=false;ch.style.cursor='';save()};
  ch.addEventListener('pointerup',end);ch.addEventListener('pointercancel',end);
  window.addEventListener('resize',()=>{if(box.classList.contains('on'))clamp()});
}
function clamp(){
  if(!box||!pos)return;
  const w=box.offsetWidth||252,h=box.offsetHeight||300,vw=window.innerWidth,vh=window.innerHeight;
  pos.x=Math.min(Math.max(4,pos.x),Math.max(4,vw-w-4));
  pos.y=Math.min(Math.max(4,pos.y),Math.max(4,vh-Math.min(h,vh)-4));
  box.style.transform='translate('+Math.round(pos.x)+'px,'+Math.round(pos.y)+'px)';
}
function save(){try{localStorage.setItem(PK,JSON.stringify({x:pos.x,y:pos.y,m:box.classList.contains('min')?1:0}))}catch(e){}}
function open(){
  if(!box)build();
  if(!pos){let s=null;try{s=JSON.parse(localStorage.getItem(PK)||'null')}catch(e){}
    pos={x:(s&&isFinite(s.x))?s.x:window.innerWidth-260,y:(s&&isFinite(s.y))?s.y:Math.round(window.innerHeight*.22)};
    if(s&&s.m){box.classList.add('min');box.querySelector('[data-w="min"]').textContent='▴'}}
  box.classList.add('on');document.body.classList.add('calc-on');draw();clamp();
}
function close(){if(!box)return;box.classList.remove('on');document.body.classList.remove('calc-on')}
window.__calcOpen=open;window.__calcClose=close;
window.__calcIsOpen=()=>!!box&&box.classList.contains('on');
window.__calcToggle=()=>{window.__calcIsOpen()?close():open()};
window.__calcInsert=insert;window.__calcEval=evalExpr;
})();
