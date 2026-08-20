const {request,rows}=require('./_bright');
module.exports=async function(req,res){
  if(!process.env.BRIGHTDATA_API_KEY)return res.status(503).json({error:'Bright Data is not configured.'});
  try{
    if(req.method==='POST'){
      const {collectorId,url}=req.body||{};
      if(!collectorId||!url)return res.status(400).json({error:'collectorId and url are required.'});
      let u; try{u=new URL(url);}catch{return res.status(400).json({error:'Invalid URL.'});}
      if(!/^https?:$/.test(u.protocol))return res.status(400).json({error:'Only HTTP(S) URLs are supported.'});
      const r=await request(`/dca/trigger_immediate?collector=${encodeURIComponent(collectorId)}`,{method:'POST',body:JSON.stringify({url})});
      return res.status(202).json({responseId:r.response_id,status:'pending',collectorId,url});
    }
    if(req.method==='GET'){
      const id=String(req.query?.responseId||''); if(!id)return res.status(400).json({error:'responseId is required.'});
      try{const r=await request(`/dca/get_result?response_id=${encodeURIComponent(id)}`); const data=rows(r); if(r?.pending===true || (!data.length && /pending|running|processing/i.test(String(r?.status||''))))return res.status(200).json({status:'pending'}); return res.status(200).json({status:'done',data:r});}
      catch(e){if(e.status===404||e.status===202)return res.status(200).json({status:'pending'}); throw e;}
    }
    res.setHeader('Allow','GET, POST'); return res.status(405).json({error:'Method not allowed'});
  }catch(e){console.error(e);return res.status(e.status&&e.status<500?e.status:502).json({error:e.message||'Bright Data request failed.'});}
};