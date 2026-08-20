const BASE = 'https://api.brightdata.com';
function key() { if (!process.env.BRIGHTDATA_API_KEY) throw new Error('BRIGHTDATA_API_KEY is not configured in Vercel.'); return process.env.BRIGHTDATA_API_KEY; }
async function request(path, options={}) {
  const res = await fetch(`${BASE}${path}`, { ...options, headers: { Authorization:`Bearer ${key()}`, 'Content-Type':'application/json', ...(options.headers||{}) } });
  const text = await res.text(); let data={}; try { data=text?JSON.parse(text):{}; } catch { data={raw:text}; }
  if (!res.ok) { const msg=data?.error||data?.message||`Bright Data HTTP ${res.status}`; const err=new Error(String(msg)); err.status=res.status; throw err; }
  return data;
}
function rows(data) { if(Array.isArray(data)) return data; return data?.data||data?.results||data?.items||data?.rows||[]; }
module.exports={request,rows};