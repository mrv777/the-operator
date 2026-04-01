# The Operator

**Autonomous Smart Money Convergence Trading Agent**

Every Nansen CLI challenge winner built a dashboard that shows you signals. None of them trade. The Operator does.

## What It Does

The Operator detects when 3+ independent smart money wallets buy the same token within 24 hours — a convergence signal with 65-75% precision. It then validates the token (liquidity, market cap, holder distribution), executes the trade via Nansen Trading, and manages the position with trailing stops and take-profit tiers. All P&L is real and on-chain verifiable.

```
SCAN → DETECT → VALIDATE → EXECUTE → MANAGE → TRACK
```

## Architecture

```
┌──────────────────────────────────────────────────┐
│              Docker Compose                       │
│                                                   │
│  ┌─────────────┐       ┌─────────────────────┐  │
│  │   Agent      │       │    Dashboard (Web)   │  │
│  │   esbuild    │       │    Next.js standalone│  │
│  │   compiled   │       │    6 pages + SSE     │  │
│  │              │       │                      │  │
│  │  Scans every │       │  Auth-gated UI       │  │
│  │  15 min      │       │  Real-time feed      │  │
│  └──────┬───────┘       └──────────┬───────────┘  │
│         │    Shared SQLite (WAL)   │              │
│         └──────────┬───────────────┘              │
│                    │                              │
│              operator.db                          │
└──────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 22, TypeScript |
| Framework | Next.js (App Router) |
| Agent | Standalone TS process, esbuild compiled |
| Data | Nansen CLI via shell exec + TTL cache |
| Trading | `nansen trade quote` + `nansen trade execute` |
| Prices | Jupiter Price API (free) |
| Database | SQLite + better-sqlite3 (WAL mode) |
| UI | shadcn/ui, Tailwind CSS, Recharts |
| Deploy | Docker Compose on VPS |

## Nansen Endpoints Used (13)

| Domain | Endpoint | Purpose |
|--------|----------|---------|
| Smart Money | `sm dex-trades` | Core scan — SM trading activity |
| Smart Money | `sm netflow` | Signal enrichment — net capital flows |
| Smart Money | `sm holdings` | Validation — current SM positions |
| Smart Money | `sm dcas` | Enrichment — DCA activity detection |
| Smart Money | `sm perp-trades` | Enrichment — perp activity |
| Smart Money | `sm historical-holdings` | Position monitoring — SM exit detection |
| Token | `token info` | Validation — liquidity, mcap, holders |
| Token | `token flow-intelligence` | Validation — detailed flow analysis |
| Token | `token dex-trades` | Validation — recent trading activity |
| Profiler | `profiler pnl-summary` | Wallet credibility scoring |
| Profiler | `profiler transactions` | Wallet activity analysis |
| Trading | `trade quote` | Get swap quote with price impact |
| Trading | `trade execute` | Execute trade on-chain |

## Setup

### Prerequisites

- Node.js 22+
- pnpm
- Docker & Docker Compose
- Nansen CLI (`npm install -g nansen-cli`)
- Nansen API key

### Local Development

```bash
git clone https://github.com/mrv777/the-operator.git
cd the-operator
pnpm install

# Create .env from template
cp .env.example .env
# Fill in NANSEN_API_KEY, DASHBOARD_TOKEN, etc.

# Run dashboard
pnpm dev

# Run agent (separate terminal)
pnpm agent:dev
```

### Docker Deployment

```bash
# Build and start both containers
docker compose build
docker compose up -d

# Check logs
docker compose logs agent --tail=30
docker compose logs web --tail=10
```

The dashboard is accessible at `http://localhost:3002`. Authenticate with the `DASHBOARD_TOKEN` value from `.env`.

## Configuration

All runtime parameters are in `config.json` and can be edited from the dashboard Settings page. Changes take effect on the next agent cycle.

Key parameters:
- `scanning.scanIntervalMs` — How often to scan (default: 900000 = 15 min)
- `convergence.minWallets` — Minimum SM wallets for convergence (default: 3)
- `convergence.minScore` — Minimum score to trade (default: 70)
- `execution.maxPositionPct` — Max portfolio % per position (default: 10%)
- `positionManagement.emergencyStopPct` — Emergency stop loss (default: 25%)

## Dashboard Pages

| Page | Description |
|------|-------------|
| Overview | Hero stats, pipeline visualization, live activity feed |
| Signals | Convergence events with scores, wallet details, drill-down |
| Trades | Execution log with tx hashes, slippage, fees |
| Positions | Open positions with live P&L, trailing stops |
| Portfolio | Equity curve, drawdown chart, key metrics |
| Settings | Config editor, agent pause/resume, token blocklist |

## Wallet

Solana wallet: `HaAp6...m68q`

## License

MIT
