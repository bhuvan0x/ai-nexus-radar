/**
 * AI-Nexus Radar — Collector Client
 * Bright Data collector -> normalization -> health-aware pulse scoring.
 *
 * Environment:
 *   BRIGHTDATA_API_KEY  required for live requests
 *   COLLECTOR_ID        defaults to c_msyndhlihcuensmoe
 *   TARGET_URL          defaults to https://www.ycombinator.com/jobs
 *   MAX_RETRIES         defaults to 4
 *   SCRAPE_TIMEOUT_SEC  defaults to 45
 */

const COLLECTOR_ID = process.env.COLLECTOR_ID || "c_msyndhlihcuensmoe";
const TARGET_URL = process.env.TARGET_URL || "https://www.ycombinator.com/jobs";
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 4);
const SCRAPE_TIMEOUT_SEC = Number(process.env.SCRAPE_TIMEOUT_SEC || 45);
const BRIGHT_BASE = "https://api.brightdata.com";
const TRIGGER_PATH = "/dca/trigger_immediate";
const RESULT_PATH = "/dca/get_result";

const AI_KEYWORDS = [
  "ai", "machine learning", "ml", "llm", "langchain", "pytorch",
  "tensorflow", "openai", "anthropic", "gpt", "chatgpt", "claude",
  "copilot", "nlp", "computer vision", "generative ai", "rag",
  "agents", "autogen", "llamaindex", "transformers", "hugging face"
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function unwrapRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.results)) return raw.results;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.rows)) return raw.rows;
  return [];
}

function isPendingResult(raw) {
  if (!raw) return true;
  if (raw.pending === true) return true;
  const status = String(raw.status || raw.state || "").toLowerCase();
  return ["pending", "queued", "running", "processing", "in_progress", "started"].includes(status);
}

function isFailedResult(raw) {
  if (!raw) return false;
  if (raw.error) return true;
  const status = String(raw.status || raw.state || "").toLowerCase();
  return ["failed", "error", "cancelled", "canceled"].includes(status);
}

function buildBrightHeaders() {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    throw new Error("BRIGHTDATA_API_KEY is not configured on the server.");
  }
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

async function requestBright(path, options = {}, maxRetries = MAX_RETRIES) {
  const headers = { ...buildBrightHeaders(), ...(options.headers || {}) };
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${BRIGHT_BASE}${path}`, {
        ...options,
        headers
      });

      const text = await res.text().catch(() => "");
      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { raw: text };
        }
      }

      if (res.ok) return payload;

      const retryable = [408, 425, 429, 500, 502, 503, 504].includes(res.status);
      lastError = new Error(
        `Bright Data request failed (${res.status}): ${String(payload?.error || payload?.message || text).slice(0, 500)}`
      );

      if (!retryable || attempt === maxRetries) throw lastError;
      const backoff = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 400);
      await sleep(backoff);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      if (!/fetch|network|timed out|failed|ECONN|socket|Bright Data/i.test(error.message)) throw error;
      const backoff = Math.min(1000 * 2 ** attempt, 8000) + Math.floor(Math.random() * 400);
      await sleep(backoff);
    }
  }

  throw lastError || new Error("Unknown Bright Data error");
}

async function triggerScrape(collectorId = COLLECTOR_ID, url = TARGET_URL) {
  const payload = await requestBright(
    `${TRIGGER_PATH}?collector=${encodeURIComponent(collectorId)}`,
    {
      method: "POST",
      body: JSON.stringify({ url })
    }
  );

  if (!payload?.response_id) {
    throw new Error("Bright Data did not return a response_id for the collector run.");
  }

  return payload.response_id;
}

async function getScrapeResult(responseId) {
  return requestBright(`${RESULT_PATH}?response_id=${encodeURIComponent(responseId)}`, {
    method: "GET"
  });
}

async function fetchScrape(collectorId, url, maxRetries = MAX_RETRIES, timeoutSeconds = SCRAPE_TIMEOUT_SEC) {
  const responseId = await triggerScrape(collectorId, url);
  const deadline = Date.now() + Math.max(10, timeoutSeconds) * 1000;
  let lastPayload = null;

  while (Date.now() < deadline) {
    const payload = await getScrapeResult(responseId);
    lastPayload = payload;

    if (isFailedResult(payload)) {
      throw new Error(`Bright Data collector failed: ${String(payload?.error || payload?.message || payload?.status || "unknown error")}`);
    }

    const rows = unwrapRows(payload);
    if (rows.length > 0 || !isPendingResult(payload)) return rows;

    await sleep(2000);
  }

  const error = new Error(`Bright Data collector timed out after ${timeoutSeconds}s (response_id=${responseId}).`);
  error.responseId = responseId;
  error.lastPayload = lastPayload;
  throw error;
}

function isAITagged(tags) {
  if (!Array.isArray(tags)) return false;
  return tags.some(tag => AI_KEYWORDS.some(keyword => String(tag).toLowerCase().includes(keyword)));
}

function parsePostedDate(raw, now = Date.now()) {
  if (!raw) return null;
  const value = String(raw).trim().toLowerCase();
  const relative = value.match(/(\d+)\s*(minute|hour|day|week|month)s?/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2];
    const days = unit === "minute" ? amount / 1440 : unit === "hour" ? amount / 24 : unit === "week" ? amount * 7 : unit === "month" ? amount * 30 : amount;
    return now - days * 86400000;
  }

  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? null : parsed;
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  return String(value).trim() !== "" && String(value).trim().toLowerCase() !== "n/a";
}

function computePulse(rawJobs, now = Date.now()) {
  const jobs = Array.isArray(rawJobs) ? rawJobs : [];
  const total = jobs.length;

  if (!total) {
    return {
      pulse: 0,
      level: "LOW",
      breakdown: { aiDensity: 0, marketTransparency: 0, freshness: 0 },
      enriched: [],
      totals: { jobs: 0, aiJobs: 0, salaryJobs: 0, freshJobs: 0 }
    };
  }

  let aiCount = 0;
  let transparencyCount = 0;
  let freshCount = 0;
  const cutoff = now - 30 * 86400000;

  const enriched = jobs.map(job => {
    const tags = Array.isArray(job.tech_stack_tags) ? job.tech_stack_tags : [];
    const aiRelated = isAITagged(tags);
    const hasSalary = hasValue(job.salary_range);
    const postedTs = parsePostedDate(job.posted_date, now);
    const isRecent = Boolean(postedTs && postedTs >= cutoff);

    if (aiRelated) aiCount++;
    if (hasSalary) transparencyCount++;
    if (isRecent) freshCount++;

    return {
      ...job,
      tech_stack_tags: tags,
      ai_related: aiRelated,
      has_salary: hasSalary,
      is_recent: isRecent,
      pulse_tags: tags.filter(tag => AI_KEYWORDS.some(keyword => String(tag).toLowerCase().includes(keyword)))
    };
  });

  const aiDensity = aiCount / total;
  const marketTransparency = transparencyCount / total;
  const freshness = freshCount / total;
  const pulse = Math.round((aiDensity * 0.6 + marketTransparency * 0.2 + freshness * 0.2) * 100);
  const level = pulse >= 70 ? "HIGH" : pulse >= 40 ? "MEDIUM" : "LOW";

  return {
    pulse,
    level,
    breakdown: { aiDensity, marketTransparency, freshness },
    enriched,
    totals: { jobs: total, aiJobs: aiCount, salaryJobs: transparencyCount, freshJobs: freshCount }
  };
}

async function collectRadarData(options = {}) {
  const collectorId = options.collectorId || COLLECTOR_ID;
  const targetUrl = options.targetUrl || TARGET_URL;
  const rawJobs = options.rawJobs || await fetchScrape(collectorId, targetUrl, options.maxRetries ?? MAX_RETRIES, options.timeoutSeconds ?? SCRAPE_TIMEOUT_SEC);
  const jobs = unwrapRows(rawJobs);
  return {
    collectedAt: new Date().toISOString(),
    collectorId,
    targetUrl,
    result: computePulse(jobs),
    rawCount: jobs.length
  };
}

async function main() {
  const data = await collectRadarData();
  console.log(`Target: ${TARGET_URL}`);
  console.log(`Collector: ${COLLECTOR_ID}`);
  console.log(`Jobs: ${data.rawCount}`);
  console.log(`Pulse: ${data.result.pulse}/100 -> ${data.result.level}`);
  console.log(JSON.stringify(data.result, null, 2));
  return data;
}

if (require.main === module) {
  main().catch(error => {
    console.error("Fatal:", error.message);
    process.exit(1);
  });
}

module.exports = {
  AI_KEYWORDS,
  COLLECTOR_ID,
  TARGET_URL,
  collectRadarData,
  computePulse,
  fetchScrape,
  getScrapeResult,
  hasValue,
  isAITagged,
  parsePostedDate,
  triggerScrape,
  unwrapRows
};
