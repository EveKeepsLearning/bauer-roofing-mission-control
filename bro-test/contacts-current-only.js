'use strict';
(function(){
  if(window.__broContactsCurrentOnlyLoaded)return;
  window.__broContactsCurrentOnlyLoaded=true;
  function stripPreservedHistory(){const detail=document.getElementById('contactDetail');if(!detail)return;detail.querySelectorAll('.history-section').forEach(section=>{const heading=section.querySelector('h3,h4')?.textContent||'';if(/preserved marketsharp|archived inquiries|archived jobs/i.test(heading))section.remove();});detail.querySelectorAll('.archive-badge').forEach(x=>x.remove());}
  function stripArchiveResults(){const results=document.getElementById('searchResults');if(!results)return;results.querySelectorAll('.result').forEach(row=>{if(row.querySelector('.archive-badge')||/preserved marketsharp history|older history/i.test(row.textContent||''))row.remove();});if(!results.querySelector('.result')&&!/no contacts matched/i.test(results.textContent||''))results.innerHTML='<div class="empty-state">No current BRO contacts matched that search.</div>';}
  function install(){if(typeof openBroContact==='function'){const original=openBroContact;openBroContact=async function(id){const result=await original(id);stripPreservedHistory();return result;};}if(typeof searchContacts==='function'){const originalSearch=searchContacts;searchContacts=async function(){const result=await originalSearch();stripArchiveResults();return result;};const searchBtn=document.getElementById('contactSearchBtn');if(searchBtn)searchBtn.onclick=searchContacts;}stripArchiveResults();stripPreservedHistory();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
