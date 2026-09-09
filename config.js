window.BAUER_CONFIG = {
  APP_VERSION: '20260909-10',
  APP_URL: 'https://evekeepslearning.github.io/bauer-roofing-mission-control/',
  SUPABASE_URL: 'https://eufimdrdimpkzowlupre.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_F-nEDaSaUQPwy2rTKy71LA_H4gxArBt',
  GOOGLE_MAPS_API_KEY: 'AIzaSyB4xjCbhk3FOUAPVl-80_hGH4qqXKYicVQ'
};

(function(){
  const VERSION='20260909-10';
  const NAV_ITEMS=[
    ['today','Today','index.html?view=today'],
    ['phone','Phone Message','index.html?view=phone'],
    ['angi','Angi Queue','index.html?view=angi'],
    ['contacts','Contacts',`contacts.html?v=${VERSION}`],
    ['calendar','Calendar',`calendar.html?v=${VERSION}`],
    ['jobs','Open Jobs',`jobs.html?v=${VERSION}`],
    ['playbook','Playbook','index.html?view=playbook'],
    ['suggestions','Suggestions','index.html?view=suggestions']
  ];

  function currentSection(){
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    if(path==='jobs.html')return'jobs';
    if(path==='contacts.html')return'contacts';
    if(path==='inquiry.html')return'contacts';
    if(path==='calendar.html')return'calendar';
    return new URLSearchParams(location.search).get('view')||'today';
  }

  function installSharedStyles(){
    if(document.getElementById('bauerSharedNavStyles'))return;
    const style=document.createElement('style');
    style.id='bauerSharedNavStyles';
    style.textContent=`
      .bro-compact-nav{position:sticky;top:0;z-index:1000;background:#fff;border-bottom:1px solid #dfe5ec;box-shadow:0 1px 5px rgba(31,48,72,.06)}
      .bro-compact-nav-inner{width:min(1550px,96vw);margin:0 auto;display:flex;align-items:center;gap:4px;overflow-x:auto;padding:5px 0;scrollbar-width:thin}
      .bro-compact-brand{font-weight:800;font-size:13px;white-space:nowrap;margin-right:8px;color:#25364d}
      .bro-compact-nav a{white-space:nowrap;text-decoration:none;color:#425166;padding:6px 9px;border-radius:7px;font-size:13px;font-weight:600}
      .bro-compact-nav a:hover{background:#f1f5f9}
      .bro-compact-nav a.active{background:#e7f1ff;color:#145fc2}
      body.bro-main-compact #appView>header .head-row{padding-top:4px!important;padding-bottom:4px!important;min-height:0!important}
      body.bro-main-compact #appView>header .brand h1{font-size:18px!important;margin:0!important}
      body.bro-main-compact #appView>header .brand .sub{display:none!important}
      body.bro-main-compact #appView>header .toolbar{gap:4px!important}
      body.bro-main-compact #appView>header .toolbar .btn{padding-top:5px!important;padding-bottom:5px!important}
      body.bro-main-compact #appView>header #nav{padding-top:3px!important;padding-bottom:3px!important}
      body.bro-main-compact #appView>header #nav button,body.bro-main-compact #appView>header #nav a{padding:6px 9px!important;font-size:13px!important}
      .bro-sticky-save-bar{position:sticky!important;bottom:0!important;z-index:900!important;background:rgba(255,255,255,.97)!important;border-top:1px solid #dfe5ec!important;box-shadow:0 -3px 10px rgba(31,48,72,.08)!important;padding:10px!important;margin-left:-10px!important;margin-right:-10px!important}
      dialog .bro-sticky-save-bar{bottom:0!important}
    `;
    document.head.appendChild(style);
  }

  function addStandaloneNav(){
    const path=(location.pathname.split('/').pop()||'index.html').toLowerCase();
    if(path==='index.html'||path==='')return;
    if(document.querySelector('.bro-compact-nav'))return;
    const active=currentSection();
    const nav=document.createElement('nav');
    nav.className='bro-compact-nav';
    nav.innerHTML=`<div class="bro-compact-nav-inner"><span class="bro-compact-brand">Bauer Roofing Operations</span>${NAV_ITEMS.map(([key,label,href])=>`<a href="${href}" class="${key===active?'active':''}">${label}</a>`).join('')}</div>`;
    document.body.insertBefore(nav,document.body.firstChild);
  }

  function wireMainNavigation(){
    const nav=document.getElementById('nav');
    if(!nav)return;
    const contactsButton=nav.querySelector('button[data-view="leads"]');
    if(contactsButton)contactsButton.onclick=e=>{e.preventDefault();location.href=`contacts.html?v=${VERSION}`;};
    const jobsButton=nav.querySelector('button[data-view="jobs"]');
    if(jobsButton)jobsButton.onclick=e=>{e.preventDefault();location.href=`jobs.html?v=${VERSION}`;};

    const syncCompact=()=>{
      const active=nav.querySelector('button.active[data-view]');
      const isToday=(active?.dataset.view||'today')==='today';
      document.body.classList.toggle('bro-main-compact',!isToday);
    };
    syncCompact();
    new MutationObserver(syncCompact).observe(nav,{attributes:true,subtree:true,attributeFilter:['class']});

    const requested=new URLSearchParams(location.search).get('view');
    if(requested&&requested!=='today')setTimeout(()=>{
      const target=nav.querySelector(`button[data-view="${CSS.escape(requested)}"]`);
      if(target)target.click();
    },0);
  }

  function makeSaveBarsSticky(root=document){
    root.querySelectorAll('button').forEach(button=>{
      if(button.textContent.trim().toLowerCase()!=='save changes')return;
      const bar=button.closest('.toolbar,.dialog-actions,.toolbar2')||button.parentElement;
      if(bar)bar.classList.add('bro-sticky-save-bar');
    });
  }

  function loadJobsStageFix(){
    const path=(location.pathname.split('/').pop()||'').toLowerCase();
    if(path!=='jobs.html'||document.getElementById('jobsStageFixScript'))return;
    const s=document.createElement('script');
    s.id='jobsStageFixScript';
    s.src=`jobs-stage-fix.js?v=${VERSION}`;
    s.defer=false;
    document.body.appendChild(s);
  }

  document.addEventListener('DOMContentLoaded',()=>{
    installSharedStyles();
    addStandaloneNav();
    wireMainNavigation();
    makeSaveBarsSticky();
    new MutationObserver(()=>makeSaveBarsSticky()).observe(document.body,{childList:true,subtree:true});
    loadJobsStageFix();
  });
})();
