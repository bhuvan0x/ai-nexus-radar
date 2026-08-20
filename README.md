# AI-Nexus Radar

### Flexible self-healing web intelligence for the Into the Scrape-Verse hackathon

> **Describe what you want to extract. Run it against one URL or a batch. Validate the dataset. When extraction drifts, repair the same Bright Data collector instead of rebuilding the scraper.**

[Live Demo](https://ai-nexus-radar.vercel.app/) · [GitHub](https://github.com/bhuvan0x/ai-nexus-radar)

## What changed

AI-Nexus Radar is no longer a YC-jobs-only dashboard. The website is a general scraper workspace built around Bright Data Scraper Studio:

```text
User describes target + schema
          ↓
Create/reuse Bright Data collector
          ↓
Run one URL or multiple URLs
          ↓
Structured result table + JSON/CSV export
          ↓
Health Sentinel
   ┌──────┴──────┐
 healthy       drift
   ↓             ↓
 product      plain-language
 output       Bright Data heal
                 ↓
             approve repair
                 ↓
             re-run + verify
```

## Product workflow

1. **Target** — paste any permitted public HTTP(S) URL or a newline-separated batch.
2. **Extraction intent** — describe the fields in plain language.
3. **Schema** — edit field names/descriptions or add new fields.
4. **Collector** — reuse an existing Bright Data collector or create one through the server-side API.
5. **Run** — trigger the collector and poll the asynchronous Bright Data result.
6. **Validate** — calculate field completeness, schema coverage and an extraction health score.
7. **Export** — inspect table/JSON output and download CSV or JSON.
8. **Self-heal** — describe the detected failure, trigger Bright Data's refactor flow, review the result, approve, then re-run.

## Bright Data integration

The repository follows the same API workflow used by the Bright Data CLI for Scraper Studio:

- collector template: `/dca/collector`
- AI generation: `/dca/collectors/{collector}/automate_template`
- generation progress: `/dca/collectors/{collector}/automate_template/progress`
- single scrape trigger: `/dca/trigger_immediate`
- single scrape result: `/dca/get_result`
- batch execution: `/dca/trigger` + `/dca/dataset`
- self-heal trigger: `/dca/collectors/{collector}/refactor_template`
- self-heal progress: `/dca/collectors/{collector}/refactor_template/progress`
- approval: `/dca/collectors/{collector}/resume_automation_job`

The browser never receives `BRIGHTDATA_API_KEY`; Vercel serverless functions keep the credential server-side.

## API surface

| Endpoint | Purpose |
|---|---|
| `POST /api/collector` | Create a Bright Data collector and start AI generation |
| `GET /api/collector?collectorId=...` | Poll collector-generation progress |
| `POST /api/run` | Trigger a collector for one URL |
| `GET /api/run?responseId=...` | Poll scrape results |
| `POST /api/heal` | Trigger self-healing for a collector |
| `GET /api/heal?collectorId=...` | Read heal progress |
| `PUT /api/heal` | Approve and save a repair |

## Reliability

The core reliability loop is deliberately observable rather than simulated:

- retryable Bright Data failures are retried in the collector client;
- result polling handles asynchronous jobs;
- field-level empty/null rates are measured after every run;
- missing schema fields are flagged;
- a low health score creates a targeted repair prompt;
- the same collector ID is preserved through repair;
- the repaired collector can be run again for verification.

## Local / Vercel configuration

Create the following Vercel environment variables:

```text
BRIGHTDATA_API_KEY=<your Bright Data key>
COLLECTOR_ID=<optional default collector>
TARGET_URL=<optional default target>
MAX_RETRIES=4
```

Never commit the real API key. `.env.example` contains placeholders only.

## Judge demo script

Use a five-minute story:

1. Open **Scraper Studio**.
2. Enter a permitted public target and a natural-language extraction schema.
3. Run the collector and show the live activity log.
4. Show the structured rows and health score.
5. Introduce or demonstrate an extraction gap using a test/known drift case.
6. Open **Self-Heal**, show the generated repair instruction, and approve it.
7. Re-run the same collector and show recovered fields.
8. Export the recovered dataset.

The key claim is not “we built another scraper.” It is **“we made extraction reliability observable and repairable.”**

## Repository structure

```text
.
├── index.html
├── website/
│   ├── index.html        # scraper studio UI
│   ├── styles.css
│   ├── app.js
│   └── favicon.svg
├── api/
│   ├── _bright.js        # server-side Bright Data client
│   ├── collector.js      # collector creation/progress
│   ├── run.js            # trigger/result polling
│   └── heal.js            # self-healing/approval
├── src/
│   ├── nexus-radar.js    # collector client + Pulse engine
│   └── health-monitor.js # extraction drift detector
├── test/
├── phase2_create.json    # collector creation evidence
└── phase3_heal.json      # heal preview evidence
```

## Security

Never commit `BRIGHTDATA_API_KEY` or any other credential. Configure secrets through Vercel environment variables. If a real credential is ever exposed, rotate it immediately.

## License

Built as a hackathon project for the *Into the Scrape-Verse* challenge.
