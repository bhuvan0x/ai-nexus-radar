const BASE = 'https://api.brightdata.com';

function key() {
  if (!process.env.BRIGHTDATA_API_KEY) {
    throw new Error('BRIGHTDATA_API_KEY is not configured in Vercel.');
  }
  return process.env.BRIGHTDATA_API_KEY;
}

function stringifyError(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (value instanceof Error) return value.message;
  if (typeof value === 'object') {
    for (const key of ['message', 'error', 'detail', 'description', 'reason', 'code']) {
      if (value[key]) {
        const nested = stringifyError(value[key]);
        if (nested) return nested;
      }
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    const message = stringifyError(data?.error || data?.message || data?.detail || data?.raw) || `Bright Data HTTP ${res.status}`;
    const error = new Error(`${message} [HTTP ${res.status}]`);
    error.status = res.status;
    error.details = data;
    error.code = typeof data?.code === 'string' ? data.code : undefined;
    throw error;
  }

  return data;
}

function rows(data) {
  if (Array.isArray(data)) return data;
  return data?.data || data?.results || data?.items || data?.rows || data?.records || [];
}

module.exports = { request, rows, stringifyError };
