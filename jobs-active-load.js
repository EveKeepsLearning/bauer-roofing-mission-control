'use strict';
(function(){
  const ACTIVE_STAGES=[
    'Awarded','Contract / Deposit','Deposit','Material Ordered','Ready to Schedule',
    'Scheduled','Material Delivered','In Production','Work Complete','Final Payment / Closeout'
  ];

  async function refreshActiveJobs(){
    try{
      if(typeof db==='undefined'||!db)return setTimeout(refreshActiveJobs,200);
      const res=await db.from('jobs').select('*')
        .is('deleted_at',null)
        .is('archived_at',null)
        .is('contract_canceled_at',null)
        .in('stage',ACTIVE_STAGES)
        .order('updated_at',{ascending:false})
        .limit(2000);
      if(res.error)throw res.error;
      jobs=res.data||[];
      const types=[...new Set(jobs.map(jobType).filter(Boolean))].sort();
      const filter=document.getElementById('jobTypeFilter');
      if(filter){
        const current=filter.value;
        filter.innerHTML='<option value="">All job types</option>'+types.map(t=>`<option>${esc(t)}</option>`).join('');
        if(types.includes(current))filter.value=current;
      }
      renderAll();
    }catch(err){
      console.error('Open Jobs active-load fix failed',err);
    }
  }

  window.addEventListener('load',()=>setTimeout(refreshActiveJobs,250));
})();
