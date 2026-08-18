/**
 * AI-Nexus Radar — Collector Client
 * ===================================
 * Consumes the Bright Data collector `c_msyndhlihcuensmoe` to scrape
 * Y Combinator's job board and transform raw results into a
 * "Sentiment Pulse" score for the hackathon dashboard.
 *
 * "A stranger could pick it up on Monday." — Spider-Sense Clean Code track
 *
 * Setup:
 *   npm init -y
 *   npm install node-fetch  (or use native fetch on Node 18+)
 *
 * Usage:
 *   node src/nexus-radar.js
 *
 * Environment:
 *   BRIGHTDATA_API_KEY  — your Bright Data API key
 *   COLLECTOR_ID        — defaults to c_msyndhlihcuensmoe
 *   TARGET_URL          — defaults to https://www.ycombinator.com/jobs
 */

const COLLECTOR_ID = process.env.COLLECTOR_ID || "c_msyndhlihcuensmoe";
const TARGET_URL   = process.env.TARGET_URL   || "https://www.ycombinator.com/jobs";
const API_KEY      = process.env.BRIGHTDATA_API_KEY;

if (!API_KEY) {
  console.error("❌  Set BRIGHTDATA_API_KEY in your environment.");
  process.exit(1);
}

const BRIGHT_BASE = "https://api.brightdata.com/api/v1";

// ---------------------------------------------------------------------------
// 1. RAW FETCH — calls the Bright Data Scraper API
// ---------------------------------------------------------------------------

async function fetchScrape(collectorId, url, maxRetries = 4) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(`${BRIGHT_BASE}/scraper`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ collector_id: collectorId, url }),
      });

      if (res.status === 429) {
        lastError = new Error(`Rate limited (429) — retry ${attempt + 1}/${maxRetries}`);
        if (attempt < maxRetries) {
          const jitter = Math.random() * 500;
          const wait = Math.min(2 ** attempt * 1000 + jitter, 30000);
          console.warn(`⚠️  Rate limited, waiting ${Math.round(wait / 1000)}s before retry ${attempt + 1}/${maxRetries}`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Bright Data scrape failed (${res.status}): ${body}`);
      }

      return res.json();
    } catch (err) {
      if (err.message.includes("429") && attempt < maxRetries) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError || new Error("Unknown fetch error");
}

// ---------------------------------------------------------------------------
// 2. PULSE ENGINE — transforms raw JSON → Sentiment Score
// ---------------------------------------------------------------------------

/**
 * Compute a "Pulse" sentiment score from the scraped job data.
 *
 * Logic:
 *   - AI Density: fraction of job postings whose tech_stack_tags include
 *     any AI-related keyword (ai, ml, llm, langchain, pytorch, tensorflow,
 *     openai, anthropic, gpt, etc.).
 *   - Salary Signal: fraction of postings that expose a salary_range.
 *   - Freshness: fraction posted within the last 30 days.
 *
 * The three sub-scores (0–1 each) are combined into a single 0–100 Pulse.
 * Thresholds:
 *   Pulse ≥ 70 → "HIGH"   (AI wave is surging)
 *   Pulse ≥ 40 → "MEDIUM" (steady activity)
 *   Pulse < 40 → "LOW"    (calm / stale)
 */
const AI_KEYWORDS = [
  "ai", "machine learning", "ml", "llm", "langchain", "pytorch",
  "tensorflow", "openai", "anthropic", "gpt", "chatgpt", "claude",
  "copilot", "summarization", "nlp", "computer vision", "image gen",
  "generative ai", "rag", "agents", "autogen", "llamaindex",
];

const ONE_MONTH_AGO = new Date();
ONE_MONTH_AGO.setDate(ONE_MONTH_AGO.getDate() - 30);

function isAITagged(tags) {
  if (!Array.isArray(tags) || tags.length === 0) return false;
  return tags.some((t) =>
    AI_KEYWORDS.some((kw) => t.toLowerCase().includes(kw))
  );
}

function parsePostedDate(raw) {
  // Bright Data often returns human-readable like "2 months", "3 days ago"
  if (!raw) return null;
  const lower = raw.toLowerCase();

  // "X days ago" → absolute timestamp
  const dayMatch = lower.match(/(\d+)\s*day/i);
  if (dayMatch) {
    const daysAgo = Number(dayMatch[1]);
    return Date.now() - daysAgo * 86400000;
  }

  // "X months ago" → approximate absolute timestamp
  const monthMatch = lower.match(/(\d+)\s*month/i);
  if (monthMatch) {
    const monthsAgo = Number(monthMatch[1]);
    return Date.now() - monthsAgo * 30 * 86400000;
  }

  // "X hours ago" → approximate
  const hourMatch = lower.match(/(\d+)\s*hour/i);
  if (hourMatch) {
    const hoursAgo = Number(hourMatch[1]);
    return Date.now() - hoursAgo * 3600000;
  }

  // try ISO date / parseable date string
  const iso = new Date(raw);
  if (!isNaN(iso.getTime())) return iso.getTime();

  return null;
}

/**
 * @param {Array<object>} rawJobs  — raw Bright Data scrape rows
 * @returns {{ pulse: number, level: string, breakdown: object, enriched: array }}
 */
function computePulse(rawJobs) {
  const total = rawJobs.length;
  if (total === 0) {
    return { pulse: 0, level: "LOW", breakdown: { aiDensity: 0, salarySignal: 0, freshness: 0 }, enriched: [] };
  }

  let aiCount = 0;
  let salaryCount = 0;
  let freshCount = 0;
  const enriched = rawJobs.map((job) => {
    const tags = job.tech_stack_tags || [];
    const hasAI = isAITagged(tags);
    if (hasAI) aiCount++;

    const hasSalary = Boolean(job.salary_range && job.salary_range.trim());
    if (hasSalary) salaryCount++;

    const postedTs = parsePostedDate(job.posted_date);
    if (postedTs && postedTs >= ONE_MONTH_AGO.getTime()) freshCount++;

    return {
      ...job,
      ai_related: hasAI,
      has_salary: hasSalary,
      is_recent: Boolean(postedTs && postedTs >= ONE_MONTH_AGO.getTime()),
      pulse_tags: tags.filter((t) => AI_KEYWORDS.some((kw) => t.toLowerCase().includes(kw))),
    };
  });

  const aiDensity  = aiCount / total;
  const salarySig  = salaryCount / total;
  const freshness  = freshCount / total;

  // Weighted composite — AI density is the primary signal for the Radar
  const pulse = Math.round(
    (aiDensity * 0.60 + salarySig * 0.20 + freshness * 0.20) * 100
  );

  const level = pulse >= 70 ? "HIGH" : pulse >= 40 ? "MEDIUM" : "LOW";

  return { pulse, level, breakdown: { aiDensity, salarySignal: salarySig, freshness }, enriched };
}

// ---------------------------------------------------------------------------
// 3. MAIN — orchestrate fetch → transform → report
// ---------------------------------------------------------------------------

async function main() {
  console.log(`🎯  Target:    ${TARGET_URL}`);
  console.log(`📡  Collector: ${COLLECTOR_ID}`);
  console.log("─".repeat(56));

  let raw;
  try {
    raw = await fetchScrape(COLLECTOR_ID, TARGET_URL);
  } catch (err) {
    console.error("Scrape request failed:", err.message);
    process.exit(1);
  }

  // Bright Data may wrap the array inside a property; unwrap gracefully.
  const jobs = Array.isArray(raw) ? raw : (raw.data || raw.results || raw.items || []);
  console.log(`📦  Raw jobs returned: ${jobs.length}`);

  const { pulse, level, breakdown, enriched } = computePulse(jobs);

  console.log("─".repeat(56));
  console.log(`📊  PULSE SCORE: ${pulse}/100  →  ${level}`);
  console.log("   Breakdown:");
  console.log(`   • AI Density : ${(breakdown.aiDensity * 100).toFixed(1)}%  (${Math.round(breakdown.aiDensity * jobs.length)} of ${jobs.length} postings)`);
  console.log(`   • Salary Sig : ${(breakdown.salarySignal * 100).toFixed(1)}%`);
  console.log(`   • Freshness  : ${(breakdown.freshness * 100).toFixed(1)}%`);
  console.log("─".repeat(56));

  // Spotlight: AI-tagged postings
  const aiJobs = enriched.filter((j) => j.ai_related);
  if (aiJobs.length) {
    console.log(`✨  AI-tagged postings (${aiJobs.length}):`);
    aiJobs.slice(0, 5).forEach((j) => {
      console.log(`   → ${j.job_title}  @  ${j.company_name || "unknown"}`);
      if (j.pulse_tags.length) console.log(`     tags: ${j.pulse_tags.join(", ")}`);
    });
  }

  // Full enriched payload as JSON (pipe to a file for the dashboard)
  console.log("\n📄  Full enriched JSON (stdout):");
  console.log(JSON.stringify(enriched, null, 2));

  return { pulse, level, breakdown, enriched };
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
