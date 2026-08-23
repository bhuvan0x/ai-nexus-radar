const { request, rows } = require('./_bright');

function isBatchFallbackError(error) {
  const code = String(error?.code || error?.details?.error_code || error?.details?.code || '').toLowerCase();
  const message = String(error?.message || '');
  return code === 'too_many_pages' || /too_many_pages|exceeded realtime job limit|more than 51 pages|batch job|real-time scraper|trigger_immediate/i.test(message);
}

function responseIdFrom(payload) {
  return payload?.response_id || payload?.responseId || payload?.id || payload?.job_id || payload?.jobId || '';
}

module.exports = async function(req, res) {
  if (!process.env.BRIGHTDATA_API_KEY) {
    return res.status(503).json({ error: 'Bright Data is not configured.' });
  }

  try {
    if (req.method === 'POST') {
      const { collectorId, url } = req.body || {};
      if (!collectorId || !url) {
        return res.status(400).json({ error: 'collectorId and url are required.' });
      }

      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: 'Invalid URL.' });
      }
      if (!/^https?:$/.test(parsedUrl.protocol)) {
        return res.status(400).json({ error: 'Only HTTP(S) URLs are supported.' });
      }

      try {
        const result = await request(
          `/dca/trigger_immediate?collector=${encodeURIComponent(collectorId)}`,
          { method: 'POST', body: JSON.stringify({ url }) }
        );

        const responseId = responseIdFrom(result);
        if (!responseId) {
          throw new Error('Bright Data accepted the realtime request but returned no response ID.');
        }

        return res.status(202).json({
          responseId,
          status: 'pending',
          mode: 'realtime',
          collectorId,
          url
        });
      } catch (error) {
        if (!isBatchFallbackError(error)) throw error;

        console.warn('Realtime page limit reached; retrying collector in batch mode.', {
          collectorId,
          url,
          code: error?.code || error?.details?.error_code
        });

        const batch = await request(
          `/dca/trigger?collector=${encodeURIComponent(collectorId)}&queue_next=1`,
          { method: 'POST', body: JSON.stringify([{ url }]) }
        );

        const responseId = responseIdFrom(batch);
        if (!responseId) {
          throw new Error('Bright Data accepted the batch job but returned no response ID.');
        }

        return res.status(202).json({
          responseId,
          status: 'pending',
          mode: 'batch',
          fallbackReason: 'realtime_page_limit',
          collectorId,
          url
        });
      }
    }

    if (req.method === 'GET') {
      const id = String(req.query?.responseId || '');
      if (!id) return res.status(400).json({ error: 'responseId is required.' });

      try {
        const result = await request(`/dca/get_result?response_id=${encodeURIComponent(id)}`);
        if (
          result?.pending === true ||
          /pending|running|processing|queued/i.test(String(result?.status || ''))
        ) {
          return res.status(200).json({ status: 'pending' });
        }

        return res.status(200).json({ status: 'done', data: rows(result) });
      } catch (error) {
        if (error.status === 202 || error.status === 404) {
          return res.status(200).json({ status: 'pending' });
        }
        throw error;
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  } catch (error) {
    console.error(error);
    return res.status(error.status && error.status < 500 ? error.status : 502).json({
      error: error.message || 'Bright Data request failed.',
      error_code: error.code || error.details?.error_code || undefined,
      details: error.details || undefined,
      code: 'BRIGHTDATA_RUN_ERROR'
    });
  }
};
