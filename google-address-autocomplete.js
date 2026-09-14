'use strict';
(function(){
  if(window.__broGoogleAddressAutocompleteLoaded)return;
  window.__broGoogleAddressAutocompleteLoaded=true;

  const cfg=window.BAUER_CONFIG||{};
  const bindings=[
    ['address','city','state','zip'],
    ['newContactStreet','newContactCity','newContactState','newContactZip'],
    ['editContactStreet','editContactCity','editContactState','editContactZip'],
    ['inquiryAddress','inquiryCity','inquiryState','inquiryZip'],
    ['ciStreet','ciCity','ciState','ciZip'],
    ['ciMailStreet','ciMailCity','ciMailState','ciMailZip']
  ];

  function component(place,type,short=false){
    const c=(place?.address_components||[]).find(x=>x.types?.includes(type));
    return c?(short?c.short_name:c.long_name):'';
  }
  function value(id,v){const el=document.getElementById(id);if(el&&v)el.value=v;}
  function fill(place,[streetId,cityId,stateId,zipId]){
    const number=component(place,'street_number');
    const route=component(place,'route');
    const street=[number,route].filter(Boolean).join(' ').trim();
    const city=component(place,'locality')||component(place,'postal_town')||component(place,'sublocality_level_1')||component(place,'administrative_area_level_2');
    const state=component(place,'administrative_area_level_1',true);
    const zip=component(place,'postal_code');
    value(streetId,street||place?.name||'');value(cityId,city);value(stateId,state);value(zipId,zip);
    [streetId,cityId,stateId,zipId].forEach(id=>document.getElementById(id)?.dispatchEvent(new Event('change',{bubbles:true})));
  }
  function attach(binding){
    const input=document.getElementById(binding[0]);
    if(!input||input.dataset.broPlacesReady||!window.google?.maps?.places?.Autocomplete)return;
    input.dataset.broPlacesReady='1';
    input.setAttribute('autocomplete','off');
    input.title='Start typing an address and choose a Google suggestion, or type it manually.';
    const ac=new google.maps.places.Autocomplete(input,{types:['address'],componentRestrictions:{country:'us'},fields:['address_components','name','formatted_address']});
    ac.addListener('place_changed',()=>{const place=ac.getPlace();if(place?.address_components?.length)fill(place,binding);});
  }
  function attachAll(){bindings.forEach(attach);}
  function ready(){attachAll();new MutationObserver(()=>attachAll()).observe(document.body,{childList:true,subtree:true});window.BROAddressAutocomplete={attachAll};}
  function load(){
    const key=String(cfg.GOOGLE_MAPS_API_KEY||'').trim();
    if(!key)return;
    if(window.google?.maps?.places?.Autocomplete){ready();return;}
    if(document.getElementById('broGoogleMapsPlacesScript'))return;
    window.__broGoogleMapsPlacesReady=ready;
    const s=document.createElement('script');s.id='broGoogleMapsPlacesScript';s.async=true;s.defer=true;
    s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&callback=__broGoogleMapsPlacesReady&loading=async`;
    s.onerror=()=>{console.warn('BRO address autocomplete is unavailable. Address fields remain usable for manual entry.');};
    document.head.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
