'use strict';
(function(){
  const order=['Today','Phone Message','Angi Queue','Contacts','Inquiries','Sales Pipeline','Open Jobs','Jobs','Calendar','Improvement Ideas','Playbook','Suggestions','Team Account Setup'];
  function arrange(){
    document.querySelectorAll('nav').forEach(nav=>{
      if(![...nav.children].some(el=>el.textContent.trim()==='Improvement Ideas')){const link=document.createElement('a');link.href='improvement-ideas.html?v=20260912-ideas1';link.textContent='Improvement Ideas';if(location.pathname.endsWith('/improvement-ideas.html'))link.classList.add('active');nav.appendChild(link);}const items=[...nav.children];
      for(const name of order){const item=items.find(el=>el.textContent.trim()===name);if(item)nav.appendChild(item);}
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',arrange,{once:true});else arrange();
})();
