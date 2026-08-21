# AI-Nexus Radar

### Flexible, reliability-first web intelligence for the Into the Scrape-Verse hackathon

> **Describe what you want to extract. Run it against one URL or a batch. Validate the dataset. When extraction drifts, repair the same Bright Data collector instead of rebuilding the scraper.**

[Live Demo](https://ai-nexus-radar.vercel.app/) · [GitHub](https://github.com/bhuvan0x/ai-nexus-radar)

## The idea

Traditional scrapers are brittle: a small layout change can silently turn valid-looking output into missing or incorrect fields.

AI-Nexus Radar treats scraping as a monitored system instead of a one-shot script:

```text
Public URL(s)
    ↓
Natural-language extraction schema
    ↓
Bright Data Scraper Studio collector
    ↓
Structured rows
    ↓
Reliability Sentinel
    ↓
Drift detected
    ↓
Targeted AI self-heal
    ↓
Human approval
    ↓
Verification run
```

## Product workflow

1. **Target** — paste any permitted public HTTP(S) URL or a newline-separated batch.
2. **Extraction intent** — describe the fields in plain language.
3. **Schema** — edit field names/descriptions or add new fields.
4. **Collector** — reuse an existing Bright Data collector or create one through the server-side API when account capacity is available.
5. **Run** — trigger the collector and poll the asynchronous Bright Data result.
6. **Validate** — calculate field completeness, schema coverage and an extraction health score.
7. **Export** — inspect table/JSON output and download CSV or JSON.
8. **Visualize** — open **Data Universe** to explore returned records as interactive nodes.
9. **Self-heal** — describe the detected failure, trigger Bright Data's refactor flow, wait for the repair job, review it, approve it, then re-run.

## Why the reliability layer matters

A scraper can return HTTP-successful responses while still producing broken business data. AI-Nexus Radar therefore checks the extraction contract after the crawl:

- requested fields must exist in the returned schema;
- empty, null and empty-array values are counted per field;
- a field is flagged when more than 30% of its values are missing;
- the health score combines schema coverage and completeness;
- a detected failure can generate a targeted repair prompt for the same collector.

The **Simulate field drift** control is a deliberate demonstration tool: it removes values from a field so a judge can see the Sentinel detect a failure without requiring a live website layout change during the presentation.

## Bright Data integration

The browser never receives `BRIGHTDATA_API_KEY`. Vercel serverless functions keep the credential server-side.

| Endpoint | Purpose |
|---|---|
| `POST /api/collector` | Create a Bright Data collector and start AI generation |
| `GET /api/collector?collectorId=...` | Poll collector-generation progress |
| `POST /api/run` | Trigger a collector for one URL |
| `GET /api/run?responseId=...` | Poll scrape results |
| `POST /api/heal` | Trigger self-healing for a collector |
| `GET /api/heal?collectorId=...` | Read heal progress |
| `PUT /api/heal` | Approve and save a repair |

### Trial/collector capacity

Creating a new Scraper Studio custom collector consumes account-level collector capacity. AI-Nexus Radar therefore keeps automatic collector creation opt-in. For a demo, prefer reusing an existing collector. If the Bright Data account has exhausted its allowance, the provider error is surfaced instead of pretending a collector was created.

## Judge demo — recommended 90-second story

```text
0–10s   Problem
        “Web scrapers break when websites change.”

10–25s  Build
        URL → natural-language fields → existing collector → Run

25–40s  Result
        Structured rows → health score → Data Universe

40–55s  Reliability
        Run Audit → show healthy extraction

55–70s  Failure
        Simulate Field Drift → show DRIFT

70–85s  Recovery
        Trigger Self-Heal → wait → review → Approve

85–90s  Payoff
        “It didn't just scrape. It detected extraction failure and entered a repair loop.”
```

Use real Bright Data measurements in the final submission. Do **not** present synthetic demo data or simulated drift as a real-world benchmark.

Recommended evidence to capture:

- inputs;
- records returned;
- failed crawls;
- success rate;
- page loads;
- runtime;
- reliability score before/after repair.

## Local / Vercel configuration

```text
BRIGHTDATA_API_KEY=<your Bright Data key>
COLLECTOR_ID=<optional default collector>
TARGET_URL=<optional default target>
MAX_RETRIES=4
```

Never commit the real API key. Configure secrets through Vercel environment variables. If a credential is ever exposed, rotate it immediately.

## Repository structure

```text
.
├── index.html
├── website/
│   ├── index.html        # scraper studio UI
│   ├── styles.css        # UI system + reliability visuals
│   ├── app.js            # UI state, validation and API orchestration
│   ├── visualize.html    # interactive Data Universe
│   └── favicon.svg
├── api/
│   ├── _bright.js        # server-side Bright Data client
│   ├── collector.js      # collector creation/progress
│   ├── run.js            # trigger/result polling
│   └── heal.js            # self-healing/approval
├── src/
│   ├── nexus-radar.js
│   └── health-monitor.js
└── test/
```

## Security and responsible scope

Use AI-Nexus Radar only for permitted public web data. Respect target-site terms, access policies, privacy requirements and applicable law. Never commit credentials or private data.

## License

Built as a hackathon project for the *Into the Scrape-Verse* challenge.
