'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root)root.BRORfpMath=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const cents=value=>Math.round((Number(value||0)+Number.EPSILON)*100)/100;
  const key=value=>String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  function compareRequests(a,b){
    const an=number(a.requisition_number),bn=number(b.requisition_number);
    if(an!==bn)return an-bn;
    const ad=String(a.payment_date||a.created_at||''),bd=String(b.payment_date||b.created_at||'');
    if(ad!==bd)return ad.localeCompare(bd);
    return String(a.id||'').localeCompare(String(b.id||''));
  }
  function calculateHistory(requests=[],items=[]){
    const itemMap=new Map();
    for(const item of items){
      const id=String(item.payment_request_id||'');
      if(!itemMap.has(id))itemMap.set(id,[]);
      itemMap.get(id).push(item);
    }
    for(const list of itemMap.values())list.sort((a,b)=>number(a.sort_order)-number(b.sort_order));
    const contracts=new Map(),performed=new Map(),order=[];
    let cumulativeGross=0,totalPaid=0;
    const history=[];
    for(const request of [...requests].sort(compareRequests)){
      const requestItems=itemMap.get(String(request.id))||[];
      let currentGross=0;
      for(const item of requestItems){
        const description=String(item.description||'').trim();
        const k=key(description)||`item-${request.id}-${item.sort_order||order.length+1}`;
        if(!performed.has(k)){performed.set(k,0);order.push(k);}
        performed.set(k,cents(performed.get(k)+number(item.requested_amount)));
        currentGross=cents(currentGross+number(item.requested_amount));
        if(description){
          const agreed=number(item.contract_amount);
          if(!contracts.has(k))contracts.set(k,{description,amount:0});
          const contract=contracts.get(k);
          contract.description=description;
          if(item.contract_amount!==null&&item.contract_amount!==undefined&&String(item.contract_amount)!=='')contract.amount=cents(agreed);
        }
      }
      cumulativeGross=cents(cumulativeGross+currentGross);
      const rate=Math.min(100,Math.max(0,number(request.retainage_percent)));
      const retainage=cents(cumulativeGross*rate/100);
      const earnedToDate=cents(cumulativeGross-retainage);
      const previousPayments=cents(totalPaid);
      const thisRequisition=cents(earnedToDate-previousPayments);
      totalPaid=cents(totalPaid+thisRequisition);
      const rows=order.map(k=>({
        key:k,
        description:contracts.get(k)?.description||k,
        contract_amount:cents(contracts.get(k)?.amount||0),
        work_performed_to_date:cents(performed.get(k)||0)
      }));
      history.push({
        request,
        currentGross,
        totalWorkPerformed:cumulativeGross,
        retainagePercent:rate,
        retainage,
        earnedToDate,
        previousPayments,
        thisRequisition,
        totalPaid,
        contractTotal:cents(rows.reduce((sum,row)=>sum+row.contract_amount,0)),
        rows
      });
    }
    return history;
  }
  function forRequest(requestId,requests=[],items=[]){
    return calculateHistory(requests,items).find(entry=>String(entry.request.id)===String(requestId))||null;
  }
  return {cents,normalizeDescription:key,compareRequests,calculateHistory,forRequest};
});
