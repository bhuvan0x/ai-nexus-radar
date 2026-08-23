const { request, rows, stringifyError } = require('./_bright');

function responseIdFrom(payload) {
  return payload?.response_id || payload?.responseId || payload?.id || payload?.job_id || payload?.jobId || '';
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
    payload.result,
    payload.data?.data,
    payload.data?.results,
    payload.data?.items,
    payload.data?.rows,
    payload.data?.records,
    payload.data?.dataset,
    payload.result?.data,
    payload.result?.results
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
  }

  return rows(payload);
}

function resultFailure(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const code = String(payload.error_code || payload.code || '').toLowerCase();
  const message = stringifyError(payload.error || payload.message || payload.detail || '');
  if (!code && !message) return null;
  if (/pending|running|processing|queued|started|in_progress|building/i.test(message)) return null;
  if (code === 'too_many_pages' || /too many pages|exceeded realtime job limit|trial.*queue/i.test(message)) {
    return {
      error: 'This Bright Data collector exceeded the realtime page limit. Use a smaller pagination target or a collector/account that supports batch execution.',
      error_code: code || 'too_many_pages'
    };
  }
  if (['failed', 'error', 'cancelled', 'canceled', 'job_failed'].includes(code)) {
    return { error: message || 'Bright Data reported that the scraper failed.', error_code: code };
  }
  return null;
}

async function triggerRealtime(collectorId, url) {
  const payload = await request(
    `/dca/trigger_immediate?collector=${encodeURIComponent(collectorId)}`,
    { method: 'POST', body: JSON.stringify({ url }) }
  );

  const responseId = responseIdFrom(payload);
  if (!responseId) {
    throw new Error(`Bright Data accepted the scrape request but returned no response ID: ${JSON.stringify(payload)}`);
  }

  return responseId;
}

async function readResult(responseId) {
  const payload = await request(`/dca/get_result?response_id=${encodeURIComponent(responseId)}`);
  const failure = resultFailure(payload);
  if (failure) throw Object.assign(new Error(failure.error), { code: failure.error_code });

  const data = normalizeRows(payload);
  if (data.length) return { status: 'done', data, rowCount: data.length };

  const status = String(payload?.status || payload?.state || '').toLowerCase();
  if (payload?.pending === true || ['pending', 'queued', 'running', 'processing', 'started', 'in_progress'].includes(status)) {
    return { status: 'pending', data: [] };
  }

  // Keep polling for lifecycle-only payloads instead of declaring false success.
  if (!status) return { status: 'pending', data: [] };
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
    throw new Error(stringifyError(payload?.error || payload?.message || payload?.status) || 'Bright Data scraper failed.');
  }

  return { status: 'empty', data: [], rowCount: 0 };
}

module.exports = async function handler(req, res) {
  if (!process.env.BRIGHTDATA_API_KEY) {
    return res.status(503).json({ error: 'Bright Data is not configured.', code: 'MISSING_API_KEY' });
  }

  try {
    if (req.method === 'POST') {
      const { collectorId, url } = req.body || {};
      if (!collectorId || !url) return res.status(400).json({ error: 'collectorId and url are required.', code: 'INVALID_INPUT' });

      let parsed;
      try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.', code: 'INVALID_URL' }); }
      if (!/^https?:$/.test(parsed.protocol)) return res.status(400).json({ error: 'Only HTTP(S) URLs are supported.', code: 'INVALID_URL_PROTOCOL' });

      const responseId = await triggerRealtime(collectorId, parsed.toString());
      return res.status(202).json({ responseId, status: 'pending', mode: 'realtime', collectorId, url: parsed.toString() });
    }

    if (req.method === 'GET') {
      const responseId = String(req.query?.responseId || '').trim();
      if (!responseId) return res.status(400).json({ error: 'responseId is required.', code: 'INVALID_INPUT' });

      try {
        const result = await readResult(responseId);
        if (result.status === 'empty') {
          return res.status(200).json({ status: 'empty', mode: 'realtime', data: [], rowCount: 0, message: 'Bright Data finished without records.' });
        }
        return res.status(200).json({ status: result.status, mode: 'realtime', data: result.data, rowCount: result.rowCount || 0 });
      } catch (error) {
        if (error.status === 202) return res.status(200).json({ status: 'pending', mode: 'realtime' });
        if (error.status === 404) return res.status(404).json({ status: 'missing', mode: 'realtime', error: 'Bright Data no longer has this response ID.', code: 'RESPONSE_NOT_FOUND' });
        throw error;
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.', code: 'METHOD_NOT_ALLOWED' });
  } catch (error) {
    console.error(error);
    return res.status(error.status && error.status < 500 ? error.status : 502).json({
      error: stringifyError(error) || 'Bright Data request failed.',
      error_code: error.code || error.details?.error_code,
      code: error.code === 'too_many_pages' ? 'TOO_MANY_PAGES' : 'BRIGHTDATA_RUN_ERROR'
    });
  }
};
