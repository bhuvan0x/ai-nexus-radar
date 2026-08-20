const {request}=require('./_bright');
const jobs=new Map();
const QUOTA_HINT=/custom collectors|collector limit|trial/i;
module.exports=async function(req,res){
  if(!process.env.BRIGHTDATA_API_KEY)return res.status(503).json({error:'Bright Data is not configured.',code:'MISSING_API_KEY'});
  try{
    if(req.method==='POST'){
      const {url,description,name}=req.body||{};
      if(!url||!description)return res.status(400).json({error:'url and description are required.',code:'INVALID_INPUT'});
      let template;
      try{
        template=await request('/dca/collector',{method:'POST',body:JSON.stringify({name:name||`nexus-${Date.now()}`,deliver:{type:'webhook',endpoint:'https://example.com/webhook',filename:{template:'data',extension:'json'}}})});
      }catch(e){
        const msg=String(e.message||'');
        if(e.status===400&&QUOTA_HINT.test(msg)){
          return res.status(402).json({
            error:'Your Bright Data trial has no custom collector slots left.',
            code:'CUSTOM_COLLECTOR_QUOTA',
            detail:msg,
            action:'Reuse an existing collector or ask Bright Data/hackathon support to increase your collector allowance.'
          });
        }
        throw e;
      }
      if(!template.id)throw new Error('Bright Data did not return a collector ID.');
      await request(`/dca/collectors/${template.id}/automate_template`,{method:'POST',body:JSON.stringify({description,urls:[url]})});
      jobs.set(template.id,{status:'running',createdAt:Date.now()});
      return res.status(202).json({collectorId:template.id,status:'running',viewUrl:`https://brightdata.com/cp/scrapers/${template.id}`});
    }
    if(req.method==='GET'){
      const id=String(req.query?.collectorId||'');
      if(!id)return res.status(400).json({error:'collectorId is required.',code:'INVALID_INPUT'});
      const p=await request(`/dca/collectors/${id}/automate_template/progress`);
      const status=p?.status||'running';
      return res.status(200).json({collectorId:id,status,progress:p,viewUrl:`https://brightdata.com/cp/scrapers/${id}`});
    }
    res.setHeader('Allow','GET, POST');return res.status(405).json({error:'Method not allowed'});
  }catch(e){
    console.error(e);
    return res.status(e.status&&e.status<500?e.status:502).json({error:e.message||'Collector operation failed.',code:'BRIGHTDATA_ERROR'});
  }
};
