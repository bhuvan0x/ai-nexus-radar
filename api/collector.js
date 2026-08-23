const { request, stringifyError } = require('./_bright');

const QUOTA_HINT = /custom collectors|collector limit|trial/i;
const ID_RE = /^[A-Za-z0-9_-]{3,128}$/;

function validId(value) {
  const id = String(value || '').trim();
  return ID_RE.test(id) ? id : '';
}

module.exports = async function handler(req, res) {
  if (!process.env.BRIGHTDATA_API_KEY) {
    return res.status(503).json({ error: 'Bright Data is not configured.', code: 'MISSING_API_KEY' });
  }

  try {
    if (req.method === 'POST') {
      const { url, description, name } = req.body || {};
      if (!url || !description) return res.status(400).json({ error: 'url and description are required.', code: 'INVALID_INPUT' });

      let parsed;
      try { parsed = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.', code: 'INVALID_URL' }); }
      if (!/^https?:$/.test(parsed.protocol)) return res.status(400).json({ error: 'Only HTTP(S) URLs are supported.', code: 'INVALID_URL_PROTOCOL' });
      if (String(description).length > 5000) return res.status(400).json({ error: 'description must be 5000 characters or fewer.', code: 'DESCRIPTION_TOO_LONG' });

      let template;
      try {
        template = await request('/dca/collector', {
          method: 'POST',
          body: JSON.stringify({
            name: String(name || `nexus-${Date.now()}`).slice(0, 100),
            deliver: { type: 'webhook', endpoint: 'https://example.com/webhook', filename: { template: 'data', extension: 'json' } }
          })
        });
      } catch (error) {
        const msg = String(error.message || '');
        if (error.status === 400 && QUOTA_HINT.test(msg)) {
          return res.status(402).json({
            error: 'Your Bright Data trial has no custom collector slots left.',
            code: 'CUSTOM_COLLECTOR_QUOTA',
            detail: msg,
            action: 'Reuse an existing collector or ask Bright Data/hackathon support to increase your collector allowance.'
          });
        }
        throw error;
      }

      const collectorId = validId(template?.id);
      if (!collectorId) throw new Error('Bright Data did not return a valid collector ID.');

      await request(`/dca/collectors/${encodeURIComponent(collectorId)}/automate_template`, {
        method: 'POST',
        body: JSON.stringify({ description: String(description).slice(0, 5000), urls: [parsed.toString()] })
      });

      return res.status(202).json({ collectorId, status: 'running', viewUrl: `https://brightdata.com/cp/scrapers/${collectorId}` });
    }

    if (req.method === 'GET') {
      const id = validId(req.query?.collectorId || process.env.COLLECTOR_ID);
      if (!id) return res.status(200).json({ collectorId: null, status: 'unconfigured' });

      try {
        const progress = await request(`/dca/collectors/${encodeURIComponent(id)}/automate_template/progress`);
        return res.status(200).json({ collectorId: id, status: progress?.status || 'running', progress, viewUrl: `https://brightdata.com/cp/scrapers/${id}` });
      } catch (error) {
        // An existing collector may be usable even when it has no active automation-generation job.
        if ([400, 404].includes(error.status)) {
          return res.status(200).json({ collectorId: id, status: 'available', progress: null, viewUrl: `https://brightdata.com/cp/scrapers/${id}` });
        }
        throw error;
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(error.status && error.status < 500 ? error.status : 502).json({ error: stringifyError(error) || 'Collector operation failed.', code: error.code || 'BRIGHTDATA_ERROR' });
  }
};
