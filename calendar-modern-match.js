'use strict';
(function(){
  function norm(v){return String(v||'').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();}
  function digits(v){return String(v||'').replace(/\D/g,'');}
  function emails(v){return (String(v||'').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/g)||[]);}
  function phones(v){
    const text=String(v||'');
    const out=[];
    const matches=text.match(/(?:\+?1[\s.()-]*)?(?:\(?\d{3}\)?[\s.()-]*)\d{3}[\s.-]*\d{4}/g)||[];
    matches.forEach(x=>{const d=digits(x);if(d.length===10)out.push(d);else if(d.length===11&&d[0]==='1')out.push(d.slice(1));});
    return [...new Set(out)];
  }
  function streetFromText(v){
    const text=String(v||'');
    const m=text.match(/\b(\d+\s+[A-Za-z0-9.' -]+?\s(?:St|Street|Rd|Road|Ln|Lane|Dr|Drive|Ave|Avenue|Ct|Court|Cir|Circle|Way|Blvd|Boulevard|Pkwy|Parkway))\b/i);
    return m?m[1]:'';
  }
  function streetKey(v){
    return norm(v)
      .replace(/\bstreet\b/g,'st').replace(/\broad\b/g,'rd').replace(/\blane\b/g,'ln')
      .replace(/\bdrive\b/g,'dr').replace(/\bavenue\b/g,'ave').replace(/\bcourt\b/g,'ct')
      .replace(/\bcircle\b/g,'cir').replace(/\bboulevard\b/g,'blvd').replace(/\bparkway\b/g,'pkwy');
  }
  function eventPerson(event){
    const first=norm(event?.contact_first_name), last=norm(event?.contact_last_name);
    if(first||last)return `${first} ${last}`.trim();
    const loc=String(event?.location_raw||'');
    const m=loc.match(/^\s*([^,\n]+),\s*([^\d\n(]+?)(?=\s*(?:\(|\d|$))/);
    if(m)return norm(`${m[2]} ${m[1]}`);
    return '';
  }
  function leadNames(lead){
    return [lead?.homeowner_name,[lead?.first_name,lead?.last_name].filter(Boolean).join(' ')]
      .map(norm).filter(Boolean);
  }
  function modernBonus(event,lead){
    const reasons=[];
    let bonus=0, exact=0;
    const blob=[event?.summary,event?.location_raw,event?.description,event?.property_text].filter(Boolean).join(' | ');

    const eventPhones=new Set([event?.phone_primary,event?.phone_secondary,...phones(blob)].map(digits).map(d=>d.length===11&&d[0]==='1'?d.slice(1):d).filter(d=>d.length===10));
    const leadPhones=[lead?.phone,lead?.phone_secondary].map(digits).map(d=>d.length===11&&d[0]==='1'?d.slice(1):d).filter(d=>d.length===10);
    if(leadPhones.some(p=>eventPhones.has(p))){bonus+=900;exact++;reasons.push('exact current inquiry phone');}

    const eventEmails=new Set([event?.email,...emails(blob)].map(x=>String(x||'').toLowerCase()).filter(Boolean));
    const leadEmails=[lead?.email].map(x=>String(x||'').toLowerCase()).filter(Boolean);
    if(leadEmails.some(e=>eventEmails.has(e))){bonus+=900;exact++;reasons.push('exact current inquiry email');}

    const eStreet=streetKey(event?.property_text||streetFromText(event?.summary)||streetFromText(blob));
    const lStreet=streetKey(lead?.street_address);
    if(eStreet&&lStreet&&eStreet===lStreet){bonus+=800;exact++;reasons.push('exact current inquiry street address');}
    else if(eStreet&&lStreet){
      const eh=eStreet.match(/^\d+/)?.[0], lh=lStreet.match(/^\d+/)?.[0];
      if(eh&&lh&&eh===lh){
        const et=eStreet.replace(/^\d+\s*/,''), lt=lStreet.replace(/^\d+\s*/,'');
        if(et===lt||et.includes(lt)||lt.includes(et)){bonus+=650;exact++;reasons.push('same house number and street');}
      }
    }

    const person=eventPerson(event);
    const names=leadNames(lead);
    if(person&&names.includes(person)){bonus+=700;exact++;reasons.push('exact current inquiry name');}

    if(exact>=2){bonus+=1200;reasons.unshift('multiple exact current inquiry identifiers');}

    const oldMatchOnly=String(lead?.lead_status||'').toLowerCase()==='appointment match needed';
    if(!exact&&oldMatchOnly){bonus-=35;reasons.push('old unmatched lead deprioritized');}

    return {bonus,reasons,exact};
  }

  function install(){
    if(typeof scoreLeadForEvent!=='function'||scoreLeadForEvent.__broModern)return false;
    const original=scoreLeadForEvent;
    const enhanced=function(event,lead){
      const result=original(event,lead)||{lead,score:0,reasons:[]};
      const modern=modernBonus(event,lead);
      result.score=Number(result.score||0)+modern.bonus;
      result.reasons=[...modern.reasons,...(result.reasons||[])];
      result.lead=lead;
      result.modern_exact_matches=modern.exact;
      return result;
    };
    enhanced.__broModern=true;
    scoreLeadForEvent=enhanced;
    window.scoreLeadForEvent=enhanced;
    return true;
  }

  if(!install()){
    let tries=0;
    const timer=setInterval(()=>{tries++;if(install()||tries>40)clearInterval(timer);},100);
  }
})();
