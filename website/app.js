/* AI-Nexus Radar — Flexible Scraper Studio */
(() => {
  const $ = (id) => document.getElementById(id);
  const state = { fields: [
    ['title','The primary title or name for each item'],
    ['url','The canonical URL for each item'],
    ['description','The main description or summary'],
    ['price','Price or compensation when present']
  ], mode: 'run', rows: [], columns: [], collectorId: '', lastRun: null };

  const escapeHtml = (v) => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const log = (message, replace = false) => {
    const el = $('log');
    const stamp = new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit', second:'2-digit'});
    el.textContent = replace ? `[${stamp}] ${message}` : `${el.textContent}\n[${stamp}] ${message}`;
    el.scrollTop = el.scrollHeight;
  };
  const toast = (message) => { const t=$('toast'); t.textContent=message; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),2200); };
  const setStatus = (text, live=false) => { $('statusText').textContent=text; $('statusDot').className=live?'live':''; };

  function renderFields() {
    $('fields').innerHTML = state.fields.map(([key, desc], i) => `<div class="fieldChip"><span class="drag">⋮⋮</span><input data-i="${i}" class="fieldKey" value="${escapeHtml(key)}"><input data-i="${i}" class="fieldDesc" value="${escapeHtml(desc)}"><button class="removeField" data-i="${i}" aria-label="Remove field">×</button></div>`).join('');
    document.querySelectorAll('.fieldKey,.fieldDesc').forEach(el => el.addEventListener('input', e => {
      const i=Number(e.target.dataset.i); state.fields[i][e.target.classList.contains('fieldKey')?0:1]=e.target.value;
    }));
    document.querySelectorAll('.removeField').forEach(b=>b.addEventListener('click',()=>{state.fields.splice(Number(b.dataset.i),1);renderFields();}));
  }

  function urls() { return $('urls').value.split(/\r?\n|,/).map(s=>s.trim()).filter(Boolean); }
  function schemaDescription() { return state.fields.filter(([k])=>k.trim()).map(([k,d])=>`${k.trim()} — ${d.trim()}`).join('; '); }

  function renderRows(rows) {
    state.rows = Array.isArray(rows) ? rows : [];
    const columns = [...new Set(state.rows.flatMap(r => Object.keys(r || {})))];
    state.columns = columns.length ? columns : state.fields.map(([k])=>k);
    $('resultTable').querySelector('thead').innerHTML = `<tr>${state.columns.map(c=>`<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
    $('resultTable').querySelector('tbody').innerHTML = state.rows.length ? state.rows.map(row=>`<tr>${state.columns.map(c=>`<td>${escapeHtml(Array.isArray(row?.[c]) ? row[c].join(', ') : row?.[c] ?? '')}</td>`).join('')}</tr>`).join('') : '<tr><td class="empty">No rows returned.</td></tr>';
    $('jsonView').textContent = JSON.stringify(state.rows,null,2);
    $('resultMeta').textContent = `${state.rows.length} rows · ${state.columns.length} fields · ${state.lastRun?.cached ? 'cached' : 'live'} · ${state.lastRun?.collectedAt ? new Date(state.lastRun.collectedAt).toLocaleString() : 'not run'}`;
  }

  function health(rows, columns) {
    const required = state.fields.map(([k])=>k.trim()).filter(Boolean);
    const data = rows || [];
    const checks = required.map(key => {
      const empty = data.filter(r => { const v=r?.[key]; return v==null || (typeof v==='string'&&!v.trim()) || (Array.isArray(v)&&!v.length); }).length;
      const ratio = data.length ? empty/data.length : 1;
      return {key, empty, ratio, ok: ratio < .3 && columns.includes(key)};
    });
    const schemaCoverage = required.length ? checks.filter(c=>c.ok).length/required.length : 0;
    const completeness = data.length ? checks.reduce((a,c)=>a+(1-c.ratio),0)/(checks.length||1) : 0;
    const score = Math.round(Math.max(0,Math.min(100,(schemaCoverage*.5+completeness*.5)*100)));
    $('healthScore').textContent=score; $('healthBig').textContent=score; $('rowMetric').textContent=data.length; $('fieldMetric').textContent=columns.length;
    $('healthSummary').textContent = score >= 85 ? 'Healthy extraction. Schema and completeness look stable.' : score >= 60 ? 'Extraction needs attention. Review the flagged fields before trusting downstream data.' : 'Extraction is unhealthy. Use the self-heal panel to repair the collector.';
    $('fieldHealth').innerHTML = checks.length ? checks.map(c=>`<div class="fieldHealthRow"><span><b>${escapeHtml(c.key)}</b><small>${c.empty}/${data.length||0} empty</small></span><strong class="${c.ok?'ok':'bad'}">${c.ok?'HEALTHY':'DRIFT'}</strong></div>`).join('') : '<div class="empty">No requested fields.</div>';
    return {score,checks};
  }

  async function api(path, options={}) {
    const res = await fetch(path, {headers:{'Content-Type':'application/json'}, ...options});
    let body={}; try { body=await res.json(); } catch { body={}; }
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    return body;
  }

  async function runExistingCollector(collectorId, targetUrls) {
    const results=[];
    for (const url of targetUrls) {
      log(`Triggering ${url}`);
      const body=await api('/api/run',{method:'POST',body:JSON.stringify({collectorId,url})});
      log(`Response ${body.responseId || 'received'} · polling Bright Data...`);
      const started=Date.now();
      while(Date.now()-started < 180000) {
        const p=await api(`/api/run?responseId=${encodeURIComponent(body.responseId)}`);
        if(p.status==='pending') { log(`Collector still running (${Math.round((Date.now()-started)/1000)}s)`); await new Promise(r=>setTimeout(r,2500)); continue; }
        if(p.status==='failed') throw new Error(p.error || 'Bright Data collector failed');
        const rows=Array.isArray(p.data)?p.data:(p.data?.data||p.data?.results||p.data?.items||[]);
        results.push(...rows); break;
      }
    }
    return results;
  }

  async function createCollector(url, description) {
    log('No collector supplied. Starting Bright Data AI collector creation...');
    const body=await api('/api/collector',{method:'POST',body:JSON.stringify({url,description,name:`nexus-${Date.now()}`})});
    const collectorId=body.collectorId;
    if(!collectorId) throw new Error('Collector creation did not return a collector ID.');
    state.collectorId=collectorId; $('collectorId').value=collectorId; log(`Collector created: ${collectorId}`);
    return collectorId;
  }

  async function run() {
    const targetUrls=urls(); if(!targetUrls.length) return toast('Add at least one public URL.');
    const desc=$('description').value.trim() || schemaDescription();
    if(!desc) return toast('Describe the fields you want to extract.');
    $('runBtn').disabled=true; setStatus('RUNNING',true); log('Starting flexible extraction...',true);
    try {
      let id=$('collectorId').value.trim();
      if(!id && $('autoCreate').checked) id=await createCollector(targetUrls[0],desc);
      if(!id) throw new Error('Enter a collector ID or enable automatic collector creation.');
      state.collectorId=id;
      const rows=await runExistingCollector(id,targetUrls);
      const normalized=rows.map(r=>{ const o={}; state.fields.forEach(([k])=>o[k]=r?.[k] ?? r?.[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase())] ?? null); return Object.keys(o).length?o:r; });
      const columns=[...new Set(normalized.flatMap(r=>Object.keys(r||{})))];
      const h=health(normalized,columns); renderRows(normalized); state.lastRun={collectedAt:new Date().toISOString(),cached:false}; renderRows(normalized); log(`Completed: ${normalized.length} rows · health ${h.score}/100`); setStatus(h.score>=60?'HEALTHY':'DRIFT',h.score>=60);
      if(h.score<60) { $('healState').textContent='DRIFT DETECTED'; $('healPrompt').value=`Extraction drift detected in: ${h.checks.filter(c=>!c.ok).map(c=>c.key).join(', ')}. Repair the existing collector for this schema: ${schemaDescription()}.`; }
    } catch(e) { log(`ERROR: ${e.message}`); setStatus('ERROR'); toast(e.message); } finally { $('runBtn').disabled=false; }
  }

  async function triggerHeal() {
    const id=$('collectorId').value.trim() || state.collectorId; if(!id) return toast('Run or create a collector first.');
    const prompt=$('healPrompt').value.trim(); if(!prompt) return toast('Describe the extraction failure first.');
    $('healBtn').disabled=true; setStatus('HEALING',true); $('healState').textContent='HEALING'; log(`Triggering Bright Data self-heal for ${id}...`);
    try { const r=await api('/api/heal',{method:'POST',body:JSON.stringify({collectorId:id,prompt})}); $('healPreview').textContent=JSON.stringify(r,null,2); $('healState').textContent=r.status||'AWAITING APPROVAL'; log(`Heal status: ${r.status||'awaiting approval'}`); }
    catch(e){log(`HEAL ERROR: ${e.message}`);toast(e.message);$('healState').textContent='ERROR';} finally {$('healBtn').disabled=false;}
  }
  async function approveHeal() { const id=$('collectorId').value.trim()||state.collectorId; if(!id)return toast('No collector selected.'); try { const r=await api('/api/heal',{method:'PUT',body:JSON.stringify({collectorId:id})}); $('healPreview').textContent=JSON.stringify(r,null,2); $('healState').textContent=r.status||'APPROVED'; log(`Repair approval: ${r.status||'complete'}`); } catch(e){toast(e.message);log(`APPROVE ERROR: ${e.message}`);} }

  function csvDownload() { if(!state.rows.length)return toast('No data to export.'); const cols=state.columns; const lines=[cols.map(c=>`"${String(c).replaceAll('"','""')}"`).join(','),...state.rows.map(r=>cols.map(c=>`"${String(Array.isArray(r?.[c])?r[c].join('; '):r?.[c]??'').replaceAll('"','""')}"`).join(','))]; download('nexus-radar.csv',lines.join('\n'),'text/csv'); }
  function download(name,text,type){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();URL.revokeObjectURL(a.href);}

  $('runBtn').addEventListener('click',run); $('healBtn').addEventListener('click',triggerHeal); $('approveBtn').addEventListener('click',approveHeal);
  $('addField').addEventListener('click',()=>{const raw=$('newField').value.trim(); if(!raw)return; const [k,...rest]=raw.split('|').map(s=>s.trim()); state.fields.push([k,rest.join(' | ')||'Requested extraction field']); $('newField').value='';renderFields();});
  $('exampleAmazon').addEventListener('click',()=>{$('urls').value='https://example.com/products';$('description').value='Extract one row per product with product name, price, availability, rating and product URL.';});
  $('exampleDocs').addEventListener('click',()=>{$('urls').value='https://example.com/docs';$('description').value='Extract document title, section heading, summary, author and canonical URL for each document.';});
  $('clearUrls').addEventListener('click',()=>{$('urls').value='';});
  document.querySelectorAll('.mode').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('.mode').forEach(x=>x.classList.remove('active'));b.classList.add('active');state.mode=b.dataset.mode;}));
  $('viewTable').addEventListener('click',()=>{$('tableWrap').classList.remove('hidden');$('jsonView').classList.add('hidden');}); $('viewJson').addEventListener('click',()=>{$('tableWrap').classList.add('hidden');$('jsonView').classList.remove('hidden');});
  $('downloadCsv').addEventListener('click',csvDownload); $('downloadJson').addEventListener('click',()=>download('nexus-radar.json',JSON.stringify(state.rows,null,2),'application/json')); $('copyLog').addEventListener('click',()=>navigator.clipboard?.writeText($('log').textContent).then(()=>toast('Activity copied.')));
  renderFields(); renderRows([]); health([],[]);
})();