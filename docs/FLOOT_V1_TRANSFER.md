# Floot → GitHub V1 transfer

Source: Floot project **AeroApply v1** (`71d567b0-510d-4dbf-b3ce-4e25052ca48a`), inspected 2026-09-02.

## What was recovered

- Mission Control frontend structure and visual language from `pages/_index.tsx`, `_index.module.css`, `base.css`.
- Five-agent contract: Planner, Coder, Tester, Reviewer, Executor.
- Executor allowlist and blind-submission prohibition.
- Job filtering, daily-cap, cooldown, duplicate detection, CAPTCHA/unmapped-question handling and resume validation.
- Resume parsing, resume-variant selection and cover-letter placeholder validation.
- Job-board connection contract and expiry/revocation behavior.
- Nemotron provider contract and health endpoint shape.
- Job policy, ATS review and monitor-jobs endpoint contracts.
- PostgreSQL schema for jobs, agent runs, applications, audit events and human interventions.
- V1 QA tests and repository-integration notes were inspected.

## Database state

Floot V1 had **zero rows** in all five tables at export time:

| Table | Rows |
|---|---:|
| agent_runs | 0 |
| applications | 0 |
| audit_events | 0 |
| human_interventions | 0 |
| jobs | 0 |

Therefore there was no user/application/job data to migrate. The portable schema is stored in `database/floot-v1-schema.sql`.

## Local recreation

The GitHub branch `floot-v1-port` contains a Vite/React recreation under `web/` that keeps the V1 graphite/lime mission-control visual system while calling the existing local Express/Playwright/Nemotron API.

Run:

```bash
npm install
npm run build
npx playwright install chromium
npm start
```

Open `http://localhost:8787`.

The UI deliberately keeps CAPTCHA/MFA/unknown-required-question cases as human gates and never exposes a blind-submit control.

## Important provenance note

Floot's seeded component library contains many generic UI components. The port does not copy unrelated seeded demo components wholesale. It recreates the application-specific V1 surface and contracts, reducing unnecessary dependencies and keeping the local build maintainable.
