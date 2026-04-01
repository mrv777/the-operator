# The Operator — Project Context

## What This Is
Autonomous SM (Smart Money) convergence trading agent for the Nansen CLI hackathon. Detects when 3+ independent SM wallets buy the same token within 24h, validates the signal, and executes trades via Nansen trading — then tracks real on-chain P&L.

## Architecture
- **Agent** (`agent/index.ts`): Standalone Node.js loop — scan, detect, validate, execute, manage positions. Compiled with esbuild for Docker.
- **Dashboard** (`app/`): Next.js App Router with shadcn/ui. 6 pages + 8 API routes + SSE activity feed.
- **Shared SQLite** (`data/operator.db`): WAL mode. Agent writes, dashboard reads. Both connect via `better-sqlite3`.
- **Config** (`config.json`): All runtime-tunable params. Dashboard settings page can edit it. Agent reads on each cycle.

## Commands
```bash
pnpm dev              # Next.js dashboard (port 3013)
pnpm agent:dev        # Agent loop (tsx)
pnpm typecheck        # tsc --noEmit
pnpm build            # Next.js production build
docker compose build  # Build both containers
docker compose up -d  # Run both containers
```

## Key Files
- `SPEC.md` — Full spec, architecture, DB schema, build phases, all endpoint details
- `config.json` — Runtime config (scan interval, thresholds, risk params)
- `agent/` — Agent loop, scanner, convergence detector, validator, executor, position manager
- `lib/nansen/` — CLI wrapper with TTL cache, retry, text parsers for trade commands
- `lib/db/` — SQLite schema + query functions
- `lib/prices/jupiter.ts` — Jupiter Price API for position monitoring (free)
- `app/api/` — Dashboard API routes (all require bearer token auth)

## Deployment
- VPS: `89.167.91.96`, projects in `/opt/operator`
- Domain: `operator.cookd.wtf` (SSL via Let's Encrypt)
- Nginx: config lives in `/opt/cookd/nginx.conf` (shared with cookd + snitch projects)
- Port: web on 3002 (host) -> 3000 (container)
- Secrets: `.env` on VPS (not in repo)

## Gotchas
- `better-sqlite3` is a native addon — must be external in esbuild bundle and installed separately in Docker runtime stage
- Nansen CLI `sm dex-trades` returns only 10 results by default. Use `--limit 100` for useful data.
- `--limit`, `--page`, `--fields` work but aren't shown in `--help`. Use `nansen schema` for full options.
- Next.js standalone output needs `output: "standalone"` in next.config.ts
- `CONFIG_PATH` env var controls where both agent and dashboard read/write config.json (shared Docker volume)
- Dashboard auth: `AuthShell` gates all pages. Token stored in localStorage, passed as Bearer header via `authFetch()`.
- The SSE activity feed passes the token as a query param (EventSource limitation).

## Conventions
- pnpm as package manager
- Conventional commits (feat:, fix:, chore:)
- Don't commit unless asked
- Run typecheck after significant changes
