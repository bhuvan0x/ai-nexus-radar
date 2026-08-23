const { request, rows } = require('./_bright');

function responseIdFrom(payload) {
  return payload?.collection_id || payload?.response_id || payload?.responseId || payload?.id || payload?.job_id || payload?.jobId || '';
}

function isBatchUnsupported(error) {
  const code = String(error?.code || error?.details?.error_code || error?.details?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return /cannot trigger a batch job with a real-time scraper|batch.*not.*support|unsupported.*batch|invalid.*batch|unknown.*endpoint|method.*not.*allowed/.test(message) ||
    ['batch_not_supported', 'unsupported_batch'].includes(code);
}

function extractResultError(data) {
  if (!Array.isArray(data) || !data.length) return null;
  const failures = data.filter((item) => item && (item.error || item.error_code));
  if (!failures.length) return null;
  const first = failures[0];
  return {
    message: typeof first.error === 'string' ? first.error : JSON.stringify(first.error || {}),
    error_code: first.error_code || 'SCRAPE_INPUT_ERROR',
    failures: failures.slice(0, 10)
  };
}

async function triggerBatch(collectorId, url) {
  const result = await request(
    `/dca/trigger?collector=${encodeURIComponent(collectorId)}&queue_next=1`,
    { method: 'POST', body: JSON.stringify([{ url }]) }
  );

  const collectionId = responseIdFrom(result);
  if (!collectionId) {
    throw new Error('Bright Data accepted the batch job but returned no collection ID.');
  }

  return {
    responseId: collectionId,
    collectionId,
    status: 'pending',
    mode: 'batch',
    collectorId,
    url
  };
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

      // Prefer batch for large/paginated workloads; fall back only when the collector is realtime-only.
      try {
        const batch = await triggerBatch(collectorId, url);
        return res.status(202).json(batch);
      } catch (batchError) {
        if (!isBatchUnsupported(batchError)) throw batchError;

        const realtime = await request(
          `/dca/trigger_immediate?collector=${encodeURIComponent(collectorId)}`,
          { method: 'POST', body: JSON.stringify({ url }) }
        );

        const responseId = responseIdFrom(realtime);
        if (!responseId) {
          throw new Error('Bright Data accepted the realtime request but returned no response ID.');
        }

        return res.status(202).json({
          responseId,
          status: 'pending',
          mode: 'realtime',
          fallbackReason: 'batch_unsupported',
          collectorId,
          url
        });
      }
    }

    if (req.method === 'GET') {
      const id = String(req.query?.responseId || req.query?.collectionId || '');
      const mode = String(req.query?.mode || '').toLowerCase();
      if (!id) return res.status(400).json({ error: 'responseId is required.' });

      if (mode === 'batch' || id.startsWith('j_')) {
        try {
          const result = await request(`/dca/dataset?id=${encodeURIComponent(id)}`);
          if (result?.status === 202 || result?.pending === true) {
            return res.status(200).json({ status: 'pending', mode: 'batch' });
          }
          const data = rows(result);
          const scrapeError = extractResultError(data);
          if (scrapeError) {
            return res.status(502).json({
              error: scrapeError.message,
              error_code: scrapeError.error_code,
              details: scrapeError.failures,
              code: 'BRIGHTDATA_RESULT_ERROR'
            });
          }
          return res.status(200).json({ status: 'done', mode: 'batch', data });
        } catch (error) {
          if (error.status === 202 || error.status === 404) {
            return res.status(200).json({ status: 'pending', mode: 'batch' });
          }
          throw error;
        }
      }

      try {
        const result = await request(`/dca/get_result?response_id=${encodeURIComponent(id)}`);
        if (
          result?.pending === true ||
          /pending|running|processing|queued/i.test(String(result?.status || ''))
        ) {
          return res.status(200).json({ status: 'pending', mode: 'realtime' });
        }

        const data = rows(result);
        const scrapeError = extractResultError(data);
        if (scrapeError) {
          return res.status(502).json({
            error: scrapeError.message,
            error_code: scrapeError.error_code,
            details: scrapeError.failures,
            code: 'BRIGHTDATA_RESULT_ERROR'
          });
        }

        return res.status(200).json({ status: 'done', mode: 'realtime', data });
      } catch (error) {
        if (error.status === 202 || error.status === 404) {
          return res.status(200).json({ status: 'pending', mode: 'realtime' });
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
