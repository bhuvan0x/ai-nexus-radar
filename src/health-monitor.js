/**
 * AI-Nexus Radar — Health Monitor
 * Detects extraction drift, schema drift and abnormal row-count drops.
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
function unwrapRows(raw) { if (Array.isArray(raw)) return raw; return raw?.data || raw?.results || raw?.items || []; }
function healPrompt(field) { return `The "${field.key}" field is returning empty or missing values. Fix the scraper to extract ${field.description} from each job listing. Preserve the complete schema: ${FIELDS.map(f => f.key).join(", ")}.`; }
function countGaps(jobs) { return Object.fromEntries(FIELDS.map(field => { const emptyCount = jobs.filter(job => isEmpty(job[field.key])).length; return [field.key, { emptyCount, total: jobs.length, ratio: jobs.length ? emptyCount / jobs.length : 1, field }]; })); }
function scan(input, opts = {}) {
  const jobs = unwrapRows(input);
  const threshold = Number(opts.threshold ?? 0.3);
  const baselineRows = Number(opts.baselineRows ?? 0);
  const rowDropThreshold = Number(opts.rowDropThreshold ?? 0.5);
  const gaps = countGaps(jobs);
  const schemaErrors = [];
  jobs.forEach((job, index) => { const missing = FIELDS.filter(field => !(field.key in job)).map(field => field.key); if (missing.length) schemaErrors.push({ row: index, missing }); });
  const recommendations = [];
  for (const [key, info] of Object.entries(gaps)) if (info.ratio >= threshold) recommendations.push({ type: "field_drift", field: info.field.label, key, emptyCount: info.emptyCount, total: info.total, ratio: Number(info.ratio.toFixed(3)), severity: info.ratio >= 0.7 ? "critical" : "warning", message: `${info.field.label} is empty in ${info.emptyCount}/${info.total} postings (${Math.round(info.ratio * 100)}%).`, prompt: healPrompt(info.field), command: `npx -p @brightdata/cli bdata scraper heal ${COLLECTOR_ID} "${healPrompt(info.field)}" --pretty --json --timeout 600` });
  if (schemaErrors.length) { const prompt = `Repair collector schema drift. Return exactly these fields for every job: ${FIELDS.map(f => f.key).join(", ")}.`; recommendations.push({ type: "schema_drift", severity: "critical", message: `${schemaErrors.length} row(s) are missing required schema fields.`, schemaErrors: schemaErrors.slice(0, 20), prompt, command: `npx -p @brightdata/cli bdata scraper heal ${COLLECTOR_ID} "${prompt}" --pretty --json --timeout 600` }); }
  if (!jobs.length) { const prompt = "The scraper returned zero job rows. Inspect the target and repair the collector while preserving the required five-field schema."; recommendations.push({ type: "row_count", severity: "critical", message: "No job rows returned — the collector may be broken.", prompt, command: `npx -p @brightdata/cli bdata scraper heal ${COLLECTOR_ID} "${prompt}" --pretty --json --timeout 600` }); }
  else if (baselineRows > 0 && jobs.length < baselineRows * (1 - rowDropThreshold)) { const prompt = `The collector row count dropped sharply from baseline ${baselineRows} to ${jobs.length}. Inspect the target structure and repair the scraper while preserving the complete required schema.`; recommendations.push({ type: "row_count_anomaly", severity: "critical", message: `Row count dropped from baseline ${baselineRows} to ${jobs.length}.`, prompt, command: `npx -p @brightdata/cli bdata scraper heal ${COLLECTOR_ID} "${prompt}" --pretty --json --timeout 600` }); }
  const completeness = jobs.length ? FIELDS.reduce((sum, field) => sum + (1 - gaps[field.key].ratio), 0) / FIELDS.length : 0;
  return { healthy: recommendations.length === 0, healthScore: Math.round(completeness * 100), jobsScanned: jobs.length, gaps, schemaErrors, recommendations, requiredFields: FIELDS.map(field => field.key), summary: recommendations.length ? `${recommendations.length} reliability signal(s) need attention.` : `All ${FIELDS.length} required fields are healthy across ${jobs.length} postings.` };
}
async function loadJobs() { const arg = process.argv[2]; if (arg) { const fs = require("fs"); return unwrapRows(JSON.parse(fs.readFileSync(arg, "utf8"))); } const chunks = []; return new Promise((resolve, reject) => { process.stdin.on("data", chunk => chunks.push(chunk)); process.stdin.on("end", () => { const raw = Buffer.concat(chunks).toString("utf8").trim(); if (!raw) return resolve([]); try { resolve(unwrapRows(JSON.parse(raw))); } catch (error) { reject(new Error(`Invalid JSON on stdin: ${error.message}`)); } }); process.stdin.on("error", reject); }); }
async function main() { const result = scan(await loadJobs(), { baselineRows: Number(process.env.BASELINE_ROWS || 0) }); console.log(JSON.stringify(result, null, 2)); if (!result.healthy) process.exitCode = 2; return result; }
if (require.main === module) main().catch(error => { console.error(`Health monitor failed: ${error.message}`); process.exit(1); });
module.exports = { FIELDS, countGaps, healPrompt, isEmpty, scan, unwrapRows };
