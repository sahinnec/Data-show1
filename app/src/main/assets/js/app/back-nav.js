/* Phone back button: go back one step at a time (popup -> page -> tab -> Show), never close the app at once.
   Java calls window.__appBack(). It returns true when it handled the press, false when nothing is left to close
   (then Java asks "press back again to exit"). Loaded last so it can wrap setTab. */
(function(){
'use strict';
const $=id=>document.getElementById(id);
const vis=el=>{try{return !!el&&getComputedStyle(el).display!=='none'}catch(e){return false}};
const click=el=>{try{el&&el.click();return true}catch(e){return false}};
const hide=el=>{try{el.style.setProperty('display','none','important');return true}catch(e){return false}};

/* ---------- tab history ---------- */
const stack=[];
let going=false;
const curT=()=>{try{return typeof curTab==='string'?curTab:'scrap'}catch(e){return 'scrap'}};
const fv=()=>document.body.classList.contains('fview');
const _st=window.setTab;
if(typeof _st==='function'){
  window.setTab=function(t){
    const prev={t:curT(),fv:fv()};
    const r=_st.apply(this,arguments);
    if(!going&&prev.t!==t){
      const top=stack[stack.length-1];
      if(!top||top.t!==prev.t)stack.push(prev);
      if(stack.length>30)stack.shift();
    }
    return r;
  };
}
function toTab(e){
  going=true;
  try{
    if(e.t==='files')window.__navHome=!e.fv; // restore Home view or file-list view
    window.setTab(e.t);
  }finally{going=false}
}

/* ---------- one back step ---------- */
function step(){
  // 1) small pop-ups and menus
  let el=$('pvTxD');if(vis(el))return hide(el);
  el=$('dsCrop');if(el){const b=el.querySelector('[data-a="back"]');if(b)return click(b)}
  el=$('scanCam');if(vis(el)){const b=el.querySelector('[data-c="x"]');if(b)return click(b)}
  el=$('ntFsX');if(vis(el))return click(el);
  el=$('pvSendMenu');if(vis(el))return hide(el);
  el=$('docAddMenu');if(vis(el)){try{closeAddMenu();return true}catch(e){return hide(el)}}

  // 2) full-screen pages (top-most first)
  el=$('ntS');if(vis(el))return click($('ntBack'));
  el=$('auS');if(vis(el))return click($('auB'));
  el=$('tlE');if(vis(el))return click($('tlD'));      // editor: keep the edits (Done)
  el=$('tlP');if(vis(el))return hide(el);              // signature pad: cancel
  el=$('stS');if(vis(el))return click($('stB'));
  el=$('tlS');if(vis(el))return click($('tlB'));
  el=$('prS');if(vis(el))return click($('prB'));
  el=$('docViewer');if(vis(el))return click($('docViewBack'));

  // 3) Customize panel, selection mode
  el=$('cust');if(vis(el)){try{cfSet(false);return true}catch(e){return hide(el)}}
  try{if(selMode){selMode=false;selSet.clear();selConf='';try{render()}catch(e){}try{selUI()}catch(e){}return true}}catch(e){}

  // 4) preview box
  el=$('pvBox');
  if(vis(el)){
    if(el.classList.contains('pvfs'))return click($('pvFs'));
    return click($('pvX'));
  }

  // 5) Files page: folder -> all files -> Home view
  if(curT()==='files'){
    try{if(typeof docFolder==='string'&&docFolder!=='all'){docFolder='all';renderLibrary();return true}}catch(e){}
    if(fv()){window.__navHome=true;going=true;try{window.setTab('files')}finally{going=false}return true}
  }

  // 6) previous tab
  if(stack.length){toTab(stack.pop());return true}

  // 7) not on the start tab: go to it (Show)
  if(curT()!=='scrap'){toTab({t:'scrap',fv:false});return true}

  return false; // at the start: Java asks to press back again
}

window.__appBack=function(){
  try{return !!step()}catch(e){return false}
};
})();
