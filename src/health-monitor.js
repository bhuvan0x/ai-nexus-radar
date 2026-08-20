/**
 * AI-Nexus Radar — Health Monitor
 * Detects extraction drift and generates field-specific Bright Data heal prompts.
 */

const COLLECTOR_ID = process.env.COLLECTOR_ID || "c_msyndhlihcuensmoe";

const FIELDS = [
  { key: "company_name", label: "Company Name", description: "the name of the company posting the job" },
  { key: "job_title", label: "Job Title", description: "the title of the job posting" },
  { key: "salary_range", label: "Salary Range", description: "salary, compensation, pay range or equity information mentioned in the job posting" },
  { key: "tech_stack_tags", label: "Tech Stack Tags", description: "technologies, programming languages, frameworks or tools mentioned in the job description" },
  { key: "posted_date", label: "Posted Date", description: "the date when the job was posted" }
];

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "" || value.trim().toLowerCase() === "n/a";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function unwrapRows(raw) {
  if (Array.isArray(raw)) return raw;
  return raw?.data || raw?.results || raw?.items || [];
}

function healPrompt(field) {
  return `The "${field.key}" field is returning empty values. Fix the scraper to extract ${field.description} from each job listing. Preserve all existing fields and return the complete schema.`;
}

function countGaps(jobs) {
  return Object.fromEntries(FIELDS.map(field => {
    const emptyCount = jobs.filter(job => isEmpty(job[field.key])).length;
    return [field.key, {
      emptyCount,
      total: jobs.length,
      ratio: jobs.length ? emptyCount / jobs.length : 1,
      field
    }];
  }));
}

function scan(input, opts = {}) {
  const jobs = unwrapRows(input);
  const threshold = opts.threshold ?? 0.3;

  if (!jobs.length) {
    return {
      healthy: false,
      healthScore: 0,
      gaps: {},
      recommendations: [{
        severity: "critical",
        message: "No job rows returned — the collector may be broken or the target structure may have changed.",
        command: `npx -p @brightdata/cli bdata scraper heal ${COLLECTOR_ID} "The scraper returned zero job rows. Inspect the target and repair the collector while preserving the required five-field schema." --pretty --json --timeout 600`
      }],
      summary: "0 jobs returned — investigate immediately."
    };
  }

  const gaps = countGaps(jobs);
  const recommendations = [];

  for (const [key, info] of Object.entries(gaps)) {
    if (info.ratio >= threshold) {
      recommendations.push({
        field: info.field.label,
        key,
        emptyCount: info.emptyCount,
        total: info.total,
        ratio: Number(info.ratio.toFixed(3)),
        severity: info.ratio >= 0.7 ? "critical" : "warning",
        message: `${info.field.label} is empty in ${info.emptyCount}/${info.total} postings (${Math.round(info.ratio * 100)}%).`,
        prompt: healPrompt(info.field),
        command: `npx -p @brightdata/cli bdata scraper heal ${COLLECTOR_ID} "${healPrompt(info.field)}" --pretty --json --timeout 600`
      });
    }
  }

  const averageCompleteness = FIELDS.reduce((sum, field) => {
    return sum + (1 - gaps[field.key].ratio);
  }, 0) / FIELDS.length;
  const healthScore = Math.round(averageCompleteness * 100);
  const healthy = recommendations.length === 0;

  return {
    healthy,
    healthScore,
    jobsScanned: jobs.length,
    gaps,
    recommendations,
    summary: healthy
      ? `All ${FIELDS.length} fields are above the ${Math.round((1 - threshold) * 100)}% completeness target across ${jobs.length} postings.`
      : `${recommendations.length} field(s) crossed the drift threshold across ${jobs.length} postings.`
  };
}

async function loadJobs() {
  const arg = process.argv[2];
  if (arg) {
    const fs = require("fs");
    return unwrapRows(JSON.parse(fs.readFileSync(arg, "utf8")));
  }

  const chunks = [];
  return new Promise((resolve, reject) => {
    process.stdin.on("data", chunk => chunks.push(chunk));
    process.stdin.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) return resolve([]);
      try { resolve(unwrapRows(JSON.parse(raw))); }
      catch (error) { reject(new Error(`Invalid JSON on stdin: ${error.message}`)); }
    });
    process.stdin.on("error", reject);
  });
}

async function main() {
  const jobs = await loadJobs();
  const result = scan(jobs);
  console.log(JSON.stringify(result, null, 2));

  if (!result.healthy) {
    for (const recommendation of result.recommendations) {
      console.error(`[${recommendation.severity.toUpperCase()}] ${recommendation.message}`);
      console.error(`Heal: ${recommendation.command}`);
    }
    process.exitCode = 2;
  }

  return result;
}

if (require.main === module) {
  main().catch(error => {
    console.error(`Health monitor failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { FIELDS, countGaps, healPrompt, isEmpty, scan, unwrapRows };
