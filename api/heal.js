const {request}=require('./_bright');
module.exports=async function(req,res){
  if(!process.env.BRIGHTDATA_API_KEY)return res.status(503).json({error:'Bright Data is not configured.'});
  try{
    const body=req.body||{}; const id=String(body.collectorId||req.query?.collectorId||'');
    if(!id)return res.status(400).json({error:'collectorId is required.'});
    if(req.method==='POST'){
      const prompt=String(body.prompt||'').trim(); if(!prompt)return res.status(400).json({error:'prompt is required.'});
      if(prompt.length>1000)return res.status(400).json({error:'Heal prompt must be 1000 characters or fewer.'});
      await request(`/dca/collectors/${id}/refactor_template`,{method:'POST',body:JSON.stringify({prompt,custom_input:[]})});
      const p=await request(`/dca/collectors/${id}/refactor_template/progress`);
      return res.status(202).json({status:p?.status||'running',progress:p,collectorId:id,viewUrl:`https://brightdata.com/cp/scrapers/${id}`});
    }
    if(req.method==='PUT'){
      await request(`/dca/collectors/${id}/resume_automation_job`,{method:'POST',body:JSON.stringify({message:true,auto_save:true})});
      const p=await request(`/dca/collectors/${id}/refactor_template/progress`);
      return res.status(200).json({status:p?.status||'done',progress:p,collectorId:id,viewUrl:`https://brightdata.com/cp/scrapers/${id}`});
    }
    if(req.method==='GET'){
      const p=await request(`/dca/collectors/${id}/refactor_template/progress`);return res.status(200).json({status:p?.status||'running',progress:p,collectorId:id,viewUrl:`https://brightdata.com/cp/scrapers/${id}`});
    }
    res.setHeader('Allow','GET,POST,PUT');return res.status(405).json({error:'Method not allowed'});
  }catch(e){console.error(e);return res.status(e.status&&e.status<500?e.status:502).json({error:e.message||'Self-healing operation failed.'});}
};