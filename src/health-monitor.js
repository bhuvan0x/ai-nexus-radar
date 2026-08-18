/**
 * AI-Nexus Radar — Health Monitor
 * =================================
 * Inspects scraped job data for gaps (empty / missing fields).
 * When a gap is found, it prints the EXACT self-heal CLI command
 * to repair that specific field in the collector.
 *
 * Usage:
 *   node src/health-monitor.js < path/to/scrape-output.json
 *   node src/health-monitor.js  (reads from stdout of a fresh scrape)
 *
 * Integration: call `scan()` from your dashboard cron and alert on
 * any returned `recommendations[]`.
 */

const COLLECTOR_ID = process.env.COLLECTOR_ID || "c_msyndhlihcuensmoe";

// ---------------------------------------------------------------------------
// Field metadata — used to generate self-heal prompts
// ---------------------------------------------------------------------------

const FIELDS = [
  {
    key: "company_name",
    label: "Company Name",
    description: "the name of the company posting the job",
    healPrompt: (field) =>
      `The "${field}" field is returning empty values. Fix the scraper to extract the company name from each job listing on the page.`,
  },
  {
    key: "job_title",
    label: "Job Title",
    description: "the title of the job posting",
    healPrompt: (field) =>
      `The "${field}" field is returning empty values. Fix the scraper to extract the job title from each listing.`,
  },
  {
    key: "salary_range",
    label: "Salary Range",
    description: "any salary, compensation, pay range or equity information mentioned in the job posting",
    healPrompt: (field) =>
      `The "${field}" field is returning empty values. Fix the scraper to extract any salary, compensation, or pay range mentioned in each job posting.`,
  },
  {
    key: "tech_stack_tags",
    label: "Tech Stack Tags",
    description: "a list of technologies, programming languages, frameworks or tools mentioned in the job description",
    healPrompt: (field) =>
      `The "${field}" field is returning empty values. Fix the scraper to extract a list of technologies, languages, frameworks, and tools mentioned in each job posting.`,
  },
  {
    key: "posted_date",
    label: "Posted Date",
    description: "the date when the job was posted",
    healPrompt: (field) =>
      `The "${field}" field is returning empty values. Fix the scraper to extract the date when each job was posted.`,
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** true when a value is missing / empty / placeholder */
function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "" || value.trim().toLowerCase() === "n/a";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Count how many postings have an empty value for each field.
 * Returns a map: fieldKey → { emptyCount, total }
 */
function countGaps(jobs) {
  const gaps = {};
  for (const field of FIELDS) {
    const emptyCount = jobs.filter((job) => isEmpty(job[field.key])).length;
    gaps[field.key] = { emptyCount, total: jobs.length, field };
  }
  return gaps;
}

// ---------------------------------------------------------------------------
// Core scan
// ---------------------------------------------------------------------------

/**
 * Scan scraped job data for gaps and produce recommendations.
 *
 * @param {Array<object>}  jobs          — raw Bright Data scrape rows
 * @param {object}         [opts]
 * @param {number}         [opts.threshold=0.3]  — alert if >30% of rows are empty
 * @returns {{ gaps, recommendations, healthy, summary }}
 */
function scan(jobs, opts = {}) {
  const threshold = opts.threshold ?? 0.3;
  const total = jobs.length;

  if (total === 0) {
    return {
      gaps: {},
      recommendations: [{ severity: "critical", message: "No job rows returned — the collector may be broken or the target page changed structure.", command: "" }],
      healthy: false,
      summary: "0 jobs returned — investigate immediately.",
    };
  }

  const gaps = countGaps(jobs);
  const recommendations = [];

  for (const [key, info] of Object.entries(gaps)) {
    const { emptyCount, total: n, field } = info;
    const ratio = emptyCount / n;

    if (ratio >= threshold) {
      const cmd = `npx -p @brightdata/cli bdata scraper heal ${COLLECTOR_ID} "${field.healPrompt(field.key)}" --pretty --json --timeout 600`;
      recommendations.push({
        field: field.label,
        key,
        emptyCount,
        total: n,
        ratio: ratio.toFixed(2),
        severity: ratio > 0.7 ? "critical" : "warning",
        message: `${field.label} is empty in ${emptyCount}/${n} postings (${ratio.toFixed(2)}). The site structure may have changed.`,
        command: cmd,
      });
    }
  }

  const healthy = recommendations.length === 0;
  const summary = healthy
    ? `All ${FIELDS.length} fields populated across ${total} postings. ✅`
    : `${recommendations.length} field(s) need attention across ${total} postings.`;

  return { gaps, recommendations, healthy, summary };
}

// ---------------------------------------------------------------------------
// CLI entry point — reads JSON from stdin or argv file
// ---------------------------------------------------------------------------

function loadJobs() {
  // Try reading from a file path passed as argv[2]
  const arg = process.argv[2];
  if (arg) {
    const fs = require("fs");
    try {
      return JSON.parse(fs.readFileSync(arg, "utf-8"));
    } catch (err) {
      console.error(`❌  Cannot read file: ${arg}`, err.message);
      process.exit(1);
    }
  }

  // Otherwise read from stdin (pipe)
  const chunks = [];
  return new Promise((resolve, reject) => {
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8").trim();
      if (!raw) { resolve([]); return; }
      try {
        const parsed = JSON.parse(raw);
        resolve(Array.isArray(parsed) ? parsed : (parsed.data || parsed.results || parsed.items || []));
      } catch (err) {
        reject(new Error(`Invalid JSON on stdin: ${err.message}`));
      }
    });
    process.stdin.on("error", reject);
  });
}

async function main() {
  console.log(`🩺  Health Monitor — Collector ${COLLECTOR_ID}`);
  console.log("─".repeat(56));

  let jobs;
  try {
    jobs = await loadJobs();
  } catch (err) {
    console.error("Failed to load jobs:", err.message);
    process.exit(1);
  }

  console.log(`📦  Jobs scanned: ${jobs.length}`);

  const { gaps, recommendations, healthy, summary } = scan(jobs);

  console.log("\n📋  Summary:");
  console.log(`   ${summary}`);

  if (recommendations.length) {
    console.log("\n🚨  Recommendations:");
    for (const r of recommendations) {
      console.log(`\n   [${r.severity.toUpperCase()}]  ${r.message}`);
      console.log(`   Field:     ${r.field}  (${r.key})`);
      console.log(`   Empty:     ${r.emptyCount}/${r.total}  (${r.ratio})`);
      console.log(`   🔧  Run this to self-heal:`);
      console.log(`   ${r.command}`);
    }
  } else {
    console.log("\n✅  All fields healthy — no action needed.");
  }

  return { gaps, recommendations, healthy, summary };
}

// Run directly when invoked as a script
if (require.main === module) {
  main().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}

module.exports = { scan, FIELDS, isEmpty };
