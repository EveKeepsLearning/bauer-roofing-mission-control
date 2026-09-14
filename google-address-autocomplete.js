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

  let PlaceAutocompleteElement=null;

  function component(place,type,short=false){
    const c=(place?.addressComponents||[]).find(x=>x.types?.includes(type));
    return c?(short?c.shortText:c.longText)||'':'';
  }
  function fire(el){
    if(!el)return;
    el.dispatchEvent(new Event('input',{bubbles:true}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function value(id,v){
    const el=document.getElementById(id);
    if(!el||v==null)return;
    el.value=v;
    fire(el);
  }
  function addressParts(place){
    const number=component(place,'street_number');
    const route=component(place,'route');
    const street=[number,route].filter(Boolean).join(' ').trim();
    const city=component(place,'locality')||component(place,'postal_town')||component(place,'sublocality_level_1')||component(place,'administrative_area_level_2');
    const state=component(place,'administrative_area_level_1',true);
    let zip=component(place,'postal_code');
    const zipSuffix=component(place,'postal_code_suffix');
    if(zip&&zipSuffix)zip=`${zip}-${zipSuffix}`;
    return {street,city,state,zip};
  }
  function fill(place,[streetId,cityId,stateId,zipId],widget){
    const {street,city,state,zip}=addressParts(place);
    const streetValue=street||place?.formattedAddress||String(widget?.value||'').trim();
    value(streetId,streetValue);
    value(cityId,city);
    value(stateId,state);
    value(zipId,zip);
    if(widget&&streetValue)widget.value=streetValue;
  }
  function installStyles(){
    if(document.getElementById('broGooglePlacesNewStyles'))return;
    const s=document.createElement('style');
    s.id='broGooglePlacesNewStyles';
    s.textContent=`gmp-place-autocomplete.bro-address-autocomplete{display:block;width:100%;min-width:0}input.bro-address-storage{position:absolute!important;left:-10000px!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important}`;
    document.head.appendChild(s);
  }
  async function attach(binding){
    const input=document.getElementById(binding[0]);
    if(!input||input.dataset.broPlacesReady||!PlaceAutocompleteElement)return;
    input.dataset.broPlacesReady='1';
    input.classList.add('bro-address-storage');
    input.setAttribute('aria-hidden','true');
    input.tabIndex=-1;

    const widget=new PlaceAutocompleteElement({
      includedPrimaryTypes:['street_address'],
      includedRegionCodes:['US'],
      placeholder:input.placeholder||'Start typing an address…'
    });
    widget.className='bro-address-autocomplete';
    widget.dataset.broFor=input.id;
    widget.value=input.value||'';
    widget.description='Start typing the street address and choose a Google suggestion. You may also type an address manually.';
    input.insertAdjacentElement('afterend',widget);

    const syncManual=()=>{
      input.value=String(widget.value||'').trim();
      fire(input);
    };
    widget.addEventListener('input',syncManual);
    widget.addEventListener('change',syncManual);
    widget.addEventListener('blur',syncManual,true);
    widget.addEventListener('gmp-error',()=>console.warn('BRO Google address suggestions are unavailable. The address can still be typed manually.'));
    widget.addEventListener('gmp-select',async event=>{
      try{
        const prediction=event.placePrediction;
        if(!prediction)return syncManual();
        const place=prediction.toPlace();
        await place.fetchFields({fields:['addressComponents','formattedAddress']});
        fill(place,binding,widget);
      }catch(err){
        console.warn('BRO could not fill the selected Google address. Manual entry remains available.',err);
        syncManual();
      }
    });
  }
  function attachAll(){bindings.forEach(binding=>void attach(binding));}
  async function ready(){
    try{
      const lib=await google.maps.importLibrary('places');
      PlaceAutocompleteElement=lib.PlaceAutocompleteElement;
      if(!PlaceAutocompleteElement)throw new Error('PlaceAutocompleteElement is unavailable.');
      installStyles();
      attachAll();
      new MutationObserver(()=>attachAll()).observe(document.body,{childList:true,subtree:true});
      window.BROAddressAutocomplete={attachAll};
    }catch(err){
      console.warn('BRO address autocomplete is unavailable. Address fields remain usable for manual entry.',err);
    }
  }
  function load(){
    const key=String(cfg.GOOGLE_MAPS_API_KEY||'').trim();
    if(!key)return;
    if(window.google?.maps?.importLibrary){void ready();return;}
    if(document.getElementById('broGoogleMapsPlacesScript'))return;
    window.__broGoogleMapsPlacesReady=()=>void ready();
    const s=document.createElement('script');
    s.id='broGoogleMapsPlacesScript';
    s.async=true;
    s.defer=true;
    s.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__broGoogleMapsPlacesReady&v=weekly`;
    s.onerror=()=>console.warn('BRO address autocomplete is unavailable. Address fields remain usable for manual entry.');
    document.head.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',load,{once:true});else load();
})();
