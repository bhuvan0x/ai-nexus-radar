/**
 * AI-Nexus Radar — Collector Client
 * Bright Data collector -> normalization -> health-aware pulse scoring.
 *
 * Environment:
 *   BRIGHTDATA_API_KEY  required for live requests
 *   COLLECTOR_ID        defaults to c_msyndhlihcuensmoe
 *   TARGET_URL          defaults to https://www.ycombinator.com/jobs
 *   MAX_RETRIES         defaults to 4
 */

const COLLECTOR_ID = process.env.COLLECTOR_ID || "c_msyndhlihcuensmoe";
const TARGET_URL = process.env.TARGET_URL || "https://www.ycombinator.com/jobs";
const MAX_RETRIES = Number(process.env.MAX_RETRIES || 4);
const BRIGHT_BASE = "https://api.brightdata.com/api/v1";

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
  return raw?.data || raw?.results || raw?.items || [];
}

async function fetchScrape(collectorId, url, maxRetries = MAX_RETRIES) {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) {
    throw new Error("BRIGHTDATA_API_KEY is not configured on the server.");
  }

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${BRIGHT_BASE}/scraper`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({ collector_id: collectorId, url })
      });

      if (res.ok) return res.json();

      const body = await res.text().catch(() => "");
      const retryable = [408, 425, 429, 500, 502, 503, 504].includes(res.status);
      lastError = new Error(`Bright Data scrape failed (${res.status}): ${body.slice(0, 500)}`);

      if (!retryable || attempt === maxRetries) throw lastError;

      const backoff = Math.min(1000 * 2 ** attempt, 30000);
      const jitter = Math.floor(Math.random() * 500);
      console.warn(`Retryable scrape error ${res.status}; retrying in ${backoff + jitter}ms (${attempt + 1}/${maxRetries})`);
      await sleep(backoff + jitter);
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) throw error;
      if (!/fetch|network|timed out|failed|ECONN|socket/i.test(error.message)) throw error;
      const backoff = Math.min(1000 * 2 ** attempt, 30000) + Math.floor(Math.random() * 500);
      await sleep(backoff);
    }
  }

  throw lastError || new Error("Unknown scrape error");
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
  const raw = await fetchScrape(collectorId, targetUrl, options.maxRetries ?? MAX_RETRIES);
  const jobs = unwrapRows(raw);
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
  hasValue,
  isAITagged,
  parsePostedDate,
  unwrapRows
};
