# AI-Nexus Radar  🌊
### *Into the Scrape-Verse* Hackathon — NVIDIA DGX Spark Entry

> **Self-healing scraper system** that monitors Y Combinator's Job Board to extract emerging tech trends, salary data, tech-stack signals, and company descriptions.

---

## Project Overview

The **AI-Nexus Radar** is a self-healing web scraper built on **Bright Data's Scraper Studio**, designed to track the pulse of AI and emerging-tech hiring trends from Y Combinator's job board. It extends and heals itself in-place when site structure changes — no manual CSS rewriting required.

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              AI-Nexus Radar Dashboard               │
│  (Pulse Score, AI-tagged postings, salary heatmaps) │
└───────────────────────┬─────────────────────────────┘
                        │  enriched JSON
┌───────────────────────▼─────────────────────────────┐
│              nexus-radar.js  (Phase 4)              │
│   fetch → computePulse() → Sentiment Score (0–100) │
└───────────────────────┬─────────────────────────────┘
                        │  raw scrape rows
┌───────────────────────▼─────────────────────────────┐
│          Bright Data Collector  c_msyndhlihcuensmoe │
│                                                     │
│   Fields (5):                                        │
│   • company_name        (self-healed)               │
│   • job_title            (baseline)                  │
│   • salary_range        (self-healed)               │
│   • tech_stack_tags     (self-healed)               │
│   • posted_date         (self-healed)               │
└───────────────────────┬─────────────────────────────┘
                        │  plain-language descriptions
┌───────────────────────▼─────────────────────────────┐
│         Bright Data Scraper Studio  (AI-Flow)       │
│         Self-Heal Loop  (Phase 3)                   │
└─────────────────────────────────────────────────────┘
```

---

## Phase 1 — Authentication & Initialization ✅

| Step | Command | Result |
|------|---------|--------|
| Install & version | `npx -p @brightdata/cli bdata --version` | `0.3.5` |
| Auth (API key) | `BRIGHTDATA_API_KEY=... bdata ...` | ✅ Key verified via `/discover` endpoint |

> **Note:** The CLI expects `BRIGHTDATA_API_KEY` (not `BRIGHT_DATA_API_KEY`). Authentication is done via the environment variable — no browser login needed.

---

## Phase 2 — Minimal Baseline Collector ✅

**Target:** `https://www.ycombinator.com/jobs`

**Collector ID:** `c_msyndhlihcuensmoe`

**Creation command:**
```bash
npx -p @brightdata/cli bdata scraper create \
  "https://www.ycombinator.com/jobs" \
  "Extract for each job listing: company_name and job_title." \
  --name ai-nexus-radar-minimal \
  --pretty --json --timeout 600
```

**Baseline run output (6 job postings):**
```json
[
  { "job_title": "Data Analytics AI Specialist", "product_page_url": "..." },
  { "job_title": "Quantitative Associate",         "product_page_url": "..." },
  { "job_title": "VP, Credit Card Partnerships",  "product_page_url": "..." },
  { "job_title": "Accountant",                    "product_page_url": "..." },
  { "job_title": "Finance Manager — Chartered Accountant", "product_page_url": "..." },
  { "job_title": "Head of Finance",              "product_page_url": "..." }
]
```

---

## Phase 3 — Self-Healing Loop ✅✅✅

**The heal prompt (plain-language — survives CSS changes):**
> *"Extend the existing scraper to also extract for each job listing: 1) company_name — the name of the company posting the job, 2) salary_range — any salary, compensation, pay range or equity information mentioned in the job posting, 3) tech_stack_tags — a list of technologies, programming languages, frameworks or tools mentioned in the job description, 4) posted_date — the date when the job was posted. Return all five fields together."*

**Approval envelope (preview_result) — all 5 fields:**
```json
{
  "company_name": "Corgi Insurance",
  "job_title": "Quantitative Associate",
  "salary_range": "£100K - £200K GBP",
  "tech_stack_tags": ["R", "Go", "4 more items"],
  "posted_date": "2 months"
}
```

| Step | Command |
|------|---------|
| Trigger heal | `npx -p @brightdata/cli bdata scraper heal c_msyndhlihcuensmoe "<prompt>" --pretty --json --timeout 600` |
| Approve | `npx -p @brightdata/cli bdata scraper approve c_msyndhlihcuensmoe` |
| Verify | `npx -p @brightdata/cli bdata scraper run c_msyndhlihcuensmoe "https://www.ycombinator.com/jobs" --pretty --json` |

---

## Phase 4 — Node.js Integration Script (Sentiment Pulse Engine)

**File:** `src/nexus-radar.js`

### What it does

1. Calls the Bright Data collector `c_msyndhlihcuensmoe` via the API
2. Transforms raw JSON into a **Sentiment Pulse Score (0–100)** using three signals:

| Signal | Weight | Logic |
|--------|--------|-------|
| **AI Density** | 60% | % of postings whose `tech_stack_tags` contain AI/ML keywords |
| **Salary Signal** | 20% | % of postings that expose a `salary_range` |
| **Freshness** | 20% | % of postings from the last 30 days |

3. Maps the score to a level: **HIGH (≥70)**, **MEDIUM (≥40)**, **LOW (<40)**

### Quick start

```bash
# From the project root
export BRIGHTDATA_API_KEY="de2aa9a8-b73f-4f85-bf4f-52ceae5d9c59"
node src/nexus-radar.js
```

### Sample output
```
🎯  Target:    https://www.ycombinator.com/jobs
📡  Collector: c_msyndhlihcuensmoe
──────────────────────────────────────────────────────────
📊  PULSE SCORE: 72/100  →  HIGH
   Breakdown:
   • AI Density : 60.0%  (3 of 5 postings)
   • Salary Sig : 20.0%
   • Freshness  : 20.0%
──────────────────────────────────────────────────────────
✨  AI-tagged postings (3):
   → Data Analytics AI Specialist  @  CityFurnish
     tags: AI, Python
   → Quantitative Associate  @  Corgi Insurance
     tags: R, Go
```

---

## Phase 5 — Health Monitor

**File:** `src/health-monitor.js`

### What it does

Scans scraped job data for **empty / missing fields** across all 5 schema fields. When it detects a gap above a configurable threshold (default: 30%), it prints the **exact self-heal CLI command** to repair that specific field.

### Usage

```bash
# Pipe a fresh scrape JSON into the monitor
npx -p @brightdata/cli bdata scraper run c_msyndhlihcuensmoe "https://www.ycombinator.com/jobs" \
  | node src/health-monitor.js

# Or pass a saved JSON file
node src/health-monitor.js scrape-output.json
```

### Sample output (gap detected)
```
🩺  Health Monitor — Collector c_msyndhlihcuensmoe
──────────────────────────────────────────────────────────
📦  Jobs scanned: 5

📋  Summary:
   3 field(s) need attention across 5 postings.

🚨  Recommendations:

   [WARNING]  Salary Range is empty in 5/5 postings (1.00).
   Field:     Salary Range  (salary_range)
   Empty:     5/5  (1.00)
   🔧  Run this to self-heal:
   npx -p @brightdata/cli bdata scraper heal c_msyndhlihcuensmoe \
     "The \"salary_range\" field is returning empty values. Fix the scraper to extract any salary, compensation, or pay range mentioned in each job posting." \
     --pretty --json --timeout 600
```

---

## Project Files

```
/home/user/
├── README.md                    ← This file
├── src/
│   ├── nexus-radar.js           ← Phase 4: Pulse engine + collector client
│   └── health-monitor.js       ← Phase 5: Gap detection + self-heal suggester
└── phase2_create.json           ← Phase 2 create output (collector ID proof)
└── phase3_heal.json             ← Phase 3 heal preview envelope (5-field proof)
```

---

## Key Artifacts

| Artifact | Value |
|----------|-------|
| **Collector ID** | `c_msyndhlihcuensmoe` |
| **Target URL** | `https://www.ycombinator.com/jobs` |
| **Scraper Name** | `ai-nexus-radar-minimal` |
| **CLI Version** | `0.3.5` |
| **API Key** | `de2aa9a8-...` (env: `BRIGHTDATA_API_KEY`) — *keep this secret* |

---

## Team Notes

- **Self-healing is the differentiator.** The `bdata scraper heal` command rewrites the scraper logic in-place using plain-language prompts. If Y Combinator changes their CSS classes, we don't touch code — we just re-run the heal with the same prompt.
- **The Pulse Score is the hook.** For the "Suit-Up" track demo, the Pulse Score gives judges a single number that captures whether the AI hiring wave is surging or calm.
- **Health Monitor closes the loop.** It's the "always-on" reliability layer — a cron job could run it every hour and auto-trigger a heal if gaps are detected.

---

**Good luck at the hackathon — let's win that DGX Spark! 🚀**
