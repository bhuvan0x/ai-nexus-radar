const { request, rows, stringifyError } = require('./_bright');

function responseIdFrom(payload) {
  return payload?.collection_id || payload?.response_id || payload?.responseId || payload?.id || payload?.job_id || payload?.jobId || '';
}

function isBatchUnsupported(error) {
  const code = String(error?.code || error?.details?.error_code || error?.details?.code || '').toLowerCase();
  const message = String(error?.message || '').toLowerCase();
  return /cannot trigger a batch job with a real-time scraper|trial collectors? don't support queuing jobs|trial.*queue|queue.*not.*support|batch.*not.*support|unsupported.*batch|invalid.*batch|unknown.*endpoint|method.*not.*allowed/.test(message) || [
    'batch_not_supported', 'unsupported_batch', 'queue_not_supported', 'trial_queue_not_supported'
  ].includes(code);
}

function extractResultError(data) {
  if (!Array.isArray(data) || !data.length) return null;
  const failures = data.filter((item) => item && (item.error || item.error_code));
  if (!failures.length) return null;
  const first = failures[0];
  return {
    message: stringifyError(first.error) || 'Bright Data returned an input error.',
    error_code: first.error_code || 'SCRAPE_INPUT_ERROR',
    failures: failures.slice(0, 10)
  };
}

async function triggerBatch(collectorId, url) {
  const result = await request(
    `/dca/trigger?collector=${encodeURIComponent(collectorId)}`,
    { method: 'POST', body: JSON.stringify([{ url }]) }
  );

  const collectionId = responseIdFrom(result);
  if (!collectionId) {
    throw new Error(`Bright Data accepted the batch request but returned an unexpected payload: ${JSON.stringify(result)}`);
  }

  return {
    responseId: `batch:${collectionId}`,
    collectionId,
    status: 'pending',
    mode: 'batch',
    collectorId,
    url
  };
}

async function readBatchSnapshot(snapshotId) {
  try {
    const result = await request(`/dca/dataset?id=${encodeURIComponent(snapshotId)}`);

    // Bright Data's documented final batch response is a JSON array. Any object
    // carrying only a lifecycle status is still a poll state, including "ready".
    if (!Array.isArray(result)) {
      const status = String(result?.status || result?.state || '').toLowerCase();
      const data = rows(result);

      if (data.length) {
        const scrapeError = extractResultError(data);
        if (scrapeError) {
          return {
            status: 'error',
            mode: 'batch',
            snapshotId,
            error: scrapeError.message,
            error_code: scrapeError.error_code,
            details: scrapeError.failures
          };
        }
        return { status: 'done', mode: 'batch', snapshotId, data, rowCount: data.length, rawType: typeof result };
      }

      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        return {
          status: 'error',
          mode: 'batch',
          snapshotId,
          error: stringifyError(result?.error || result?.message || result),
          error_code: result?.error_code || 'BATCH_JOB_FAILED'
        };
      }

      // No rows + lifecycle object means the snapshot is not ready to download yet.
      return {
        status: 'pending',
        mode: 'batch',
        snapshotId,
        upstreamStatus: result?.status || result?.state || 'building'
      };
    }

    const scrapeError = extractResultError(result);
    if (scrapeError) {
      return {
        status: 'error',
        mode: 'batch',
        snapshotId,
        error: scrapeError.message,
        error_code: scrapeError.error_code,
        details: scrapeError.failures
      };
    }

    return {
      status: 'done',
      mode: 'batch',
      snapshotId,
      data: result,
      rowCount: result.length,
      rawType: 'array'
    };
  } catch (error) {
    if ([404, 425, 429, 503].includes(error.status)) {
      return { status: 'pending', mode: 'batch', snapshotId, upstreamStatus: `HTTP_${error.status}` };
    }
    throw error;
  }
}

module.exports = async function(req, res) {
  if (!process.env.BRIGHTDATA_API_KEY) return res.status(503).json({ error: 'Bright Data is not configured.' });

  try {
    if (req.method === 'POST') {
      const { collectorId, url } = req.body || {};
      if (!collectorId || !url) return res.status(400).json({ error: 'collectorId and url are required.' });

      let parsedUrl;
      try { parsedUrl = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }
      if (!/^https?:$/.test(parsedUrl.protocol)) return res.status(400).json({ error: 'Only HTTP(S) URLs are supported.' });

      try {
        return res.status(202).json(await triggerBatch(collectorId, url));
      } catch (batchError) {
        if (!isBatchUnsupported(batchError)) throw batchError;

        const realtime = await request(
          `/dca/trigger_immediate?collector=${encodeURIComponent(collectorId)}`,
          { method: 'POST', body: JSON.stringify({ url }) }
        );
        const responseId = responseIdFrom(realtime);
        if (!responseId) throw new Error('Bright Data accepted the realtime request but returned no response ID.');

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
      const token = String(req.query?.responseId || req.query?.collectionId || '');
      if (!token) return res.status(400).json({ error: 'responseId is required.' });

      if (token.startsWith('batch:')) {
        const snapshot = await readBatchSnapshot(token.slice('batch:'.length));
        if (snapshot.status === 'error') {
          return res.status(502).json({
            error: snapshot.error,
            error_code: snapshot.error_code,
            details: snapshot.details,
            code: 'BRIGHTDATA_RESULT_ERROR'
          });
        }
        return res.status(200).json(snapshot);
      }

      try {
        const result = await request(`/dca/get_result?response_id=${encodeURIComponent(token)}`);
        const data = rows(result);
        const status = String(result?.status || result?.state || '').toLowerCase();

        if (data.length) {
          const scrapeError = extractResultError(data);
          if (scrapeError) {
            return res.status(502).json({
              error: scrapeError.message,
              error_code: scrapeError.error_code,
              details: scrapeError.failures,
              code: 'BRIGHTDATA_RESULT_ERROR'
            });
          }
          return res.status(200).json({ status: 'done', mode: 'realtime', data, rowCount: data.length });
        }

        // Keep polling any lifecycle-only response. Do not turn an empty status
        // envelope into a false successful 0-row dataset.
        if (result?.pending === true || ['pending', 'running', 'processing', 'queued', 'in_progress', 'started', 'ready', 'building'].includes(status) || !status) {
          return res.status(200).json({ status: 'pending', mode: 'realtime', upstreamStatus: result?.status || 'pending' });
        }

        if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
          return res.status(502).json({
            error: stringifyError(result?.error || result?.message || result?.status || 'Bright Data realtime job failed.'),
            error_code: result?.error_code || 'REALTIME_JOB_FAILED',
            code: 'BRIGHTDATA_RESULT_ERROR'
          });
        }

        return res.status(200).json({ status: 'done', mode: 'realtime', data: [], rowCount: 0, upstreamStatus: result?.status || 'empty' });
      } catch (error) {
        if (error.status === 202) return res.status(200).json({ status: 'pending', mode: 'realtime' });
        if (error.status === 404) {
          return res.status(404).json({
            status: 'missing',
            mode: 'realtime',
            error: 'Bright Data no longer has this response ID. The job may have expired or been removed.',
            code: 'RESPONSE_NOT_FOUND'
          });
        }
        throw error;
      }
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error(error);
    return res.status(error.status && error.status < 500 ? error.status : 502).json({
      error: stringifyError(error) || 'Bright Data request failed.',
      error_code: error.code || error.details?.error_code || undefined,
      details: error.details || undefined,
      code: 'BRIGHTDATA_RUN_ERROR'
    });
  }
};
