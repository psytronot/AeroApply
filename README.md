# AeroApply v0.4 AgentTeam

A local-first aerospace + AI/ML job intelligence and browser-assistance cockpit for personal use.

## Included

- Candidate master profile and target-role taxonomy.
- Persistent local Chromium browser via Playwright.
- Nemotron integration through NVIDIA's OpenAI-compatible API.
- Deterministic fallback scoring when Nemotron is unavailable.
- Five-agent pipeline: Planner → Coder → Tester → Reviewer → Executor.
- Strict executor command allowlist: `npm test`, `npm run qa`, `npm run test-browser`.
- Job import, duplicate detection, scoring, tailoring, status persistence and known-field filling.
- Local QA fixture and browser/API smoke suite.
- No CAPTCHA/MFA bypass and no silent final application submission.

## Windows setup

1. Install Node.js 20+.
2. Open a terminal in this repository.
3. Run `npm install`.
4. Run `npm run install-browser`.
5. Copy `.env.example` to `.env` and set `NVIDIA_API_KEY` for Nemotron.
6. Run `npm start`.
7. Open `http://localhost:8787`.

## QA

Run:

```text
npm test
npm run qa
npm run test-browser
```

`npm test` validates the candidate profile and five-agent contracts. `npm run qa` exercises the API and dashboard against a deterministic local fixture. `npm run test-browser` validates that Playwright can launch Chromium.

## Safety model

AeroApply can inspect pages and fill verified candidate fields, but it does not bypass CAPTCHA/MFA, invent qualifications, make legal declarations, or silently submit an application. Human checkpoints remain explicit.

## Ruflo integration direction

Ruflo is treated as an orchestration/reference layer for planning, multi-agent coordination, browser automation and security patterns. AeroApply keeps its own domain model, Nemotron provider, job policy and execution safety gate instead of importing the entire Ruflo repository.
