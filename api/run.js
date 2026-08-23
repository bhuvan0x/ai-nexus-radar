const { request, rows } = require('./_bright');

function isRealtimePageLimitError(error) {
  const message = JSON.stringify(error?.details || '') + ' ' + String(error?.message || '');
  return error?.status === 400 && /too_many_pages|realtime job limit|real-time job limit|exceeded.*pages|pages.*exceeded/i.test(message);
}

async function triggerBatch(collectorId, url) {
  const response = await request(
    `/dca/trigger?collector=${encodeURIComponent(collectorId)}&queue_next=1`,
    {
      method: 'POST',
      body: JSON.stringify([{ url }])
    }
  );

  const responseId = response.response_id || response.responseId || response.id;
  if (!responseId) {
    throw new Error('Bright Data accepted the batch job but returned no response ID.');
  }

  return responseId;
}

module.exports = async function (req, res) {
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
          {
            method: 'POST',
            body: JSON.stringify({ url })
          }
        );

        return res.status(202).json({
          responseId: result.response_id,
          status: 'pending',
          mode: 'realtime',
          collectorId,
          url
        });
      } catch (error) {
        // Bright Data's realtime collector has a 51-page execution limit.
        // Large paginated jobs must be queued through the batch endpoint.
        if (isRealtimePageLimitError(error)) {
          const responseId = await triggerBatch(collectorId, url);
          return res.status(202).json({
            responseId,
            status: 'pending',
            mode: 'batch',
            collectorId,
            url,
            message: 'Realtime page limit detected; switched automatically to batch mode.'
          });
        }

        // Preserve the older fallback for other Bright Data realtime/batch errors.
        const message = String(error.message || '');
        if (error.status === 400 && /batch job|real-time scraper|trigger_immediate/i.test(message)) {
          const responseId = await triggerBatch(collectorId, url);
          return res.status(202).json({
            responseId,
            status: 'pending',
            mode: 'batch',
            collectorId,
            url,
            message: 'Realtime execution was unavailable; switched to batch mode.'
          });
        }

        throw error;
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
      code: 'BRIGHTDATA_RUN_ERROR'
    });
  }
};
