/**
 * Schema-driven extraction reliability engine.
 * Keeps scraping concerns separate from validation and recovery recommendations.
 */

function isEmpty(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === "string") return value.trim() === "" || value.trim().toLowerCase() === "n/a";
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

function unwrapRows(raw) {
  if (Array.isArray(raw)) return raw;
  return raw?.data || raw?.results || raw?.items || raw?.rows || raw?.records || [];
}

function normalizeSchema(schema = []) {
  return schema
    .map((field) => typeof field === "string" ? { key: field, label: field, description: field } : field)
    .filter((field) => field?.key)
    .map((field) => ({
      key: String(field.key),
      label: field.label ? String(field.label) : String(field.key),
      description: field.description ? String(field.description) : String(field.key),
      required: field.required !== false
    }));
}

function countGaps(rows, schema) {
  return Object.fromEntries(schema.map((field) => {
    const missing = rows.filter((row) => isEmpty(row?.[field.key])).length;
    return [field.key, {
      field,
      missing,
      total: rows.length,
      ratio: rows.length ? missing / rows.length : 1
    }];
  }));
}

function findSchemaErrors(rows, schema) {
  return rows.flatMap((row, index) => {
    const missing = schema.filter((field) => !(field.key in row)).map((field) => field.key);
    return missing.length ? [{ row: index, missing }] : [];
  });
}

function buildHealPrompt(field, schema) {
  return `The "${field.label}" field is returning empty or missing values. Fix the scraper to extract ${field.description} for each record. Preserve the complete schema: ${schema.map((item) => item.key).join(", ")}.`;
}

function scan(input, options = {}) {
  const rows = unwrapRows(input);
  const schema = normalizeSchema(options.schema);
  const threshold = Number(options.threshold ?? 0.3);
  const baselineRows = Number(options.baselineRows ?? 0);
  const rowDropThreshold = Number(options.rowDropThreshold ?? 0.5);
  const gaps = countGaps(rows, schema);
  const schemaErrors = findSchemaErrors(rows, schema);
  const recommendations = [];

  for (const field of schema) {
    const info = gaps[field.key];
    if (field.required && info.ratio >= threshold) {
      const prompt = buildHealPrompt(field, schema);
      recommendations.push({
        type: "field_drift",
        key: field.key,
        field: field.label,
        emptyCount: info.missing,
        total: info.total,
        ratio: Number(info.ratio.toFixed(3)),
        severity: info.ratio >= 0.7 ? "critical" : "warning",
        message: `${field.label} is empty in ${info.missing}/${info.total} records (${Math.round(info.ratio * 100)}%).`,
        prompt
      });
    }
  }

  if (schemaErrors.length) {
    recommendations.push({
      type: "schema_drift",
      severity: "critical",
      message: `${schemaErrors.length} row(s) are missing required schema fields.`,
      schemaErrors: schemaErrors.slice(0, 20),
      prompt: `Repair collector schema drift. Return exactly these fields for every record: ${schema.map((field) => field.key).join(", ")}.`
    });
  }

  if (!rows.length) {
    recommendations.push({
      type: "row_count",
      severity: "critical",
      message: "No records returned — the collector may be broken.",
      prompt: `The scraper returned zero records. Inspect the target and repair the collector while preserving the required schema: ${schema.map((field) => field.key).join(", ")}.`
    });
  } else if (baselineRows > 0 && rows.length < baselineRows * (1 - rowDropThreshold)) {
    recommendations.push({
      type: "row_count_anomaly",
      severity: "critical",
      message: `Row count dropped from baseline ${baselineRows} to ${rows.length}.`,
      prompt: `The collector row count dropped sharply from ${baselineRows} to ${rows.length}. Inspect the target structure and repair the scraper while preserving the complete schema.`
    });
  }

  const completeness = schema.length
    ? schema.reduce((sum, field) => sum + (1 - gaps[field.key].ratio), 0) / schema.length
    : rows.length ? 1 : 0;
  const healthScore = rows.length ? Math.round(completeness * 100) : 0;

  return {
    healthy: recommendations.length === 0,
    healthScore,
    rowsScanned: rows.length,
    gaps,
    schemaErrors,
    recommendations,
    requiredFields: schema.map((field) => field.key),
    summary: recommendations.length
      ? `${recommendations.length} reliability signal(s) need attention.`
      : `All ${schema.length} required fields are healthy across ${rows.length} records.`
  };
}

module.exports = {
  buildHealPrompt,
  countGaps,
  findSchemaErrors,
  isEmpty,
  normalizeSchema,
  scan,
  unwrapRows
};
