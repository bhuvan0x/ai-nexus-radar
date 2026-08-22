const test = require("node:test");
const assert = require("node:assert/strict");
const { scan } = require("../src/health-monitor");

const healthyJob = {
  company_name: "Example AI",
  job_title: "ML Engineer",
  salary_range: "$120k-$160k",
  tech_stack_tags: ["Python", "PyTorch"],
  posted_date: "2026-08-20"
};

const jobSchema = [
  { key: "company_name", label: "Company Name", description: "the company name" },
  { key: "job_title", label: "Job Title", description: "the job title" },
  { key: "salary_range", label: "Salary Range", description: "the compensation range" },
  { key: "tech_stack_tags", label: "Tech Stack Tags", description: "technologies mentioned" },
  { key: "posted_date", label: "Posted Date", description: "the posting date" }
];

test("healthy dataset passes all reliability checks", () => {
  const result = scan([healthyJob, { ...healthyJob, company_name: "Another AI" }], { schema: jobSchema });
  assert.equal(result.healthy, true);
  assert.equal(result.healthScore, 100);
  assert.equal(result.schemaErrors.length, 0);
});

test("missing field values trigger a targeted heal recommendation", () => {
  const broken = { ...healthyJob, tech_stack_tags: [] };
  const result = scan([broken, broken, healthyJob], { schema: jobSchema, threshold: 0.3 });
  assert.equal(result.healthy, false);
  assert.ok(result.recommendations.some((item) => item.type === "field_drift" && item.key === "tech_stack_tags"));
});

test("schema drift is detected even when values are otherwise present", () => {
  const broken = { company_name: "Example AI", job_title: "ML Engineer" };
  const result = scan([broken, broken], { schema: jobSchema });
  assert.equal(result.healthy, false);
  assert.ok(result.recommendations.some((item) => item.type === "schema_drift"));
});

test("large row-count drops trigger a recovery recommendation", () => {
  const result = scan([healthyJob, healthyJob], { schema: jobSchema, baselineRows: 10, rowDropThreshold: 0.5 });
  assert.equal(result.healthy, false);
  assert.ok(result.recommendations.some((item) => item.type === "row_count_anomaly"));
});

test("zero rows are treated as a critical collector failure", () => {
  const result = scan([], { schema: jobSchema, baselineRows: 20 });
  assert.equal(result.healthy, false);
  assert.equal(result.healthScore, 0);
  assert.ok(result.recommendations.some((item) => item.type === "row_count"));
});

test("custom schemas work without job-specific fields", () => {
  const schema = [
    { key: "title", label: "Title", description: "the product title" },
    { key: "price", label: "Price", description: "the listed price" },
    { key: "url", label: "URL", description: "the canonical product URL" }
  ];
  const result = scan([
    { title: "Book A", price: "$10", url: "https://example.com/a" },
    { title: "Book B", price: "$12", url: "https://example.com/b" }
  ], { schema });
  assert.equal(result.healthy, true);
  assert.equal(result.healthScore, 100);
  assert.deepEqual(result.requiredFields, ["title", "price", "url"]);
});
