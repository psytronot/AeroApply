# AeroApply database

This directory contains the portable PostgreSQL schema exported from the Floot-hosted AeroApply project.

Export status (2026-09-01):
- Tables: `jobs`, `applications`, `agent_runs`, `audit_events`, `human_interventions`
- Data rows at export time: 0
- Foreign keys and the unique canonical job URL constraint are preserved.

Secrets, credentials, OAuth tokens, browser sessions, and database connection strings are intentionally excluded from Git.
