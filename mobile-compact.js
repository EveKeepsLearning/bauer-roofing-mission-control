'use strict';
(function(){
  if(document.getElementById('broMobileCompactStyles')) return;
  const style=document.createElement('style');
  style.id='broMobileCompactStyles';
  style.textContent=`
@media (max-width:780px){
  /* Main BRO header: keep navigation available but stop it consuming the screen. */
  header{padding:5px 7px!important}
  header .head-row{min-height:0!important;gap:5px!important;align-items:center!important}
  header .brand{min-width:0}
  header .brand h1{font-size:15px!important;line-height:1.1!important;white-space:nowrap}
  header .brand .sub{display:none!important}
  header .toolbar{gap:3px!important;flex-wrap:nowrap!important;overflow-x:auto;max-width:58vw;scrollbar-width:none}
  header .toolbar::-webkit-scrollbar{display:none}
  header .toolbar .btn{font-size:10px!important;padding:4px 6px!important;margin:0 2px 0 0!important;white-space:nowrap}
  header .signed-in-email{display:none!important}
  header .nav,#nav{margin:3px -2px 0!important;padding:0 0 1px!important;display:flex!important;gap:2px!important;flex-wrap:nowrap!important;overflow-x:auto!important;scrollbar-width:none;-webkit-overflow-scrolling:touch}
  header .nav::-webkit-scrollbar,#nav::-webkit-scrollbar{display:none}
  header .nav button,#nav button,#nav a{flex:0 0 auto!important;padding:5px 7px!important;font-size:11px!important;line-height:1.1!important;white-space:nowrap!important}

  /* Main content starts much closer to the navigation. */
  .wrap{margin:7px auto!important;padding:0 8px!important}
  .card{padding:10px!important;margin-bottom:8px!important;border-radius:10px!important}
  .card h2{font-size:17px!important;margin-bottom:7px!important}
  .card h3{font-size:15px!important;margin-bottom:6px!important}
  .kpi-row{gap:6px!important;margin-bottom:8px!important}
  .kpi{padding:8px!important}
  .kpi .n{font-size:19px!important}
  .task{padding:8px 0!important}

  /* Shared navigation used by Contacts, Calendar, Sales and Open Jobs. */
  .bro-compact-nav{position:sticky!important;top:0!important}
  .bro-compact-nav-inner{width:100%!important;padding:2px 5px!important;gap:2px!important}
  .bro-compact-brand{display:none!important}
  .bro-compact-nav a{padding:5px 7px!important;font-size:11px!important;border-radius:6px!important}

  /* Standalone page headers. */
  .jobs-shell,.sales-shell,.contact-shell{width:96vw!important;margin:7px auto 28px!important}
  .jobs-head,.sales-head,.contact-top{display:flex!important;align-items:center!important;gap:7px!important;margin-bottom:7px!important}
  .jobs-head>div:first-child,.sales-head>div:first-child,.contact-top>div:first-child{min-width:0;flex:1}
  .jobs-head h1,.sales-head h1,.contact-top h1{font-size:18px!important;line-height:1.12!important;margin:0!important}
  .jobs-head .sub,.sales-head .sub,.contact-top .sub{display:none!important}
  .jobs-head .btn,.sales-head .btn,.contact-top .btn{font-size:10px!important;padding:5px 7px!important;margin:0!important;white-space:nowrap}
  .contact-top>div:last-child{display:flex!important;gap:4px!important;flex-wrap:nowrap!important}

  /* Open Jobs controls. */
  .view-tabs{margin:7px 0!important;gap:4px!important;flex-wrap:nowrap!important;overflow-x:auto!important;scrollbar-width:none}
  .view-tabs::-webkit-scrollbar{display:none}
  .view-tab{flex:0 0 auto!important;padding:6px 8px!important;font-size:11px!important}
  .filters{flex:0 0 auto!important;gap:4px!important;flex-wrap:nowrap!important}
  .filters input,.filters select{font-size:11px!important;padding:6px!important;min-width:120px!important;margin:0!important}
  .top-scroll{height:10px!important;margin-bottom:3px!important}
  .stage-col{min-height:360px!important;padding:6px!important}
  .stage-head{padding:5px 3px 7px!important;font-size:13px!important}
  .job-card{padding:8px!important;margin-bottom:6px!important}

  /* Sales board controls and cards. */
  .sales-tools{margin:7px 0!important;gap:4px!important;flex-wrap:nowrap!important;overflow-x:auto!important;scrollbar-width:none}
  .sales-tools::-webkit-scrollbar{display:none}
  .sales-tools input{min-width:190px!important;padding:7px!important;margin:0!important;font-size:12px!important}
  .sales-tools label,.sales-tools .btn{flex:0 0 auto!important;font-size:10px!important}
  .pipeline{gap:6px!important}
  .pipe-col{min-height:400px!important;padding:6px!important}
  .pipe-head{padding:4px 3px 7px!important;font-size:13px!important}
  .sales-card{padding:8px!important;margin-bottom:6px!important}

  /* Contacts: search should be immediately visible without a giant intro area. */
  .contact-shell .search-card,.contact-shell .detail-card{padding:10px!important;border-radius:10px!important}
  .contact-shell .search-row{display:flex!important;gap:5px!important;align-items:center!important}
  .contact-shell .search-row input{font-size:15px!important;padding:9px!important;margin:0!important;min-width:0}
  .contact-shell .search-row .btn{flex:0 0 auto!important;padding:8px!important;font-size:11px!important;margin:0!important}
  .contact-shell .quick-find{margin-top:10px!important;padding-top:10px!important}
  .contact-shell .quick-grid{gap:6px!important}
  .contact-shell .detail-head h2{font-size:21px!important}
  .empty-state{padding:20px 10px!important}

  /* Dialogs should use nearly all of the phone width. */
  dialog{max-width:98vw!important;padding:0!important}
  dialog .card{width:94vw!important;min-width:0!important;max-height:88vh!important;overflow:auto!important;margin:0!important}
}
`;
  document.head.appendChild(style);
})();
