# AeroApply

Production-oriented personal job-search and application cockpit.

## Architecture
- React/TypeScript operations dashboard
- Five-agent workflow: Planner → Coder → Tester → Reviewer → Executor
- Typed, allowlisted browser actions with a safety policy gate
- Playwright-based browser runner with human intervention for CAPTCHA/MFA/unknown critical questions
- Configurable AI provider gateway
- Job discovery, filtering, scoring, resume variants, screening-answer bank, application audit trail
- QA suites for interactive controls, bot lifecycle, profile pipeline, edge cases and application logs

## Safety
AeroApply never attempts to bypass CAPTCHA/MFA or other human verification. External application submission is gated by explicit policy and human confirmation unless a narrowly scoped autonomous mode is explicitly enabled.

## Development
Keep secrets out of source control. Configure provider credentials through deployment secrets/environment variables.
