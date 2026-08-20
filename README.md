# AI-Nexus Radar 🌊

### Self-Healing Web Intelligence for the *Into the Scrape-Verse* Hackathon

> **Websites change. Scrapers break. AI-Nexus Radar detects extraction drift, generates a targeted natural-language repair, and turns recovered data into hiring intelligence.**

[Live Demo](https://ai-nexus-radar.vercel.app/) · [GitHub](https://github.com/bhuvan0x/ai-nexus-radar)

---

## Why this exists

Traditional scrapers assume that a website's structure stays stable. When selectors or layouts change, extraction silently degrades.

AI-Nexus Radar adds a reliability loop:

```text
YC Jobs
   ↓
Bright Data Scraper Studio
   ↓
Structured 5-field dataset
   ↓
Health Monitor
   ↓
Extraction drift detected?
   ├── No → Pulse Engine → Dashboard
   └── Yes → targeted heal prompt → Bright Data AI-Flow
                         ↓
                    repaired scraper
                         ↓
                    verify + recover
```

The project uses Bright Data's collector as the scraping layer and keeps the repair instruction in plain language so it is resilient to implementation-level HTML/CSS changes.

## Core schema

| Field | Purpose |
|---|---|
| `company_name` | Company posting the role |
| `job_title` | Job title |
| `salary_range` | Salary / compensation / equity information |
| `tech_stack_tags` | Technologies, languages, frameworks and tools |
| `posted_date` | Posting date / relative age |

## Self-healing proof

The collector was first created with a minimal schema and then extended through a Bright Data heal operation. The repository preserves the Phase 2 creation artifact and Phase 3 heal preview as evidence.

```bash
npx -p @brightdata/cli bdata scraper heal c_msyndhlihcuensmoe "Extend the existing scraper to extract company_name, salary_range, tech_stack_tags and posted_date while preserving job_title." --pretty --json --timeout 600

npx -p @brightdata/cli bdata scraper approve c_msyndhlihcuensmoe

npx -p @brightdata/cli bdata scraper run c_msyndhlihcuensmoe "https://www.ycombinator.com/jobs" --pretty --json
```

### Drift detection

`src/health-monitor.js` checks every required field across every returned row. A field crossing the default 30% missing-data threshold produces:

- a health score
- severity (`warning` / `critical`)
- the affected field
- a targeted natural-language repair prompt
- the exact Bright Data heal command

It also returns machine-readable JSON so a scheduled job or dashboard can consume the result.

```bash
node src/health-monitor.js scrape-output.json
```

Exit code `2` means extraction drift was detected; `0` means the dataset is healthy.

## Pulse Engine

`src/nexus-radar.js` transforms recovered job data into a 0–100 hiring Pulse Score:

| Signal | Weight | Meaning |
|---|---:|---|
| **AI Density** | 60% | Share of postings with AI/ML-related technologies |
| **Market Transparency** | 20% | Share of postings exposing compensation information |
| **Freshness** | 20% | Share of postings from the last 30 days |

The score is intentionally simple and explainable:

```text
Pulse = AI Density × 0.60
      + Market Transparency × 0.20
      + Freshness × 0.20
```

Levels: **HIGH ≥ 70**, **MEDIUM ≥ 40**, **LOW < 40**.

## Reliability features

- Exponential backoff + jitter for retryable Bright Data/API failures.
- Retry handling for rate limits and common transient HTTP failures.
- Graceful handling of Bright Data response wrappers (`data`, `results`, `items`).
- Missing-field detection across the complete schema.
- Field-specific heal prompts instead of generic repair instructions.
- Machine-readable health output for automation.
- No API credentials stored in source code.

## Run locally

Requires Node.js 18+ for native `fetch`.

```bash
export BRIGHTDATA_API_KEY="<your-key>"
node src/nexus-radar.js
```

For the health monitor:

```bash
node src/health-monitor.js scrape-output.json
```

## Repository structure

```text
.
├── index.html                 # standalone dashboard entry
├── website/
│   ├── index.html             # polished presentation dashboard
│   ├── styles.css
│   ├── app.js
│   ├── favicon.svg
│   ├── robots.txt
│   └── netlify.toml
├── src/
│   ├── nexus-radar.js         # collector client + Pulse Engine
│   └── health-monitor.js      # extraction drift detector
├── phase2_create.json         # collector creation evidence
├── phase3_heal.json           # heal preview evidence
└── .gitignore
```

## Hackathon differentiation

**The product is not just a scraper.** The scraper is the data acquisition layer. The differentiator is the reliability loop that treats extraction quality as an observable system property and produces a repair instruction when that property degrades.

### Demo story

1. Show a healthy five-field extraction.
2. Introduce a broken/missing field in a test payload.
3. Show the Health Monitor detect the drift.
4. Show the generated Bright Data heal prompt.
5. Run/approve the repair in Scraper Studio.
6. Re-run extraction and show the field recovered.
7. Feed the recovered data into the Pulse Engine and dashboard.

That sequence demonstrates the actual value of self-healing instead of merely describing it.

## Security

**Never commit `BRIGHTDATA_API_KEY` or any other credential.** Configure secrets through the environment or deployment platform. Historical credential-looking values should not be treated as valid secrets; if a real credential was ever exposed, rotate it immediately.

## License

Built as a hackathon project for the *Into the Scrape-Verse* challenge.
