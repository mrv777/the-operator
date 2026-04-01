# Session Prompts

## How to Use

1. Start a new Claude Code session in the `nansen-ai3/` directory
2. Paste the **Generic Preamble** first (every session)
3. Then paste the **Phase Prompt** for whichever phase you're working on
4. If resuming mid-phase, add a note like "I'm mid-phase, we already completed steps 1-3"

---

## Generic Preamble (paste every session)

```
Read @SPEC.md fully — it's the source of truth for this project. It contains architecture decisions, config format, DB schema, all endpoint details, and build phases with test gates.

Key context:
- This is "The Operator" — an autonomous SM convergence trading agent for Nansen CLI hackathon
- Solana only (Base is stretch goal, but keep code chain-abstracted)
- No subscription — 10x credit costs, budget $10-20/day
- config.json holds ALL runtime-tunable params, .env is secrets only
- SQLite with WAL mode, agent + dashboard are separate processes
- shadcn/ui + Tailwind + Recharts for dashboard
- pnpm as package manager
- After any significant changes, run typecheck (pnpm tsc --noEmit)
- Don't commit unless I ask
```

---

## Phase 0: Foundation + Risk Validation

```
We're starting Phase 0 — Foundation + Risk Validation. Read Section 16, Phase 0 in the spec for the full work list and test gate.

The goal is to eliminate all P0 unknowns before writing product code:

1. Scaffold the project: Next.js 15 (App Router), TypeScript, pnpm, folder structure matching the spec's Section 14
2. Install core deps: better-sqlite3, shadcn/ui, recharts, zod, tsx (dev)
3. Create config.json with all defaults from Section 10
4. Create .env.example with placeholders from Section 13
5. Then STOP and tell me — I need to manually run Nansen CLI commands to capture output samples and test wallet auth, credit costs, and rate limits. You can't do that part.

Do steps 1-4 now. For the folder structure, create placeholder files where needed (empty .ts files with a TODO comment) so the full structure exists.
```

---

## Phase 1: Data Layer + Nansen Client

```
We're starting Phase 1 — Data Layer + Nansen Client. Read Section 16, Phase 1 in the spec for the full work list and test gate.

Before starting: check if Phase 0 test gate items are complete (project scaffolded, config.json exists, .env.example exists). If the docs/cli-samples/ directory has captured CLI output, use those to define types. If not, define types from the Nansen docs and mark them as draft.

Build in this order:
1. lib/db/schema.ts — all tables from Section 12, WAL mode, busy_timeout
2. lib/db/queries.ts — insert/read for sm_trades, signals, trades, positions, portfolio_snapshots, agent_log, agent_state
3. lib/nansen/types.ts — TypeScript types for all endpoint responses
4. lib/nansen/client.ts — shell exec wrapper with TTL cache (Section 4.2) and retry (Section 9.3)
5. lib/nansen/endpoints.ts — typed functions for each endpoint
6. lib/prices/jupiter.ts — Jupiter Price API client
7. lib/utils/logger.ts — structured logger writing to stdout + agent_log table
8. agent/config.ts — load and validate config.json with Zod

After building each file, run typecheck. At the end, verify the full test gate from the spec.
```

---

## Phase 2: Convergence Engine

```
We're starting Phase 2 — Convergence Engine. Read Section 16, Phase 2 in the spec for the full work list and test gate.

Before starting: verify Phase 1 is complete — db schema creates tables, nansen client can exec commands, jupiter client works, config loads.

Build in this order:
1. agent/scanner.ts — poll sm dex-trades for Solana, upsert by tx_hash into sm_trades table
2. lib/scoring/convergence-score.ts — 4 base factors (wallet count 30%, label quality 25%, volume 20%, timing 25%) + on-demand enrichment bonuses
3. agent/convergence.ts — rolling 24h window, group trades by token, detect 3+ distinct SM label types, dedup logic (update existing signal within window, Section 4.4), contested flagging (Section 4.5)
4. agent/validator.ts — safety filters from Section 4.6 (liquidity, volume, mcap, holders, age, net direction), reads thresholds from config.json
5. agent/index.ts — basic agent loop: scan → detect → validate → log. NO execution yet — just detect signals and log them.

Key details:
- Wallet independence = label type only (simple check)
- Sell signals: flag as contested, don't filter
- Netflow/DCA fetched on-demand during validation only (not scheduled)
- Score >= 50 → validate. Score >= 70 → would trade (but no execution in this phase)
- Signal dedup: update existing signal within 24h, trade-once flag

After building, run the agent loop once manually to verify it fetches real data and the pipeline works end-to-end (even if no convergence events are found). Check the test gate.
```

---

## Phase 3: Trade Execution + Position Management

```
We're starting Phase 3 — Trade Execution + Position Management. Read Section 16, Phase 3 in the spec for the full work list and test gate.

Before starting: verify Phase 2 is complete — agent can scan, detect convergence, score, validate, and log signals.

Build in this order:
1. agent/executor.ts — quote → check price impact → execute (or halve + retry if impact > threshold). Handle all failure modes from Section 9.3 (never retry execute, only retry quote). Uses config for maxSlippage, maxPriceImpactPct, minTradeUsd.
2. agent/portfolio.ts — position sizing (fractional Kelly from config), exposure cap logic (reduce to fit, close weakest if at 50%), portfolio snapshot writing (every 15 min)
3. agent/position-manager.ts — fetch price via Jupiter, mcap-tiered trailing stops (Section 6.2), all 6 exit conditions (Section 6.3), exit execution via nansen trade

Wire into agent loop:
- Signal score >= 70 + not already traded → executor.ts
- Every cycle → position-manager checks all open positions
- Every 15 min → portfolio snapshot

IMPORTANT: Before executing any real trade, tell me and confirm. I want to manually approve the first trade to verify the flow works correctly. After that, it can run autonomously.

Check the test gate — we need at least one real buy + sell round-trip to confirm the full flow.
```

---

## Phase 4: Dashboard — Core Pages

```
We're starting Phase 4 — Dashboard. Read Section 16, Phase 4 in the spec for the full work list and test gate.

Before starting: verify Phase 3 is complete — agent can execute trades, manage positions, track P&L. There should be real data in the SQLite DB from testing.

Build the dashboard with shadcn/ui + Tailwind + Recharts. Dark theme (Section 8.7). All data comes from SQLite via API routes.

Build order:
1. app/layout.tsx — dark theme, nav sidebar, font setup (Inter + Space Grotesk mono for numbers)
2. app/globals.css — color scheme from Section 8.7
3. Bearer token auth middleware (Section 8.1) — DASHBOARD_TOKEN env var
4. API routes first: signals, trades, positions, portfolio, agent/status, agent/events (SSE), settings
5. Then pages: overview (hero stats + pipeline viz + activity feed), signals, trades, positions, portfolio, settings
6. SSE activity feed: poll agent_log WHERE id > cursor every 2-3s

Design priorities:
- Data-dense, not decorative
- Wallet addresses truncated, full on click with Solscan link
- Contested signals show ⚠️ badge
- All numbers use monospace font
- Green (#00E676) for profit, red (#FF5252) for loss, blue (#448AFF) for signals, amber (#FFD740) for warnings

Build all 6 pages. Check the test gate when done.
```

---

## Phase 5: Integration + Soak Test

```
We're starting Phase 5 — Integration + Soak Test. Read Section 16, Phase 5 in the spec for the full work list and test gate.

Before starting: verify Phase 4 is complete — all 6 dashboard pages render real data, auth works, SSE feeds.

Build order:
1. Dockerfile.agent — multi-stage build, esbuild compile, runs compiled JS
2. Dockerfile.web — Next.js production build
3. docker-compose.yml — 2 services, shared SQLite volume, restart: unless-stopped, env from .env
4. Test locally with docker compose up

Then I'll deploy to VPS and run the soak test (24-48h). During soak, monitor:
- Credit usage vs $10-20/day budget
- Signal quality
- Trade execution success rate
- P&L accuracy (DB vs on-chain)
- Error rate

After soak, we'll tune config.json together based on what we observe. Update the spec with findings.
```

---

## Phase 6: Polish + Demo

```
We're starting Phase 6 — Polish + Demo. Read Section 16, Phase 6 in the spec for the full work list and test gate.

Before starting: verify Phase 5 is complete — agent and dashboard running together for 24-48h, bugs fixed, config tuned.

Polish tasks:
1. Loading states, empty states, error states on all dashboard pages
2. Smooth animations (page transitions, number counters, activity feed scroll)
3. Pipeline visualization on overview page (Section 8.3)
4. Solscan links on all tx hashes and wallet addresses
5. Mobile responsiveness pass
6. Final README.md — setup instructions, architecture diagram, endpoint list, how to run

I'll handle the video recording/editing and tweet separately. Focus on making the dashboard look ship-quality.
```
