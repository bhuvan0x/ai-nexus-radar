const test = require('node:test');
const assert = require('node:assert/strict');
const { scan } = require('../src/health-monitor');

const healthyJob = {
  company_name: 'Example AI',
  job_title: 'ML Engineer',
  salary_range: '$120k-$160k',
  tech_stack_tags: ['Python', 'PyTorch'],
  posted_date: '2026-08-20'
};

test('healthy dataset passes all reliability checks', () => {
  const result = scan([healthyJob, { ...healthyJob, company_name: 'Another AI' }]);
  assert.equal(result.healthy, true);
  assert.equal(result.healthScore, 100);
  assert.equal(result.schemaErrors.length, 0);
});

test('missing field values trigger a targeted heal recommendation', () => {
  const broken = { ...healthyJob, tech_stack_tags: [] };
  const result = scan([broken, broken, healthyJob], { threshold: 0.3 });
  assert.equal(result.healthy, false);
  assert.ok(result.recommendations.some(item => item.type === 'field_drift' && item.key === 'tech_stack_tags'));
});

test('schema drift is detected even when values are otherwise present', () => {
  const broken = { company_name: 'Example AI', job_title: 'ML Engineer' };
  const result = scan([broken, broken]);
  assert.equal(result.healthy, false);
  assert.ok(result.recommendations.some(item => item.type === 'schema_drift'));
});

test('large row-count drops trigger a recovery recommendation', () => {
  const result = scan([healthyJob, healthyJob], { baselineRows: 10, rowDropThreshold: 0.5 });
  assert.equal(result.healthy, false);
  assert.ok(result.recommendations.some(item => item.type === 'row_count_anomaly'));
});

test('zero rows are treated as a critical collector failure', () => {
  const result = scan([], { baselineRows: 20 });
  assert.equal(result.healthy, false);
  assert.equal(result.healthScore, 0);
  assert.ok(result.recommendations.some(item => item.type === 'row_count'));
});
