# AI-Nexus Radar

### Scrape anything public. Detect silent extraction failure. Repair the collector.

> **AI-Nexus Radar is a flexible, reliability-first scraping workspace built for the Into the Scrape-Verse hackathon. Describe the data you need, generate or reuse a Bright Data Scraper Studio collector, validate the structured output, detect drift, and send the same collector into a self-healing repair workflow.**

[Live Demo](https://ai-nexus-radar.vercel.app/) · [GitHub](https://github.com/bhuvan0x/ai-nexus-radar) · [Data Universe](https://ai-nexus-radar.vercel.app/website/visualize.html)

**Creator:** Bhuvan Jatav · Student Developer · AI & Web Innovation

---

## Why this exists

Web scrapers often fail silently. A layout change can leave the HTTP request successful while the business data becomes empty, incomplete, or structurally wrong.

AI-Nexus Radar treats extraction as a monitored system:

```text
Public URL(s)
    ↓
Natural-language extraction intent
    ↓
Flexible schema
    ↓
Bright Data Scraper Studio collector
    ↓
Structured output
    ↓
Reliability Sentinel
    ↓
Drift / missing data detected
    ↓
Targeted self-heal
    ↓
Human approval
    ↓
Verification run
```

---

# Hackathon judging map

The official hackathon evaluates six equally weighted criteria: **Potential Impact, Creativity & Innovation, Technical Excellence, Use of Scraper Studio, Reliability & Self-Healing, and Presentation**. citeturn151654search0

AI-Nexus Radar is designed to make each criterion visible in both the product and the repository.

| Judging criterion | What the project demonstrates | Where to inspect it |
|---|---|---|
| **Potential Impact** | Converts unstable public-web extraction into reusable structured data with quality checks and recovery | Product workflow, Results, Data Universe |
| **Creativity & Innovation** | Natural-language extraction intent + flexible schema + Reliability Sentinel + same-collector repair loop | Scraper Studio, Reliability, Self-Heal |
| **Technical Excellence** | Server-side Bright Data client, async collector jobs, polling, schema validation, exports, tests, CI | `api/`, `src/`, `test/`, `.github/` |
| **Use of Scraper Studio** | Bright Data is the core collection, execution, and self-healing platform rather than a decorative integration | `api/collector.js`, `api/run.js`, `api/heal.js` |
| **Reliability & Self-Healing** | Field completeness, schema drift, row-count anomalies, repair prompts, approval, and re-verification | Reliability Sentinel + `src/reliability/engine.js` |
| **Presentation** | Structured demo flow with readable output, visual exploration, reliability failure, and repair | Live Demo + `website/visualize.html` |

The official page also says the demo is scored as hard as the code, so the README, product walkthrough, and demo should tell the same story. citeturn151654search0

---

# 1. Potential Impact

### Problem

A scraper that returns zero or partially populated fields can silently contaminate a downstream dashboard, research workflow, monitoring system, or dataset.

### Solution

AI-Nexus Radar adds a reliability layer after extraction instead of trusting HTTP success as proof that the data is healthy.

The same workspace can be used for public product pages, listings, documentation, reviews, market-research sources, and other permitted public web data.

### Output

The collected records can feed:

- a structured results table;
- JSON or CSV exports;
- the interactive **Data Universe**;
- reliability monitoring;
- a repair workflow for the same collector.

---

# 2. Creativity & Innovation

The core idea is not “another scraper.” It is **scraping as a monitored, recoverable system**.

### What is different

**Natural-language intent**

The user explains what each record should contain instead of starting from brittle selectors.

**Flexible schema**

Fields are user-defined rather than hardcoded to one website or one domain.

**Reliability Sentinel**

The system checks schema presence and value completeness after extraction.

**Self-healing loop**

A detected failure becomes a targeted repair request against the existing collector, followed by human review and re-verification.

**Data Universe**

Successful extraction is turned into an interactive visual dataset instead of ending at a plain table.

---

# 3. Technical Excellence

The repository keeps provider access, API orchestration, reliability logic, UI state, and tests separated.

```text
Browser
   │
   ▼
Vercel serverless API
   │
   ├── collector.js ── create / inspect collector
   ├── run.js       ── trigger / poll extraction
   └── heal.js      ── repair / approve
          │
          ▼
   Bright Data Scraper Studio
          │
          ▼
Structured result
          │
          ▼
src/reliability/engine.js
          │
          ├── field completeness
          ├── schema drift
          ├── row-count anomalies
          └── repair recommendations
```

### Code-quality practices

- Bright Data credentials stay server-side.
- `.env`, key files, certificates, and sensitive workspace files are ignored by Git.
- Reliability logic is implemented in a reusable, schema-driven module.
- The health monitor is a thin CLI layer over the reusable engine.
- Automated tests cover healthy extraction, field drift, schema drift, row-count anomalies, and zero-row failure.
- GitHub Actions provides automated quality checks for pushes and pull requests.

### Quality commands

```bash
npm test
npm run check
```

`npm run check` performs the repository's automated test and syntax checks.

---

# 4. Use of Bright Data Scraper Studio

Bright Data is central to the product, not an add-on.

```text
User request
    ↓
Create or reuse collector
    ↓
Bright Data Scraper Studio
    ↓
Run collector
    ↓
Retrieve structured result
    ↓
Validate
    ↓
Self-heal same collector when required
```

### Server endpoints

| Endpoint | Purpose |
|---|---|
| `POST /api/collector` | Create a Scraper Studio collector and start generation |
| `GET /api/collector?collectorId=...` | Read collector-generation progress |
| `POST /api/run` | Trigger a collector for a target URL |
| `GET /api/run?responseId=...` | Poll the asynchronous result |
| `POST /api/heal` | Start a collector repair |
| `GET /api/heal?collectorId=...` | Read repair progress |
| `PUT /api/heal` | Approve/save the repair |

The hackathon requires Bright Data Scraper Studio and permits coding-agent-driven operation; this project keeps Bright Data at the center of the execution path. citeturn151654search0turn151654search1

---

# 5. Reliability & Self-Healing

The reliability layer is intentionally explicit so the failure can be demonstrated and verified.

### Detection

The engine can detect:

- required-field missing values;
- schema drift;
- zero-row failures;
- abnormal row-count drops.

By default, a required field is flagged when its missing-value ratio reaches **30%**.

### Recovery loop

```text
Healthy extraction
      ↓
Reliability audit
      ↓
Drift detected
      ↓
Targeted repair prompt
      ↓
Bright Data self-heal
      ↓
Human review / approval
      ↓
Verification run
```

### Demonstration mode

**Simulate field drift** intentionally removes values from a field so the failure state can be shown deterministically during a presentation. This is a demo mechanism, not a production benchmark.

The repository also contains automated reliability tests, including field drift, schema drift, row-count anomalies, and zero-row failure.

---

# 6. Presentation

### Recommended 90-second demo

```text
0–10s   Problem
        “Web scrapers break when websites change.”

10–25s  Build
        URL → describe fields → flexible schema → Create & Run

25–40s  Result
        Structured rows → health score → Data Universe

40–55s  Reliability
        Run Reliability Audit → show healthy output

55–70s  Failure
        Simulate Field Drift → show DRIFT

70–85s  Recovery
        Trigger Self-Heal → review → Approve

85–90s  Payoff
        “The scraper did not just collect data. It monitored extraction quality and entered a repair loop.”
```

The hackathon submission requires a public repository, demo video, project description, selected track information, and details of how Scraper Studio was used. citeturn151654search0

### Evidence to capture

Use **real Bright Data run results** wherever available:

- inputs;
- records returned;
- failed crawls;
- success rate;
- page loads;
- runtime;
- health score before and after recovery.

Do not present the simulated drift scenario as a production benchmark.

---

# Clean Code / Spider-Sense

The hackathon's **Best Clean Code** track is for code that is “readable, structured, and handled at the edges” — a repository a stranger could pick up and understand. citeturn151654search0

AI-Nexus Radar is structured around that goal:

```text
api/
  _bright.js          # shared Bright Data HTTP client
  collector.js        # collector lifecycle
  run.js              # extraction execution/result polling
  heal.js             # repair lifecycle

src/
  reliability/
    engine.js         # schema-driven reliability engine
  health-monitor.js   # thin CLI wrapper around reliability logic

website/
  index.html          # scraper workspace
  app.js              # browser orchestration
  styles.css          # UI system
  visualize.html      # interactive Data Universe

test/
  health-monitor.test.js

.github/
  workflows/
    quality.yml       # automated repository checks
```

### Edge cases explicitly handled

- missing API configuration;
- invalid/non-HTTP URLs;
- Bright Data provider errors;
- collector-generation failures;
- asynchronous jobs and polling timeouts;
- empty result sets;
- missing fields;
- schema drift;
- abnormal row counts.

The objective is not just fewer lines of code. It is **clear boundaries, predictable behavior, and code that can be understood without knowing the original hackathon history**.

---

# Repository map

```text
.
├── api/
│   ├── _bright.js
│   ├── collector.js
│   ├── run.js
│   ├── heal.js
│   └── radar.js
├── src/
│   ├── reliability/
│   │   └── engine.js
│   ├── health-monitor.js
│   └── nexus-radar.js
├── test/
│   └── health-monitor.test.js
├── website/
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── visualize.html
│   └── favicon.svg
├── .env.example
├── .github/workflows/quality.yml
├── .gitignore
├── package.json
└── README.md
```

---

# Environment

```text
BRIGHTDATA_API_KEY=<your Bright Data key>
COLLECTOR_ID=<optional existing/default collector>
TARGET_URL=<optional default target>
MAX_RETRIES=4
```

Keep real credentials in Vercel environment variables or another secret manager. Never commit the real API key.

Use only permitted public web data and respect target-site terms, access controls, privacy requirements, and applicable law.

---

# Built by

**Bhuvan Jatav** · Student Developer · AI & Web Innovation

Built for **Into the Scrape-Verse 2026** with Bright Data Scraper Studio.
