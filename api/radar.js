const { collectRadarData } = require("../src/nexus-radar");

const DEMO_CACHE_MS = 30_000;
const ALLOWED_FIELDS = [
  "company_name",
  "job_title",
  "salary_range",
  "tech_stack_tags",
  "posted_date"
];
let cache = { key: "", expiresAt: 0, data: null };

function normalizeFields(input) {
  const raw = Array.isArray(input) ? input : typeof input === "string" ? input.split(",") : ALLOWED_FIELDS;
  const fields = [...new Set(raw.map(value => String(value).trim()).filter(Boolean))];
  if (!fields.length) return ALLOWED_FIELDS;
  return fields.filter(field => ALLOWED_FIELDS.includes(field));
}

function selectFields(result, fields) {
  return (result.enriched || []).map(job => {
    const selected = {};
    for (const field of fields) selected[field] = job[field] ?? null;
    selected.ai_related = job.ai_related;
    return selected;
  });
}

async function handler(req, res) {
  if (!process.env.BRIGHTDATA_API_KEY) {
    return res.status(503).json({
      live: false,
      error: "Live radar is not configured. Add BRIGHTDATA_API_KEY to the Vercel project environment."
    });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  let fields = ALLOWED_FIELDS;
  if (req.method === "POST") {
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }
    fields = normalizeFields(body?.fields);
  }

  const key = fields.join("|");
  const now = Date.now();
  if (cache.data && cache.key === key && cache.expiresAt > now) {
    return res.status(200).json({ ...cache.data, cached: true });
  }

  try {
    const data = await collectRadarData();
    const payload = {
      live: true,
      cached: false,
      collectedAt: data.collectedAt,
      collectorId: data.collectorId,
      targetUrl: data.targetUrl,
      selectedFields: fields,
      jobs: selectFields(data.result, fields),
      pulse: data.result.pulse,
      level: data.result.level,
      breakdown: data.result.breakdown,
      totals: data.result.totals
    };

    cache = { key, data: payload, expiresAt: now + DEMO_CACHE_MS };
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    return res.status(200).json(payload);
  } catch (error) {
    console.error("Radar API error:", error);
    return res.status(502).json({
      live: false,
      error: "The live collector could not be reached.",
      detail: process.env.NODE_ENV === "development" ? error.message : undefined
    });
  }
}

module.exports = handler;
module.exports.ALLOWED_FIELDS = ALLOWED_FIELDS;
module.exports.normalizeFields = normalizeFields;
module.exports.selectFields = selectFields;
