/* v37 Mini bars: a tiny 4-bar icon after each share name in  Table > Daily data (live table), Table > My portfolio and the Daily card on Cards.
   Bars = last 4 day-end closes (green = closed above the day before, red = below). Data: saved history if it has it, else the DSE day-end API
   (same source as DSE Fetch), cached per share for the day. One tap on the icon = fetch that share and open Chart + Projected on one page. */
(function(){
  const CK='ds_mb_v1',N=4,GAP=2;
  let cache={};try{cache=JSON.parse(localStorage.getItem(CK)||'{}')||{}}catch(e){}
  const day=()=>new Date(Date.now()+216e5).toISOString().slice(0,10); /* Dhaka date */
  const save=()=>{try{const k=Object.keys(cache);if(k.length>500)k.sort((a,b)=>cache[a].t<cache[b].t?-1:1).slice(0,k.length-400).forEach(x=>delete cache[x]);localStorage.setItem(CK,JSON.stringify(cache))}catch(e){}};
  const esc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  /* rows: [{d,c}] oldest -> newest, need N+1 to colour the first bar */
  function fromHist(code){try{const s=window.__hist&&window.__hist.series?window.__hist.series(code):[];
    const r=s.filter(x=>x.p>0).map(x=>({d:x.d,c:x.p}));return r.length>=N+1?r.slice(-(N+1)):null}catch(e){return null}}
  const get=code=>{const c=cache[code];if(c&&c.k===day()&&c.r&&c.r.length>=2)return c.r;return fromHist(code)||(c&&c.r&&c.r.length>=2?c.r:null)};
  function html(code){
    const r=get(code),H=r?r.slice(-(N+1)):[];
    if(H.length<2)return '<i class="mb0"></i><i class="mb0"></i><i class="mb0"></i><i class="mb0"></i>';
    const b=H.slice(-N),prev=H.length>N?H[0].c:null,cs=b.map(x=>x.c),mn=Math.min.apply(0,cs),mx=Math.max.apply(0,cs);
    return b.map((x,i)=>{const p=i?b[i-1].c:prev,cl=p==null?'':x.c>p?' u':x.c<p?' d':'',h=mx>mn?30+70*(x.c-mn)/(mx-mn):60;
      return '<i class="mbb'+cl+'" style="height:'+h.toFixed(0)+'%"></i>'}).join('')}
  const tip=code=>{const r=get(code);return code+(r?': '+r.slice(-N).map(x=>x.d.slice(5)+' '+x.c).join(' | '):'')+' - tap: Chart + Projected'};
  function paint(code){document.querySelectorAll('.mbx[data-c="'+(window.CSS&&CSS.escape?CSS.escape(code):code)+'"]').forEach(e=>{e.innerHTML=html(code);e.title=tip(code)})}
  /* fetch queue: 2 at a time, only for icons that are on screen */
  const Q=[],want=new Set();let run=0;
  function pump(){
    while(run<2&&Q.length){
      const code=Q.shift();want.delete(code);
      if(!window.__dseLast){continue}
      run++;
      window.__dseLast(code,N+1).then(r=>{if(r&&r.length){cache[code]={t:Date.now(),k:day(),r};save();paint(code)}}).catch(()=>{cache[code]=Object.assign(cache[code]||{},{t:Date.now(),k:day(),r:(cache[code]||{}).r||[]});})
        .then(()=>{run--;setTimeout(pump,150)})}}
  function need(code){const c=cache[code];if((c&&c.k===day())||want.has(code))return;if(fromHist(code))return;want.add(code);Q.push(code);pump()}
  let io=null;try{io=new IntersectionObserver(es=>{es.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);need(e.target.dataset.c)}})},{rootMargin:'120px'})}catch(e){}
  function mk(code){const s=document.createElement('span');s.className='mbx';s.dataset.c=code;s.setAttribute('role','button');s.innerHTML=html(code);s.title=tip(code);
    if(io)io.observe(s);else need(code);return s}
  const put=(td,el)=>{const f=td.querySelector('.fvb');if(f)td.insertBefore(el,f);else td.appendChild(el)}; /* bar first, then the favourite star */
  const okc=c=>c&&c.length<=20&&/^[A-Za-z0-9&().\-_]+$/.test(c);
  function scan(){
    /* 1) Table > Daily data (live table): cell under the "Code" header */
    const t=document.getElementById('ltTbl');
    if(t){const ths=[...t.querySelectorAll('thead th')],ci=ths.findIndex(h=>h.dataset.k==='code');
      if(ci>=0)t.querySelectorAll('tbody tr').forEach(tr=>{const td=tr.cells[ci];if(!td||td.querySelector('.mbx'))return;const c=((td.firstChild&&td.firstChild.nodeType===3?td.firstChild.textContent:td.textContent)).trim();if(okc(c))put(td,mk(c))})}
    /* 2) Table > My portfolio: first cell of every holding row */
    document.querySelectorAll('#gpBox tr.gprow[data-open]').forEach(tr=>{const td=tr.cells[0];if(!td||td.querySelector('.mbx'))return;const c=tr.dataset.open;if(okc(c))put(td,mk(c))});
    /* 3) Cards > Daily card: after the share name */
    document.querySelectorAll('#list .cpcard.dly .nm').forEach(n=>{if(n.querySelector('.mbx'))return;const c=(n.closest('.cpcard')||{dataset:{}}).dataset.lt;if(okc(c))n.appendChild(mk(c))});
  }
  let tm=0;const obs=new MutationObserver(()=>{clearTimeout(tm);tm=setTimeout(()=>{obs.disconnect();try{scan()}catch(e){console.error('minibars',e)}obs.takeRecords();obs.observe(document.body,{childList:true,subtree:true})},90)});
  obs.observe(document.body,{childList:true,subtree:true});setTimeout(()=>{try{scan()}catch(e){}},600);
  /* one tap: chart + projected of this share. Captured on document so the table row / card taps do not also fire. */
  document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.mbx');if(!b)return;
    e.stopPropagation();e.preventDefault();
    if(window.__shareGo)window.__shareGo(b.dataset.c);else try{gnToast('DSE Fetch ready na')}catch(x){}},true);
})();
