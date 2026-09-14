'use strict';
(function(){
  const style=document.createElement('style');
  style.id='broSolidSalesTypeColors';
  style.textContent=`
    .sales-card.bro-repair{background:#3f51b5!important;color:#fff!important;border:0!important;text-shadow:0 1px 1px rgba(0,0,0,.28)}
    .sales-card.bro-reroof{background:#039be5!important;color:#fff!important;border:0!important;text-shadow:0 1px 1px rgba(0,0,0,.28)}
    .sales-card.bro-other{background:#526078!important;color:#fff!important;border:0!important;text-shadow:0 1px 1px rgba(0,0,0,.28)}
    .sales-card.bro-repair:hover,.sales-card.bro-reroof:hover,.sales-card.bro-other:hover{border:0!important;filter:brightness(.97);box-shadow:0 3px 9px rgba(24,42,66,.38)}
    .sales-card.bro-repair .meta,.sales-card.bro-reroof .meta,.sales-card.bro-other .meta,
    .sales-card.bro-repair .important,.sales-card.bro-reroof .important,.sales-card.bro-other .important,
    .sales-card.bro-repair .card-title-row span:first-child,.sales-card.bro-reroof .card-title-row span:first-child,.sales-card.bro-other .card-title-row span:first-child{color:#fff!important}
    .sales-card .next-action{background:#fff!important;color:#172b44!important;text-shadow:none}
    .sales-card .time-badge{background:#fff!important;color:#172b44!important;text-shadow:none}
    .sales-card.card-overdue{box-shadow:0 0 0 3px #efb742!important}
    .bro-sales-type-legend{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 12px;font-size:13px}
    .bro-sales-type-legend span{padding:7px 10px;border-radius:7px;font-weight:700;color:#fff}
  `;
  document.head.append(style);
  const legend=document.createElement('div');
  legend.className='bro-sales-type-legend';
  legend.setAttribute('aria-label','Inquiry type colors');
  legend.innerHTML='<span style="background:#3f51b5">Repairs</span><span style="background:#039be5">Reroofs / asphalt / metal</span><span style="background:#526078">Other / needs type review</span>';
  document.querySelector('.sales-tools')?.after(legend);
})();
