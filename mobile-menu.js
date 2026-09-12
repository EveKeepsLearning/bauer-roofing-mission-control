'use strict';
(function(){
 function install(){
  if(document.getElementById('broMobileHeader'))return;
  const nav=document.getElementById('nav')||document.querySelector('.bro-compact-nav-inner');if(!nav)return;
  const source=nav.closest('header')||nav.closest('.bro-compact-nav');
  const appView=nav.closest('#appView');
  const toolbar=source?.querySelector('.head-row .toolbar');
  const navAnchor=document.createComment('BRO navigation home');nav.before(navAnchor);
  const toolbarAnchor=document.createComment('BRO account actions home');if(toolbar)toolbar.before(toolbarAnchor);
  const bar=document.createElement('div');bar.id='broMobileHeader';
  bar.innerHTML='<a class="bro-mobile-home" href="index.html?view=today" aria-label="BRO Today">BRO</a><span id="broMobilePage">Bauer Roofing</span><button id="broMobileToggle" type="button" aria-label="Open navigation menu" aria-controls="broMobilePanel" aria-expanded="false"><svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>';
  const panel=document.createElement('div');panel.id='broMobilePanel';panel.hidden=true;panel.setAttribute('aria-label','BRO navigation and account actions');
  document.body.prepend(bar);bar.after(panel);
  const toggle=bar.querySelector('button'),label=bar.querySelector('#broMobilePage'),mq=matchMedia('(max-width:780px)');let open=false;
  function setOpen(value,focusBack=false){open=!!value&&mq.matches&&!(appView?.classList.contains('hidden'));panel.hidden=!open;toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'Close navigation menu':'Open navigation menu');if(open){const first=[...nav.querySelectorAll('a,button')].find(el=>!el.hidden&&!el.classList.contains('hidden'));first?.focus();}else if(focusBack)toggle.focus();}
  function updateLabel(){const active=nav.querySelector('.active');label.textContent=active?.textContent.trim()||document.querySelector('main h1,h1')?.textContent.trim()||'Bauer Roofing';}
  function layout(){setOpen(false);if(mq.matches){panel.append(nav);if(toolbar)panel.append(toolbar);source?.classList.add('bro-mobile-source-hidden');}else{navAnchor.after(nav);if(toolbar)toolbarAnchor.after(toolbar);source?.classList.remove('bro-mobile-source-hidden');}updateLabel();}
  toggle.onclick=()=>setOpen(!open,true);
  panel.addEventListener('click',event=>{if(event.target.closest('a,button')){setOpen(false);setTimeout(updateLabel,0);}});
  document.addEventListener('click',event=>{if(open&&!panel.contains(event.target)&&!bar.contains(event.target))setOpen(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&open){event.preventDefault();setOpen(false,true);}});
  new MutationObserver(updateLabel).observe(nav,{attributes:true,subtree:true,attributeFilter:['class']});
  function syncVisibility(){const hidden=!!appView?.classList.contains('hidden');bar.hidden=hidden;if(hidden)setOpen(false);}
  if(appView)new MutationObserver(syncVisibility).observe(appView,{attributes:true,attributeFilter:['class']});
  mq.addEventListener('change',layout);layout();syncVisibility();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
