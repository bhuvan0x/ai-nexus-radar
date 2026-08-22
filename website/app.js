/* AI-Nexus Radar — Flexible Scraper Studio */
(() => {
  const $ = id => document.getElementById(id);
  const state = {
    fields: [
      ['title', 'Primary title or name'],
      ['url', 'Canonical URL'],
      ['description', 'Main description or summary'],
      ['price', 'Price or compensation when present']
    ],
    rows: [],
    columns: [],
    collectorId: '',
    lastGoodRows: [],
    lastRun: null,
    mode: 'run'
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function log(message, replace = false) {
    const element = $('log');
    if (!element) return;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    element.textContent = replace
      ? `[${time}] ${message}`
      : `${element.textContent}\n[${time}] ${message}`;
    element.scrollTop = element.scrollHeight;
  }

  function toast(message) {
    const element = $('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 2600);
  }

  function setStatus(text, live = false) {
    if ($('statusText')) $('statusText').textContent = text;
    if ($('statusDot')) $('statusDot').className = live ? 'live' : '';
  }

  function getUrls() {
    return ($('urls')?.value || '')
      .split(/\r?\n|,/)
      .map(value => value.trim())
      .filter(Boolean);
  }

  function getSchemaDescription() {
    return state.fields
      .filter(([key]) => key.trim())
      .map(([key, description]) => `${key.trim()} — ${description.trim()}`)
      .join('; ');
  }

  function wantsNewCollector() {
    const autoCreate = $('autoCreate');
    const reuse = $('reuseCollector');
    if (reuse) return !reuse.checked;
    return Boolean(autoCreate?.checked);
  }

  function renderFields() {
    const container = $('fields');
    if (!container) return;
    container.innerHTML = state.fields.map(([key, description], index) => `
      <div class="fieldChip">
        <span class="drag">⋮⋮</span>
        <input class="fieldKey" data-index="${index}" value="${esc(key)}">
        <input class="fieldDesc" data-index="${index}" value="${esc(description)}">
        <button class="removeField" data-index="${index}" type="button">×</button>
      </div>
    `).join('');

    document.querySelectorAll('.fieldKey, .fieldDesc').forEach(input => {
      input.addEventListener('input', () => {
        const index = Number(input.dataset.index);
        state.fields[index][input.classList.contains('fieldKey') ? 0 : 1] = input.value;
      });
    });

    document.querySelectorAll('.removeField').forEach(button => {
      button.addEventListener('click', () => {
        state.fields.splice(Number(button.dataset.index), 1);
        renderFields();
      });
    });
  }

  function renderRows(rows) {
    state.rows = Array.isArray(rows) ? rows : [];
    state.columns = [...new Set(state.rows.flatMap(row => Object.keys(row || {})))];
    if (!state.columns.length) state.columns = state.fields.map(([key]) => key.trim()).filter(Boolean);

    const table = $('resultTable');
    if (table) {
      table.querySelector('thead').innerHTML = `<tr>${state.columns.map(column => `<th>${esc(column)}</th>`).join('')}</tr>`;
      table.querySelector('tbody').innerHTML = state.rows.length
        ? state.rows.map(row => `<tr>${state.columns.map(column => {
          const value = Array.isArray(row?.[column]) ? row[column].join(', ') : row?.[column] ?? '';
          return `<td>${esc(value)}</td>`;
        }).join('')}</tr>`).join('')
        : '<tr><td class="empty">No rows returned.</td></tr>';
    }

    if ($('jsonView')) $('jsonView').textContent = JSON.stringify(state.rows, null, 2);
    if ($('resultMeta')) {
      const timestamp = state.lastRun?.collectedAt
        ? new Date(state.lastRun.collectedAt).toLocaleString()
        : 'not run';
      $('resultMeta').textContent = `${state.rows.length} rows · ${state.columns.length} fields · ${timestamp}`;
    }

    try {
      localStorage.setItem('nexusRadarRows', JSON.stringify(state.rows));
      localStorage.setItem('nexusRadarMeta', `${state.rows.length} rows · ${state.columns.length} fields`);
    } catch {}
  }

  function auditRows(rows = state.rows) {
    const required = state.fields.map(([key]) => key.trim()).filter(Boolean);
    const data = Array.isArray(rows) ? rows : [];
    const checks = required.map(key => {
      const missing = data.filter(row => {
        const value = row?.[key];
        return value === null || value === undefined ||
          (typeof value === 'string' && !value.trim()) ||
          (Array.isArray(value) && !value.length);
      }).length;
      const ratio = data.length ? missing / data.length : 1;
      return {
        key,
        missing,
        ratio,
        ok: data.length > 0 && state.columns.includes(key) && ratio < 0.3
      };
    });

    const coverage = checks.length ? checks.filter(check => check.ok).length / checks.length : 0;
    const completeness = checks.length
      ? checks.reduce((sum, check) => sum + (1 - check.ratio), 0) / checks.length
      : data.length ? 1 : 0;
    return {
      score: data.length ? Math.round((coverage * 0.5 + completeness * 0.5) * 100) : 0,
      checks
    };
  }

  function updateTimeline(activeStep) {
    document.querySelectorAll('.timelineStep').forEach((element, index) => {
      element.classList.toggle('active', index <= activeStep);
      element.classList.toggle('done', index < activeStep);
    });
  }

  function renderHealth(result, label = 'Audit complete') {
    const { score, checks } = result;
    if ($('healthScore')) $('healthScore').textContent = score;
    if ($('healthBig')) $('healthBig').textContent = score;
    if ($('rowMetric')) $('rowMetric').textContent = state.rows.length;
    if ($('fieldMetric')) $('fieldMetric').textContent = state.columns.length;
    if ($('driftMetric')) $('driftMetric').textContent = checks.filter(check => !check.ok).length;

    if ($('healthSummary')) {
      $('healthSummary').textContent = score >= 85
        ? 'Healthy extraction. Schema and completeness look stable.'
        : score >= 60
          ? 'Extraction needs attention. Review flagged fields.'
          : 'Extraction is unhealthy. Trigger self-heal before trusting downstream data.';
    }

    if ($('fieldHealth')) {
      $('fieldHealth').innerHTML = checks.length
        ? checks.map(check => `
          <div class="fieldHealthRow">
            <span><b>${esc(check.key)}</b><small>${check.missing}/${state.rows.length} empty · ${Math.round(check.ratio * 100)}% missing</small></span>
            <strong class="${check.ok ? 'ok' : 'bad'}">${check.ok ? 'HEALTHY' : 'DRIFT'}</strong>
          </div>
        `).join('')
        : '<div class="empty">No requested fields.</div>';
    }

    if ($('reliabilityState')) {
      const drift = checks.some(check => !check.ok);
      $('reliabilityState').textContent = drift ? 'DRIFT DETECTED' : 'HEALTHY';
      $('reliabilityState').className = `badge ${drift ? 'bad' : 'ok'}`;
      updateTimeline(drift ? 1 : 0);
    }
    if ($('reliabilityRun')) $('reliabilityRun').textContent = label;
    return result;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    let body = {};
    try { body = await response.json(); } catch {}
    if (!response.ok) throw new Error(body.error || body.message || `Request failed (${response.status})`);
    return body;
  }

  async function loadConfiguredCollector() {
    try {
      const result = await api('/api/collector');
      if (result.collectorId) {
        state.collectorId = result.collectorId;
        if ($('collectorId') && !$('collectorId').value.trim()) $('collectorId').value = result.collectorId;
        if ($('collectorHint')) $('collectorHint').textContent = `Configured collector available: ${result.collectorId}`;
        log(`Configured collector available: ${result.collectorId}`);
        return result.collectorId;
      }
      if ($('collectorHint')) $('collectorHint').textContent = 'No default collector configured. New collector mode is ready.';
    } catch (error) {
      log(`Collector discovery: ${error.message}`);
      if ($('collectorHint')) $('collectorHint').textContent = 'Collector discovery unavailable. You can still create a new collector.';
    }
    return '';
  }

  async function waitCollector(id) {
    for (let attempt = 1; attempt <= 120; attempt += 1) {
      const progress = await api(`/api/collector?collectorId=${encodeURIComponent(id)}`);
      const status = String(progress.status || '').toLowerCase();
      if (['done', 'completed', 'ready', 'success'].includes(status)) return progress;
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(`Collector generation ${status}.`);
      }
      log(`Collector generation: ${progress.status || 'running'} (${attempt}/120)`);
      await sleep(2500);
    }
    throw new Error('Collector generation timed out. Check Bright Data Scraper Studio for the job status.');
  }

  async function createCollector(url, description) {
    log('Creating a new Bright Data collector…');
    const created = await api('/api/collector', {
      method: 'POST',
      body: JSON.stringify({ url, description, name: `nexus-${Date.now()}` })
    });
    if (!created.collectorId) throw new Error('Bright Data did not return a collector ID.');
    state.collectorId = created.collectorId;
    if ($('collectorId')) $('collectorId').value = created.collectorId;
    log(`Collector created: ${created.collectorId}`);
    await waitCollector(created.collectorId);
    log('Collector generation finished.');
    return created.collectorId;
  }

  async function pollResult(responseId) {
    if (!responseId) throw new Error('Bright Data did not return a response ID.');
    for (let attempt = 1; attempt <= 120; attempt += 1) {
      const result = await api(`/api/run?responseId=${encodeURIComponent(responseId)}`);
      if (result.status === 'done') {
        const data = result.data;
        if (Array.isArray(data)) return data;
        return data?.data || data?.results || data?.items || data?.rows || data?.records || [];
      }
      log(`Scrape job pending… (${attempt}/120)`);
      await sleep(2500);
    }
    throw new Error(`Scrape timed out. Response ID: ${responseId}`);
  }

  async function runOne(collectorId, url) {
    log(`Starting scrape: ${url}`);
    const started = await api('/api/run', {
      method: 'POST',
      body: JSON.stringify({ collectorId, url })
    });
    log(`Bright Data accepted job ${started.responseId || '(no response ID)'}`);
    return pollResult(started.responseId);
  }

  async function runScraper() {
    const targets = getUrls();
    const description = $('description')?.value.trim() || getSchemaDescription();
    const newCollector = wantsNewCollector();
    const existingCollector = $('collectorId')?.value.trim() || state.collectorId;

    if (!targets.length) return toast('Add at least one public URL.');
    if (!description) return toast('Describe what you want to extract.');

    const button = $('runBtn');
    if (button) button.disabled = true;
    setStatus('RUNNING', true);
    log('Starting flexible scraper…', true);

    try {
      let collectorId = existingCollector;

      if (state.mode === 'create') {
        if (!newCollector) {
          throw new Error('Select “Auto-create new collector” to use Create only mode.');
        }
        collectorId = await createCollector(targets[0], description);
        setStatus('READY', true);
        toast(`Collector ${collectorId} created.`);
        return;
      }

      if (newCollector) {
        collectorId = await createCollector(targets[0], description);
      } else if (!collectorId) {
        collectorId = await loadConfiguredCollector();
      }

      if (!collectorId) {
        throw new Error('No collector is available. Select Auto-create new collector or enter an existing collector ID.');
      }

      state.collectorId = collectorId;
      if ($('collectorId')) $('collectorId').value = collectorId;

      const allRows = [];
      for (const target of targets) {
        const rows = await runOne(collectorId, target);
        allRows.push(...rows);
      }

      state.lastGoodRows = JSON.parse(JSON.stringify(allRows));
      state.lastRun = { collectedAt: new Date().toISOString() };
      renderRows(allRows);
      const health = renderHealth(auditRows(allRows), 'Live dataset audited');
      log(`DONE · ${allRows.length} rows · health ${health.score}/100`);
      setStatus(health.score >= 60 ? 'HEALTHY' : 'DRIFT', health.score >= 60);

      if (health.checks.some(check => !check.ok)) {
        $('healState').textContent = 'DRIFT DETECTED';
        $('healState').className = 'badge bad';
        $('healPrompt').value = `Repair collector ${collectorId}. Fields with extraction gaps: ${health.checks.filter(check => !check.ok).map(check => check.key).join(', ')}. Preserve schema: ${getSchemaDescription()}.`;
      }
    } catch (error) {
      log(`ERROR · ${error.message}`);
      setStatus('ERROR');
      toast(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  }

  function auditReliability() {
    if (!state.rows.length) return toast('Run a scraper or simulate field drift first.');
    const result = renderHealth(auditRows(state.rows), 'Reliability audit complete');
    log(`Reliability audit complete · ${state.rows.length} rows · ${result.checks.filter(check => !check.ok).length} drifted fields`);
  }

  function simulateDrift() {
    if (!state.rows.length) {
      state.rows = [
        { title: 'Demo record A', url: 'https://example.com/a', description: 'Healthy demo row', price: '$120' },
        { title: 'Demo record B', url: 'https://example.com/b', description: 'Healthy demo row', price: '$180' },
        { title: 'Demo record C', url: 'https://example.com/c', description: 'Healthy demo row', price: '$240' }
      ];
      state.columns = ['title', 'url', 'description', 'price'];
      state.lastGoodRows = JSON.parse(JSON.stringify(state.rows));
    }

    const target = state.fields.map(([key]) => key.trim()).find(key => key && state.columns.includes(key)) || state.columns[0];
    state.rows = state.rows.map((row, index) => ({ ...row, [target]: index === 0 ? row[target] : null }));
    renderRows(state.rows);
    const result = renderHealth(auditRows(state.rows), 'Simulated extraction drift');
    $('healState').textContent = 'DRIFT DETECTED';
    $('healState').className = 'badge bad';
    $('healPrompt').value = `Field “${target}” is empty in ${result.checks.find(check => check.key === target)?.missing || 0}/${state.rows.length} rows. Repair collector ${state.collectorId || $('collectorId').value.trim() || '(current collector)'} while preserving schema: ${getSchemaDescription()}.`;
    log(`SIMULATED DRIFT · ${target}`);
    updateTimeline(1);
  }

  function restoreClean() {
    if (!state.lastGoodRows.length) return toast('No clean baseline exists yet.');
    state.rows = JSON.parse(JSON.stringify(state.lastGoodRows));
    renderRows(state.rows);
    renderHealth(auditRows(state.rows), 'Restored clean baseline');
    $('healState').textContent = 'WAITING';
    $('healState').className = 'badge';
    log('Restored clean dataset.');
  }

  async function heal() {
    const collectorId = $('collectorId').value.trim() || state.collectorId;
    const prompt = $('healPrompt').value.trim();
    if (!collectorId) return toast('No collector selected.');
    if (!prompt) return toast('Describe what broke.');
    $('healBtn').disabled = true;
    $('approveBtn').disabled = true;
    setStatus('HEALING', true);
    $('healState').textContent = 'HEALING';
    $('healState').className = 'badge warn';
    updateTimeline(2);
    log(`Triggering self-heal for ${collectorId}…`);
    try {
      const started = await api('/api/heal', { method: 'POST', body: JSON.stringify({ collectorId, prompt }) });
      $('healPreview').textContent = JSON.stringify(started, null, 2);
      $('healState').textContent = started.status || 'RUNNING';
      $('healState').className = 'badge warn';
      $('approveBtn').disabled = false;
    } catch (error) {
      $('healState').textContent = 'ERROR';
      $('healState').className = 'badge bad';
      log(`HEAL ERROR · ${error.message}`);
      toast(error.message);
    } finally {
      $('healBtn').disabled = false;
    }
  }

  async function approve() {
    const collectorId = $('collectorId').value.trim() || state.collectorId;
    if (!collectorId) return toast('No collector selected.');
    try {
      const result = await api('/api/heal', { method: 'PUT', body: JSON.stringify({ collectorId }) });
      $('healPreview').textContent = JSON.stringify(result, null, 2);
      $('healState').textContent = result.status || 'APPROVED';
      $('healState').className = 'badge ok';
      updateTimeline(3);
      log('Repair approved. Re-run the collector to verify recovery.');
    } catch (error) {
      toast(error.message);
      log(`APPROVE ERROR · ${error.message}`);
    }
  }

  function download(name, text, type) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([text], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 500);
  }

  function csv() {
    if (!state.rows.length) return toast('No data to export.');
    const lines = [
      state.columns.map(column => `"${String(column).replaceAll('"', '""')}"`).join(','),
      ...state.rows.map(row => state.columns.map(column => {
        const value = Array.isArray(row?.[column]) ? row[column].join('; ') : row?.[column] ?? '';
        return `"${String(value).replaceAll('"', '""')}"`;
      }).join(','))
    ];
    download('nexus-radar.csv', lines.join('\n'), 'text/csv');
  }

  $('runBtn')?.addEventListener('click', runScraper);
  $('auditBtn')?.addEventListener('click', auditReliability);
  $('driftBtn')?.addEventListener('click', simulateDrift);
  $('restoreBtn')?.addEventListener('click', restoreClean);
  $('healBtn')?.addEventListener('click', heal);
  $('approveBtn')?.addEventListener('click', approve);

  $('addField')?.addEventListener('click', () => {
    const raw = $('newField').value.trim();
    if (!raw) return;
    const [key, ...description] = raw.split('|').map(value => value.trim());
    state.fields.push([key, description.join(' | ') || 'Requested extraction field']);
    $('newField').value = '';
    renderFields();
  });

  $('exampleAmazon')?.addEventListener('click', () => {
    $('urls').value = 'https://books.toscrape.com/';
    $('description').value = 'Extract one row per book with title, price, availability, rating, category, and product URL.';
  });

  $('exampleDocs')?.addEventListener('click', () => {
    $('urls').value = 'https://example.com/docs';
    $('description').value = 'Extract document title, section heading, summary, author and canonical URL.';
  });

  $('clearUrls')?.addEventListener('click', () => { $('urls').value = ''; });

  document.querySelectorAll('.mode').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.mode').forEach(item => item.classList.remove('active'));
    button.classList.add('active');
    state.mode = button.dataset.mode || 'run';
    log(`Mode: ${state.mode}`);
  }));

  $('reuseCollector')?.addEventListener('change', () => {
    const reuse = $('reuseCollector').checked;
    $('collectorHint').textContent = reuse
      ? 'Reuse mode active. Enter or keep the existing collector ID.'
      : 'New collector mode is active. A fresh Bright Data collector will be created.';
  });

  $('autoCreate')?.addEventListener('change', () => {
    $('collectorHint').textContent = $('autoCreate').checked
      ? 'New collector mode is active. A fresh Bright Data collector will be created.'
      : 'Reuse mode active. Enter an existing collector ID.';
  });

  $('viewTable')?.addEventListener('click', () => {
    $('tableWrap').classList.remove('hidden');
    $('jsonView').classList.add('hidden');
  });
  $('viewJson')?.addEventListener('click', () => {
    $('tableWrap').classList.add('hidden');
    $('jsonView').classList.remove('hidden');
  });
  $('downloadCsv')?.addEventListener('click', csv);
  $('downloadJson')?.addEventListener('click', () => download('nexus-radar.json', JSON.stringify(state.rows, null, 2), 'application/json'));
  $('copyLog')?.addEventListener('click', () => navigator.clipboard?.writeText($('log').textContent).then(() => toast('Activity copied.')));

  renderFields();
  renderRows([]);
  renderHealth(auditRows([]), 'Waiting for a scrape');
  if ($('approveBtn')) $('approveBtn').disabled = true;
  loadConfiguredCollector();
})();