(function(){
  'use strict';
  const p=new URLSearchParams(location.search);
  const type=p.get('type');
  const id=p.get('id');
  if(type!=='inquiry'||!id)return;

  async function activate(){
    const button=document.getElementById('activateMarketSharpInquiryBtn');
    if(!confirm('Make this preserved MarketSharp inquiry fully active in Bauer Roofing Operations?\n\nIts preserved MarketSharp record will remain intact and linked.'))return;
    if(button){button.disabled=true;button.textContent='Making Active…';}
    const {data,error}=await db.rpc('bauer_activate_marketsharp_inquiry',{p_marketsharp_lead_id:id});
    if(error){notice('Could not make this inquiry active in BRO: '+error.message,'error');if(button){button.disabled=false;button.textContent='Make Active in BRO';}return;}
    notice('This preserved MarketSharp inquiry is now fully active in Bauer Roofing Operations.','success');
    if(data?.lead_id){
      const bro=document.getElementById('broBtn');
      bro.style.display='inline-flex';
      bro.href=`inquiry.html?id=${encodeURIComponent(data.lead_id)}${data.contact_id?`&contact=${encodeURIComponent(data.contact_id)}`:''}`;
    }
    if(button){button.textContent='Active in BRO';button.disabled=true;}
  }

  function install(){
    const header=document.querySelector('.head > div:last-child');
    if(!header||document.getElementById('activateMarketSharpInquiryBtn'))return;
    const button=document.createElement('button');
    button.id='activateMarketSharpInquiryBtn';
    button.type='button';
    button.className='btn success';
    button.textContent='Make Active in BRO';
    button.onclick=activate;
    header.insertBefore(button,header.firstChild);
  }

  document.addEventListener('DOMContentLoaded',install);
})();