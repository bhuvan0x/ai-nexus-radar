/* AI-Nexus Radar — Flexible Scraper Studio */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    mode: 'run',
    bindingComplete: false
  };

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

  function log(message, replace = false) {
    const element = $('log');
    if (!element) return;
    const time = new Date().toLocaleTimeString([], { hour12: false });
    const next = `[${time}] ${message}`;
    element.textContent = replace ? next : `${element.textContent}\n${next}`;
    element.scrollTop = element.scrollHeight;
  }

  function toast(message) {
    const element = $('toast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('show');
    window.setTimeout(() => element.classList.remove('show'), 2600);
  }

  function setStatus(text, live = false) {
    if ($('statusText')) $('statusText').textContent = text;
    if ($('statusDot')) $('statusDot').className = live ? 'live' : '';
  }

  function getUrls() {
    return ($('urls')?.value || '')
      .split(/\r?\n|,/)
      .map((value) => value.trim())
      .filter(Boolean);
  }

  function getSchemaDescription() {
    return state.fields
      .map(([key, description]) => ({ key: key.trim(), description: description.trim() }))
      .filter((item) => item.key)
      .map((item) => `${item.key} — ${item.description}`)
      .join('; ');
  }

  function getCollectionDescription() {
    const base = $('description')?.value.trim() || getSchemaDescription();
    return `${base}\n\nPagination policy: follow the target site's normal pagination or next-page mechanism and collect all available pages until the source is exhausted. Do not impose an artificial page limit such as 10, 50, or 70 pages. Stop only when there is no next page, pagination is exhausted, or the source explicitly indicates completion.`;
  }

  function wantsNewCollector() {
    const reuse = $('reuseCollector');
    if (reuse) return !reuse.checked;
    return Boolean($('autoCreate')?.checked);
  }

  function normalizeRows(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const candidates = [
      payload.data,
      payload.results,
      payload.items,
      payload.rows,
      payload.records,
      payload.dataset,
      payload.data?.data,
      payload.data?.results,
      payload.data?.items,
      payload.data?.rows,
      payload.data?.records
    ];

    for (const candidate of candidates) {
      if (Array.isArray(candidate)) return candidate;
    }

    return [];
  }

  function renderFields() {
    const container = $('fields');
    if (!container) return;

    container.innerHTML = state.fields.map(([key, description], index) => `
      <div class="fieldChip">
        <span class="drag">⋮⋮</span>
        <input class="fieldKey" data-index="${index}" value="${esc(key)}">
        <input class="fieldDesc" data-index="${index}" value="${esc(description)}">
        <button class="removeField" data-index="${index}" type="button" aria-label="Remove field">×</button>
      </div>
    `).join('');

    container.querySelectorAll('.fieldKey, .fieldDesc').forEach((input) => {
      input.addEventListener('input', () => {
        const index = Number(input.dataset.index);
        if (!Number.isInteger(index) || !state.fields[index]) return;
        state.fields[index][input.classList.contains('fieldKey') ? 0 : 1] = input.value;
      });
    });

    container.querySelectorAll('.removeField').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.index);
        if (!Number.isInteger(index)) return;
        state.fields.splice(index, 1);
        renderFields();
        log(`Schema field ${index + 1} removed.`);
      });
    });
  }

  function renderRows(rows) {
    state.rows = Array.isArray(rows) ? rows : [];
    state.columns = [...new Set(state.rows.flatMap((row) => Object.keys(row || {})))];
    if (!state.columns.length) {
      state.columns = state.fields.map(([key]) => key.trim()).filter(Boolean);
    }

    const table = $('resultTable');
    if (table) {
      const head = table.querySelector('thead');
      const body = table.querySelector('tbody');
      if (head) {
        head.innerHTML = `<tr>${state.columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr>`;
      }
      if (body) {
        body.innerHTML = state.rows.length
          ? state.rows.map((row) => `<tr>${state.columns.map((column) => {
              const raw = row?.[column];
              const value = Array.isArray(raw) ? raw.join(', ') : raw ?? '';
              return `<td>${esc(value)}</td>`;
            }).join('')}</tr>`).join('')
          : '<tr><td class="empty">Run a scraper to populate results.</td></tr>';
      }
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
    } catch {
      // localStorage may be blocked; the live page still works.
    }
  }

  function auditRows(rows = state.rows) {
    const required = state.fields.map(([key]) => key.trim()).filter(Boolean);
    const data = Array.isArray(rows) ? rows : [];
    const checks = required.map((key) => {
      let missing = 0;
      for (const row of data) {
        const value = row?.[key];
        const empty = value === null || value === undefined ||
          (typeof value === 'string' && !value.trim()) ||
          (Array.isArray(value) && value.length === 0);
        if (empty) missing += 1;
      }
      const ratio = data.length ? missing / data.length : 1;
      return {
        key,
        missing,
        ratio,
        ok: data.length > 0 && state.columns.includes(key) && ratio < 0.3
      };
    });

    const coverage = checks.length
      ? checks.filter((check) => check.ok).length / checks.length
      : 0;
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
    const drift = checks.some((check) => !check.ok);

    if ($('healthScore')) $('healthScore').textContent = score;
    if ($('healthBig')) $('healthBig').textContent = score;
    if ($('rowMetric')) $('rowMetric').textContent = state.rows.length;
    if ($('fieldMetric')) $('fieldMetric').textContent = state.columns.length;
    if ($('driftMetric')) $('driftMetric').textContent = checks.filter((check) => !check.ok).length;

    if ($('healthSummary')) {
      $('healthSummary').textContent = score >= 85
        ? 'Healthy extraction. Schema and completeness look stable.'
        : score >= 60
          ? 'Extraction needs attention. Review flagged fields.'
          : 'Extraction is unhealthy. Trigger self-heal before trusting downstream data.';
    }

    if ($('fieldHealth')) {
      $('fieldHealth').innerHTML = checks.length
        ? checks.map((check) => `
          <div class="fieldHealthRow">
            <span>
              <b>${esc(check.key)}</b>
              <small>${check.missing}/${state.rows.length} empty · ${Math.round(check.ratio * 100)}% missing</small>
            </span>
            <strong class="${check.ok ? 'ok' : 'bad'}">${check.ok ? 'HEALTHY' : 'DRIFT'}</strong>
          </div>
        `).join('')
        : '<div class="empty">No requested fields.</div>';
    }

    if ($('reliabilityState')) {
      $('reliabilityState').textContent = drift ? 'DRIFT DETECTED' : 'HEALTHY';
      $('reliabilityState').className = `badge ${drift ? 'bad' : 'ok'}`;
    }
    if ($('reliabilityRun')) $('reliabilityRun').textContent = label;
    updateTimeline(drift ? 1 : 0);
    return result;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: 'no-store',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });

    let body = {};
    try {
      body = await response.json();
    } catch {
      // Preserve status information for non-JSON failures.
    }

    if (!response.ok) {
      const detail = body?.error || body?.message || `Request failed (${response.status})`;
      throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
    }
    return body;
  }

  async function loadConfiguredCollector(silent = false) {
    try {
      const result = await api('/api/collector');
      if (result.collectorId) {
        state.collectorId = result.collectorId;
        if ($('collectorId') && !$('collectorId').value.trim()) {
          $('collectorId').value = result.collectorId;
        }
        if ($('collectorHint')) {
          $('collectorHint').textContent = `Configured collector available: ${result.collectorId}`;
        }
        if (!silent) log(`Configured collector available: ${result.collectorId}`);
        return result.collectorId;
      }
      if ($('collectorHint')) {
        $('collectorHint').textContent = 'No default collector configured. New collector mode is ready.';
      }
    } catch (error) {
      if (!silent) log(`Collector discovery: ${error.message}`);
      if ($('collectorHint')) {
        $('collectorHint').textContent = 'Collector discovery unavailable. You can still create a new collector.';
      }
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
    const collectionDescription = getCollectionDescription();
    log('Creating a new Bright Data collector with full-pagination collection…');
    const created = await api('/api/collector', {
      method: 'POST',
      body: JSON.stringify({
        url,
        description: collectionDescription,
        name: `nexus-${Date.now()}`
      })
    });

    if (!created.collectorId) {
      throw new Error('Bright Data did not return a collector ID.');
    }

    state.collectorId = created.collectorId;
    if ($('collectorId')) $('collectorId').value = created.collectorId;
    log(`Collector created: ${created.collectorId}`);
    log('Pagination policy: no artificial page cap; continue until the source is exhausted.');
    await waitCollector(created.collectorId);
    log('Collector generation finished.');
    return created.collectorId;
  }

  async function pollResult(runToken) {
    if (!runToken) throw new Error('Bright Data did not return a run identifier.');

    const batch = String(runToken).startsWith('batch:');
    const endpointBase = `/api/run?responseId=${encodeURIComponent(runToken)}`;

    for (let attempt = 1; attempt <= 160; attempt += 1) {
      const result = await api(endpointBase);
      const status = String(result.status || '').toLowerCase();

      log(batch
        ? `Batch dataset pending… (${attempt}/160)`
        : `Scrape job pending… (${attempt}/160)`, attempt === 1 ? false : true);

      if (status === 'done' || status === 'completed' || status === 'success') {
        const data = normalizeRows(result.data);
        if (!data.length && result.data && typeof result.data === 'object') {
          log('Bright Data job completed but returned an unexpected empty dataset wrapper.');
        }
        return data;
      }

      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        const details = result.error_code ? ` [${result.error_code}]` : '';
        throw new Error(`${result.error || `Scrape job ${status}.`}${details}`);
      }

      await sleep(batch ? 3500 : 2500);
    }

    throw new Error(`Scrape timed out. Run token: ${runToken}`);
  }

  async function runOne(collectorId, url) {
    log(`Starting scrape: ${url}`);
    const started = await api('/api/run', {
      method: 'POST',
      body: JSON.stringify({ collectorId, url })
    });
    const runToken = started.responseId || started.collectionId;
    if (!runToken) throw new Error('Bright Data returned no run identifier.');
    log(`Bright Data accepted ${started.mode || 'scrape'} job.`);
    return pollResult(runToken);
  }

  async function runScraper() {
    const targets = getUrls();
    const description = $('description')?.value.trim() || getSchemaDescription();
    const newCollector = wantsNewCollector();
    let collectorId = $('collectorId')?.value.trim() || state.collectorId;

    if (!targets.length) return toast('Add at least one public URL.');
    if (!description) return toast('Describe what you want to extract.');

    const button = $('runBtn');
    if (button) button.disabled = true;
    setStatus('RUNNING', true);
    log('Starting flexible scraper…', true);

    try {
      if (state.mode === 'create') {
        if (!newCollector) throw new Error('Select Auto-create new collector to use Create only mode.');
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

      if (health.checks.some((check) => !check.ok)) {
        if ($('healState')) {
          $('healState').textContent = 'DRIFT DETECTED';
          $('healState').className = 'badge bad';
        }
        if ($('healPrompt')) {
          $('healPrompt').value = `Repair collector ${collectorId}. Fields with extraction gaps: ${health.checks.filter((check) => !check.ok).map((check) => check.key).join(', ')}. Preserve schema: ${getSchemaDescription()}.`;
        }
      }

      $('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    log(`Reliability audit complete · ${state.rows.length} rows · ${result.checks.filter((check) => !check.ok).length} drifted fields`);
    $('health')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

    const target = state.fields.map(([key]) => key.trim()).find((key) => key && state.columns.includes(key)) || state.columns[0];
    state.rows = state.rows.map((row, index) => ({ ...row, [target]: index === 0 ? row[target] : null }));
    renderRows(state.rows);
    const result = renderHealth(auditRows(state.rows), 'Simulated extraction drift');
    const check = result.checks.find((item) => item.key === target);

    if ($('healState')) {
      $('healState').textContent = 'DRIFT DETECTED';
      $('healState').className = 'badge bad';
    }
    if ($('healPrompt')) {
      const collector = state.collectorId || $('collectorId')?.value.trim() || '(current collector)';
      $('healPrompt').value = `Field “${target}” is empty in ${check?.missing || 0}/${state.rows.length} rows. Repair collector ${collector} while preserving schema: ${getSchemaDescription()}.`;
    }

    log(`SIMULATED DRIFT · ${target}`);
    updateTimeline(1);
    $('heal')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function restoreClean() {
    if (!state.lastGoodRows.length) return toast('No clean baseline exists yet.');
    state.rows = JSON.parse(JSON.stringify(state.lastGoodRows));
    renderRows(state.rows);
    renderHealth(auditRows(state.rows), 'Restored clean baseline');
    if ($('healState')) {
      $('healState').textContent = 'WAITING';
      $('healState').className = 'badge';
    }
    log('Restored clean dataset.');
  }

  async function heal() {
    const collectorId = $('collectorId')?.value.trim() || state.collectorId;
    const prompt = $('healPrompt')?.value.trim();
    if (!collectorId) return toast('No collector selected.');
    if (!prompt) return toast('Describe what broke.');

    $('healBtn').disabled = true;
    $('approveBtn').disabled = true;
    setStatus('HEALING', true);
    if ($('healState')) {
      $('healState').textContent = 'HEALING';
      $('healState').className = 'badge warn';
    }
    updateTimeline(2);
    log(`Triggering self-heal for ${collectorId}…`);

    try {
      const started = await api('/api/heal', {
        method: 'POST',
        body: JSON.stringify({ collectorId, prompt })
      });
      if ($('healPreview')) $('healPreview').textContent = JSON.stringify(started, null, 2);
      const status = String(started.status || 'RUNNING').toUpperCase();
      if ($('healState')) {
        $('healState').textContent = status;
        $('healState').className = 'badge warn';
      }
      $('approveBtn').disabled = false;
      log(`SELF-HEAL ${status} · review the repair before approval.`);
    } catch (error) {
      if ($('healState')) {
        $('healState').textContent = 'ERROR';
        $('healState').className = 'badge bad';
      }
      log(`HEAL ERROR · ${error.message}`);
      toast(error.message);
    } finally {
      $('healBtn').disabled = false;
    }
  }

  async function approve() {
    const collectorId = $('collectorId')?.value.trim() || state.collectorId;
    if (!collectorId) return toast('No collector selected.');

    $('approveBtn').disabled = true;
    try {
      const result = await api('/api/heal', {
        method: 'PUT',
        body: JSON.stringify({ collectorId })
      });
      if ($('healPreview')) $('healPreview').textContent = JSON.stringify(result, null, 2);
      if ($('healState')) {
        $('healState').textContent = result.status || 'APPROVED';
        $('healState').className = 'badge ok';
      }
      updateTimeline(3);
      log('Repair approved. Re-run the collector to verify recovery.');
    } catch (error) {
      $('approveBtn').disabled = false;
      toast(error.message);
      log(`APPROVE ERROR · ${error.message}`);
    }
  }

  function download(name, text, type) {
    const url = URL.createObjectURL(new Blob([text], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function csv() {
    if (!state.rows.length) return toast('No data to export.');
    const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const lines = [
      state.columns.map(escapeCsv).join(','),
      ...state.rows.map((row) => state.columns.map((column) => {
        const raw = row?.[column];
        return escapeCsv(Array.isArray(raw) ? raw.join('; ') : raw ?? '');
      }).join(','))
    ];
    download('nexus-radar.csv', lines.join('\n'), 'text/csv');
  }

  function bind() {
    if (state.bindingComplete) return;
    state.bindingComplete = true;

    $('runBtn')?.addEventListener('click', runScraper);
    $('auditBtn')?.addEventListener('click', auditReliability);
    $('driftBtn')?.addEventListener('click', simulateDrift);
    $('restoreBtn')?.addEventListener('click', restoreClean);
    $('healBtn')?.addEventListener('click', heal);
    $('approveBtn')?.addEventListener('click', approve);

    $('addField')?.addEventListener('click', () => {
      const raw = $('newField')?.value.trim();
      if (!raw) return toast('Enter a field name.');
      const [key, ...description] = raw.split('|').map((value) => value.trim());
      if (!key) return toast('Enter a field name.');
      state.fields.push([key, description.join(' | ') || 'Requested extraction field']);
      $('newField').value = '';
      renderFields();
      log(`Added schema field: ${key}`);
    });

    $('exampleAmazon')?.addEventListener('click', () => {
      $('urls').value = 'https://books.toscrape.com/';
      $('description').value = 'Extract one row per book with title, price, availability, rating, category, and product URL. Follow all available pagination until exhausted.';
      log('Loaded e-commerce example with full-pagination collection.');
    });

    $('exampleDocs')?.addEventListener('click', () => {
      $('urls').value = 'https://example.com/docs';
      $('description').value = 'Extract document title, section heading, summary, author and canonical URL. Follow all available pagination until exhausted.';
      log('Loaded documentation example with full-pagination collection.');
    });

    $('clearUrls')?.addEventListener('click', () => {
      $('urls').value = '';
      log('Target URLs cleared.');
    });

    document.querySelectorAll('.mode').forEach((button) => {
      button.addEventListener('click', () => {
        document.querySelectorAll('.mode').forEach((item) => item.classList.remove('active'));
        button.classList.add('active');
        state.mode = button.dataset.mode || 'run';
        if ($('runBtn')) $('runBtn').textContent = state.mode === 'create' ? '＋ Create collector' : '⌁ Create & run scraper';
        log(`Mode: ${state.mode}`);
      });
    });

    $('reuseCollector')?.addEventListener('change', () => {
      const reuse = $('reuseCollector').checked;
      if ($('collectorHint')) {
        $('collectorHint').textContent = reuse
          ? 'Reuse mode active. Enter or keep the existing collector ID.'
          : 'New collector mode is active. A fresh Bright Data collector will be created.';
      }
      if (reuse && !$('collectorId')?.value.trim()) loadConfiguredCollector();
    });

    $('autoCreate')?.addEventListener('change', () => {
      if ($('collectorHint')) {
        $('collectorHint').textContent = $('autoCreate').checked
          ? 'New collector mode is active. A fresh Bright Data collector will be created.'
          : 'Reuse mode active. Enter an existing collector ID.';
      }
    });

    $('viewTable')?.addEventListener('click', () => {
      $('tableWrap')?.classList.remove('hidden');
      $('jsonView')?.classList.add('hidden');
      $('viewTable')?.classList.add('active');
      $('viewJson')?.classList.remove('active');
    });

    $('viewJson')?.addEventListener('click', () => {
      $('tableWrap')?.classList.add('hidden');
      $('jsonView')?.classList.remove('hidden');
      $('viewJson')?.classList.add('active');
      $('viewTable')?.classList.remove('active');
    });

    $('downloadCsv')?.addEventListener('click', csv);
    $('downloadJson')?.addEventListener('click', () => {
      if (!state.rows.length) return toast('No data to export.');
      download('nexus-radar.json', JSON.stringify(state.rows, null, 2), 'application/json');
    });

    $('copyLog')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText($('log')?.textContent || '');
        toast('Activity copied.');
      } catch {
        toast('Clipboard access unavailable.');
      }
    });

    document.querySelectorAll('.navlinks a[href^="#"]').forEach((link) => {
      link.addEventListener('click', (event) => {
        const target = document.querySelector(link.getAttribute('href'));
        if (target) {
          event.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  function init() {
    bind();
    renderFields();
    renderRows([]);
    renderHealth(auditRows([]), 'Waiting for a scrape');
    if ($('approveBtn')) $('approveBtn').disabled = true;
    loadConfiguredCollector(true);
    log('All workspace controls initialized.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
