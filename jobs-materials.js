'use strict';
(function(){
  const MATERIAL_TYPES=['LM30','LandMark','XT25','Timberline','Max-Rib','Heritage'];
  const MATERIAL_COLORS=['Moire Black','Pewter','Weathered Wood','Burnt Sienna','Pewter Gray','Cedar Brown','Silver Birch','Charcoal','Brownwood','Timber Blend','Resawn Shake','Dove Gray','Virginia Slate','Onyx Black','Heather Blend'];

  function esc(value){
    return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function datalist(id,values){
    const list=document.createElement('datalist');
    list.id=id;
    list.innerHTML=values.map(value=>`<option value="${esc(value)}"></option>`).join('');
    document.body.appendChild(list);
  }

  function installFields(){
    if(document.querySelector('[data-bro-material-fields]'))return true;
    const jobType=document.getElementById('editJobType');
    if(!jobType)return false;
    const anchor=jobType.closest('div');
    if(!anchor)return false;

    const typeWrap=document.createElement('div');
    typeWrap.dataset.broMaterialFields='1';
    typeWrap.innerHTML='<label>Material / shingle type</label><input id="editMaterialType" list="jobMaterialTypeOptions" placeholder="Choose or type a material">';

    const colorWrap=document.createElement('div');
    colorWrap.dataset.broMaterialFields='1';
    colorWrap.innerHTML='<label>Color</label><input id="editMaterialColor" list="jobMaterialColorOptions" placeholder="Choose or type a color">';

    anchor.insertAdjacentElement('afterend',typeWrap);
    typeWrap.insertAdjacentElement('afterend',colorWrap);
    datalist('jobMaterialTypeOptions',MATERIAL_TYPES);
    datalist('jobMaterialColorOptions',MATERIAL_COLORS);
    return true;
  }

  function currentJob(){
    const id=document.getElementById('editJobId')?.value;
    if(!id||typeof jobs==='undefined')return null;
    return jobs.find(job=>String(job.id)===String(id))||null;
  }

  function fillFields(){
    const job=currentJob();
    if(!job)return;
    const type=document.getElementById('editMaterialType');
    const color=document.getElementById('editMaterialColor');
    if(type)type.value=job.material_type||'';
    if(color)color.value=job.material_color||'';
  }

  function watchDialog(){
    const dialog=document.getElementById('jobDialog');
    if(!dialog)return false;
    new MutationObserver(()=>{
      if(dialog.open)queueMicrotask(fillFields);
    }).observe(dialog,{attributes:true,attributeFilter:['open']});
    return true;
  }

  function wireSave(){
    const button=document.getElementById('saveJobBtn');
    if(!button||button.dataset.broMaterialsSave)return false;
    const original=button.onclick;
    if(typeof original!=='function')return false;
    button.dataset.broMaterialsSave='1';
    button.onclick=async function(event){
      const id=document.getElementById('editJobId')?.value;
      if(id&&typeof db!=='undefined'&&db){
        const materialType=document.getElementById('editMaterialType')?.value.trim()||null;
        const materialColor=document.getElementById('editMaterialColor')?.value.trim()||null;
        const patch={material_type:materialType,material_color:materialColor,updated_at:new Date().toISOString()};
        const result=await db.from('jobs').update(patch).eq('id',id);
        if(result.error){
          if(typeof notice==='function')notice('Could not save roofing materials: '+result.error.message,'error');
          else alert('Could not save roofing materials: '+result.error.message);
          return;
        }
        const job=currentJob();
        if(job)Object.assign(job,patch);
      }
      return original.call(this,event);
    };
    return true;
  }

  function init(){
    if(!installFields())return setTimeout(init,100);
    watchDialog();
    const waitForSave=()=>{if(!wireSave())setTimeout(waitForSave,100);};
    waitForSave();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
