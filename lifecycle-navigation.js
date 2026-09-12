'use strict';
(function(){
  const order=['Today','Phone Message','Angi Queue','Contacts','Inquiries','Sales Pipeline','Open Jobs','Jobs','Calendar','Playbook','Suggestions','Team Account Setup'];
  function arrange(){
    document.querySelectorAll('nav').forEach(nav=>{
      const items=[...nav.children];
      for(const name of order){const item=items.find(el=>el.textContent.trim()===name);if(item)nav.appendChild(item);}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arrange,{once:true});else arrange();
})();
