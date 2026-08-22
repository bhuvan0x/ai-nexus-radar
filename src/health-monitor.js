#!/usr/bin/env node
/**
 * AI-Nexus Radar health-monitor CLI.
 * Reads JSON from a file or stdin and reports schema-driven extraction health.
 */

const fs = require("node:fs");
const {
  scan,
  unwrapRows,
  isEmpty,
  countGaps,
  buildHealPrompt
} = require("./reliability/engine");

const DEFAULT_SCHEMA = [
  { key: "company_name", label: "Company Name", description: "the name of the company posting the job" },
  { key: "job_title", label: "Job Title", description: "the title of the job posting" },
  { key: "salary_range", label: "Salary Range", description: "salary, compensation, pay range or equity information mentioned in the job posting" },
  { key: "tech_stack_tags", label: "Tech Stack Tags", description: "technologies, programming languages, frameworks or tools mentioned in the job description" },
  { key: "posted_date", label: "Posted Date", description: "the date when the job was posted" }
];

function loadRows() {
  const file = process.argv[2];
  if (file) return unwrapRows(JSON.parse(fs.readFileSync(file, "utf8")));

  const input = fs.readFileSync(0, "utf8").trim();
  if (!input) return [];
  try {
    return unwrapRows(JSON.parse(input));
  } catch (error) {
    throw new Error(`Invalid JSON on stdin: ${error.message}`);
  }
}

function main() {
  const rows = loadRows();
  const schema = process.env.SCHEMA_JSON
    ? JSON.parse(process.env.SCHEMA_JSON)
    : DEFAULT_SCHEMA;

  const result = scan(rows, {
    schema,
    baselineRows: Number(process.env.BASELINE_ROWS || 0),
    threshold: Number(process.env.DRIFT_THRESHOLD || 0.3)
  });

  console.log(JSON.stringify(result, null, 2));
  if (!result.healthy) process.exitCode = 2;
  return result;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`Health monitor failed: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_SCHEMA,
  buildHealPrompt,
  countGaps,
  isEmpty,
  scan,
  unwrapRows
};
