'use strict';
(function(){
  if(document.getElementById('broJobTableStickyStyles'))return;
  const style=document.createElement('style');
  style.id='broJobTableStickyStyles';
  style.textContent=`
    .jobs-table.bulk-edit-table thead th{
      position:sticky!important;
      top:0!important;
      z-index:10!important;
      background:#eef3f8!important;
    }
    .jobs-table.bulk-edit-table thead th:first-child{
      left:0!important;
      z-index:14!important;
      min-width:92px!important;
      width:92px!important;
      box-shadow:3px 0 6px rgba(31,48,72,.12)!important;
    }
    .jobs-table.bulk-edit-table tbody td:first-child{
      position:sticky!important;
      left:0!important;
      z-index:6!important;
    }
  `;
  document.head.appendChild(style);
})();
