const BASE = 'https://api.brightdata.com';

function key() {
  if (!process.env.BRIGHTDATA_API_KEY) throw new Error('BRIGHTDATA_API_KEY is not configured in Vercel.');
  return process.env.BRIGHTDATA_API_KEY;
}

function stringifyError(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object') {
    for (const name of ['message', 'error', 'detail', 'description', 'reason', 'code']) {
      if (value[name]) {
        const nested = stringifyError(value[name]);
        if (nested) return nested;
      }
    }
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function retryableStatus(status) {
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

async function request(path, options = {}) {
  const method = String(options.method || 'GET').toUpperCase();
  // Never transparently repeat mutation requests: a timeout after POST can mean
  // Bright Data accepted the job even though the client did not receive a response.
  const maxRetries = Number.isInteger(options.maxRetries)
    ? Math.max(0, options.maxRetries)
    : method === 'GET' || method === 'HEAD' ? 2 : 0;
  const { maxRetries: _ignored, ...fetchOptions } = options;
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(`${BASE}${path}`, {
        ...fetchOptions,
        method,
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${key()}`,
          'Content-Type': 'application/json',
          ...(fetchOptions.headers || {})
        }
      });

      const text = await res.text();
      let data = {};
      try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

      if (res.ok) return data;

      const message = stringifyError(data?.error || data?.message || data?.detail || data?.raw) || `Bright Data HTTP ${res.status}`;
      const error = new Error(`${message} [HTTP ${res.status}]`);
      error.status = res.status;
      error.details = data;
      error.code = typeof data?.code === 'string' ? data.code : undefined;
      lastError = error;

      if (!retryableStatus(res.status) || attempt >= maxRetries) throw error;
    } catch (error) {
      lastError = error;
      const networkFailure = error?.name === 'AbortError' || /fetch|network|socket|ECONN|timed out/i.test(String(error?.message || ''));
      if (!networkFailure || attempt >= maxRetries) throw error;
    } finally {
      clearTimeout(timeout);
    }

    await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 5000)));
  }

  throw lastError || new Error('Bright Data request failed.');
}

function rows(data) {
  if (Array.isArray(data)) return data;
  const candidates = [data?.data, data?.results, data?.items, data?.rows, data?.records];
  return candidates.find(Array.isArray) || [];
}

module.exports = { request, rows, stringifyError };
