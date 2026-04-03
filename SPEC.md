# The Operator — Autonomous Smart Money Trading Agent

## SPEC v2.0 — Nansen CLI Hackathon Week 3 Submission

---

## 1. Concept

**The Operator** is an autonomous trading agent that detects when multiple smart money wallets independently converge on the same token, validates the signal, and executes trades via Nansen's trading infrastructure — then tracks real, on-chain-verifiable P&L.

Previous winners built the radar. We built the pilot.

Every Week 2 winner built a monitoring dashboard that stops at "here's a signal." The Operator closes the loop: **detect → validate → execute → manage → prove.**

### The Core Thesis

When 3+ independent smart money wallets buy the same token within 24 hours, that's not noise — it's consensus. Research shows this convergence signal achieves **65-75% precision**, compared to ~45% for single-wallet alerts. The Operator detects these convergence events and trades them autonomously with strict risk management.

### Supported Chains

**Solana** (primary). Base is a stretch goal. The codebase is chain-abstracted so adding Base later requires no refactoring — just new config and chain-specific adapters.

Solana is primary because:
- $0.00025/tx fees
- Sub-second finality
- Jupiter aggregation (best DEX routing)
- Jupiter Price API (free real-time price feeds for position monitoring)
- Where the SM memecoin/altcoin action is

---

## 2. Why This Wins

### Competitive Analysis of Week 2 Winners

| Winner | What They Built | What They're Missing |
|--------|----------------|---------------------|
| @rien_nft (Alpha Radar) | 6-stage SM monitoring pipeline, web dashboard | Stops at signals. Doesn't trade. |
| @edycutjong (NansenTerm) | TUI with live streaming, 246 tests | Shows data beautifully. Doesn't act on it. |
| @nmeksobh (nansen-terminal) | Bloomberg terminal, 8 chains, whale badges | Monitors everything. Executes nothing autonomously. |
| @luigi08001 (NansenScope) | 18 commands, x402, 5 signal detectors | Detects signals. Human must act. |

**The pattern:** All winners detect. None execute autonomously. All dashboards, no agents.

### What Our Previous Submissions Got Wrong

| Week | Project | Problem |
|------|---------|---------|
| 1 | Cookd (wallet roasts) | Entertainment, not alpha. Wrong category entirely. |
| 2 | The Snitch (forensics) | Impressive technically, but niche utility. Not a trading tool. |

### What The Operator Gets Right

| Dimension | How We Win |
|-----------|-----------|
| **Novel category** | First autonomous Nansen-powered trading agent. Not another dashboard. |
| **Closes the loop** | Signal → Validation → Execution → Position Management → P&L Tracking |
| **nansen-trading** | Bonus points. Deep integration with quote/execute flow. |
| **Real P&L** | On-chain verifiable. Can't fake it. |
| **Signal quality** | Convergence detection (65-75% precision) vs single-wallet alerts (45%) |
| **Nansen endpoint breadth** | 12+ endpoints across SM, token, profiler, and trading domains |
| **Runs 24/7** | Autonomous agent on VPS, not a one-shot tool |
| **Demo-able** | Video shows: signal detected → trade executed → profit tracked. Clear narrative. |

---

## 3. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    THE OPERATOR — Agent Loop                     │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  SCAN    │ →  │  DETECT  │ →  │ VALIDATE │ →  │ EXECUTE  │  │
│  │          │    │          │    │          │    │          │  │
│  │ Poll SM  │    │ Find     │    │ Risk     │    │ nansen   │  │
│  │ dex-     │    │ conver-  │    │ filter + │    │ trade    │  │
│  │ trades   │    │ gence    │    │ score    │    │ quote +  │  │
│  │ every    │    │ events   │    │ signal   │    │ execute  │  │
│  │ 10 min   │    │ (3+ SM   │    │ (>70 to  │    │          │  │
│  │          │    │ in 24h)  │    │ trade)   │    │          │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                                                      │          │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐       │          │
│  │ REPORT   │ ←  │  TRACK   │ ←  │ MANAGE   │ ←─────┘          │
│  │          │    │          │    │          │                   │
│  │ Daily    │    │ Real-time│    │ Trailing │                   │
│  │ summary  │    │ P&L per  │    │ stops,   │                   │
│  │ + dash-  │    │ position │    │ SM exit  │                   │
│  │ board    │    │ tracking │    │ detect,  │                   │
│  │          │    │          │    │ time     │                   │
│  │          │    │          │    │ exits    │                   │
│  └──────────┘    └──────────┘    └──────────┘                   │
└─────────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Node.js 22 + TypeScript |
| **Framework** | Next.js 15 (App Router) for dashboard |
| **Agent Core** | Standalone TypeScript process (tsx dev, esbuild prod) |
| **Data Source** | Nansen CLI (`nansen-cli`) via shell execution + in-memory TTL cache |
| **Trading** | `nansen trade quote` + `nansen trade execute` |
| **Price Feeds** | Jupiter Price API (free, real-time) for position monitoring |
| **Database** | SQLite via `better-sqlite3` (WAL mode, busy_timeout) |
| **UI** | shadcn/ui + Tailwind CSS + Recharts |
| **Auth** | Simple bearer token middleware |
| **Deployment** | Docker Compose (2 containers: agent + web) on Ubuntu VPS |
| **Package Manager** | pnpm |
| **Config** | `config.json` for all runtime-tunable parameters |

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| DB concurrency | WAL mode + 5s busy_timeout | Readers never block writers. Simple, proven at this scale. |
| Event bus (agent → dashboard) | DB polling with cursor on `agent_log` | SSE endpoint polls `WHERE id > lastSeenId` every 2-3s. Zero new dependencies, Docker-friendly. |
| Crash recovery | Trust DB + resume from last scan | Record last scan timestamp. Resume from there on restart. Saves credits vs full backfill. |
| Price monitoring | Jupiter Price API | Free, real-time. Reserves Nansen credits for signal detection and validation only. |
| AI integration | Skip for MVP | Deterministic pipeline is the intelligence. AI daily reports as stretch goal only. |
| Paper trading | Skip | Test with small real capital instead. Simpler, more authentic for demo. |

---

## 4. Signal Detection — The Convergence Engine

### 4.1 Scanning Phase

**Poll `smart-money/dex-trades`** for Solana every 10 minutes (configurable).

```
nansen smart-money dex-trades --chain solana
```

Each call returns recent SM DEX trades with:
- Wallet address + SM label type (Fund, Smart Trader, 30D/90D/180D Smart Trader)
- Token address + symbol
- Trade direction (buy/sell)
- Amount (USD)
- Timestamp
- Transaction hash

**Cost:** ~50 credits per call (no subscription = 10x rate) × 6/hour = **~300 credits/hour** for core scanning.

Additionally, supplementary endpoints are fetched **on-demand during validation only** (not on a schedule):
- `smart-money netflow` — aggregate capital flow direction
- `smart-money dcas` — Jupiter DCA detection (strong conviction signal)
- `smart-money holdings` — confirm SM is holding
- `smart-money perp-trades` — cross-reference perp positions

This on-demand approach saves significant credits compared to scheduled polling.

### 4.2 CLI Response Caching

An in-memory TTL cache wraps all Nansen CLI calls:
- **Cache key:** full command string (e.g., `nansen token info --token ABC --chain solana`)
- **Default TTL:** 5 minutes (configurable per endpoint)
- **Never cached:** `trade quote` and `trade execute` (always fresh)
- **Invalidation:** Cache entries for a token are invalidated when a trade is executed for that token

### 4.3 Convergence Detection

Maintain a **rolling 24-hour window** of SM buy events per token.

**Convergence Event** is triggered when:
1. **3+ distinct SM wallets** have bought the same token within 24 hours
2. Wallets are **independent** — checked via SM label type (if two wallets share the same label type, they count as one for the threshold; e.g., two "Fund" wallets = 1 unique label contribution)
3. All trades are **buys** (net positive direction)
4. Combined buy volume exceeds **$10K USD**

**Convergence Score (0-100):**

| Factor | Weight | Scoring |
|--------|--------|---------|
| Wallet count | 30% | 3 wallets = 50, 5 = 70, 8+ = 100 |
| SM label quality | 25% | Fund = 100, Smart Trader = 80, 30D = 60, 90D = 40, 180D = 20 |
| Volume concentration | 20% | Higher combined USD volume = higher score |
| Timing cluster | 25% | Trades closer together in time = higher score |

**On-demand enrichment** (fetched during validation for signals scoring >= 50):

| Factor | Bonus | Source |
|--------|-------|--------|
| Netflow confirmation | +5 to +10 points | `sm netflow` — positive netflow = bonus |
| DCA presence | +5 to +10 points | `sm dcas` — DCA orders = strong conviction |
| Wallet win-rate quality | -5 to +10 points | `profiler pnl-summary` — avg win rate across wallets |

Wallet win-rate tiers: ≥60% = +10, ≥50% = +5, ≥40% = 0, <40% = -5. Wallets with no profiler data are skipped (fail-open). Profiler results cached 1 hour.

**Minimum score to proceed to validation: 50**
**Minimum score to auto-trade: 70**

### 4.4 Signal Deduplication

When a convergence event is detected for a token that already has an active signal within the 24h window:
- **UPDATE** the existing signal (new wallet count, rescore)
- If the updated score crosses the trade threshold (>= 70) AND no trade has been executed for this signal → **trigger trade**
- If a trade was already executed for this signal → mark as `TRADED`, do not re-trigger
- Once the 24h window expires with no new SM activity, the signal expires and a fresh convergence event can create a new signal

### 4.5 Sell Signal Handling

If SM wallets are selling the same token while others are buying:
- **Do not filter** the convergence event
- **Flag as "contested"** on the dashboard with details of which wallets are selling
- The convergence score only counts buy-side wallets; sells are informational

### 4.6 Validation Phase

When a convergence event scores >= 50, run validation:

```
nansen token info --token <address> --chain solana
nansen token flow-intelligence --token <address> --chain solana
nansen smart-money netflow --chain solana --token <address>
```

**Safety Filters (ALL must pass):**

| Filter | Default Threshold | Configurable Key | Why |
|--------|-------------------|------------------|-----|
| GoPlus security | No dangerous flags | — | Reject honeypots, malicious mint/freeze authority, balance-mutable tokens |
| Liquidity | > $100K | `minLiquidityUsd` | Avoid illiquid traps |
| 24h Volume | > $50K | `minVolume24hUsd` | Ensure we can exit |
| Market Cap | > $500K | `minMcapUsd` | Filter dust tokens |
| Top 10 holders | < 50% supply | `maxTop10HolderPct` | Avoid concentrated ownership (rug risk) |
| Token age | > 3 days | `minTokenAgeDays` | Avoid brand-new scam tokens (configurable, default 3) |
| SM net direction | Net positive | — | Confirm SM is accumulating, not mixed |

**GoPlus Security Check** (free, no auth, fail-open):
Calls the GoPlus Security API before market-data filters. Hard-fails on: balance mutable authority, non-transferable tokens, closable token accounts, malicious mint/freeze authority, hidden transfer fees. Trusted tokens (e.g., USDC) bypass all checks. API errors or unknown tokens are treated as safe (fail-open) — GoPlus downtime never blocks trades.

If validation passes AND score >= 70 → proceed to execution.
If validation passes AND score 50-69 → add to watchlist (`WATCHING`), do not auto-trade.
If validation fails → discard signal (`FILTERED`), log reason.

---

## 5. Trade Execution

### 5.1 Position Sizing

**Starting capital:** TBD (wallet not yet set up — **Day 1 critical path item**)

**Fractional Kelly position sizing:**
- Score 70-79: 3% of portfolio
- Score 80-89: 5% of portfolio
- Score 90-100: 8% of portfolio
- Maximum single position: 10% of portfolio (hard cap)
- Maximum total exposure: 50% of portfolio (rest stays in SOL/USDC)

All position sizing parameters are configurable in `config.json`.

### 5.2 Exposure Cap Handling

When a new signal fires but total exposure is near the 50% cap:

1. **Reduce to fit:** Scale down the new position to whatever room remains. A score-90 signal that wants 8% but only 3% is available → take 3%.
2. **If at 50% cap:** Close the weakest open position (lowest current score or worst P&L) to make room for a stronger signal. Only if the new signal scores significantly higher than the weakest position's original signal.
3. **If even after closing weakest there's no room:** Skip and log as `CAPPED`.

### 5.3 Execution Flow

```bash
# Step 1: Get quote
nansen trade quote \
  --chain solana \
  --from USDC \
  --to <TOKEN_ADDRESS> \
  --amount <AMOUNT_IN_BASE_UNITS> \
  --slippage 0.01

# Step 2: Validate quote
# If price impact > maxPriceImpactPct (default 2%):
#   → Halve position size, re-quote once
#   → If still > threshold, skip and log as SKIPPED_IMPACT

# Step 3: Execute
nansen trade execute --quote <QUOTE_ID>
```

**Trade execution rules:**
- Maximum 1 trade per convergence event
- Minimum $10 per trade (configurable)
- Maximum slippage: 1% (configurable)
- If quote fails, retry once after 5 seconds. If still fails, skip and log.
- Price impact threshold: configurable (default 2%), halve and retry once if exceeded

### 5.4 Wallet Authentication

> **RISK ITEM:** Haven't tested how `nansen trade execute` handles auth. Need to verify early (Day 1-2):
> - Does it prompt interactively for a password?
> - Can it read from env var or flag?
> - Does `nansen auth` persist credentials?

### 5.5 Execution Logging

Every trade logged to SQLite with:
- Signal ID (which convergence event triggered it)
- Convergence score
- Token address, chain, symbol
- Entry price, amount, USD value
- Transaction hash
- Timestamp
- Nansen quote ID
- Fees paid

---

## 6. Position Management

### 6.1 Monitoring Loop

Every N minutes (configurable, default 5 min), for each open position:

1. **Check current price** — via Jupiter Price API (free, real-time)
2. **Check SM sentiment** — is SM still holding or exiting? (via `sm netflow` on-demand, cached)
3. **Update trailing stop** — track highest price seen, set stop based on mcap tier
4. **Check exit conditions**

### 6.2 Trailing Stop — Tiered by Market Cap

| Market Cap Tier | Trailing Stop % | Rationale |
|----------------|-----------------|-----------|
| Micro-cap (< $5M) | 25% from peak | High volatility — wider stop to avoid noise |
| Small-cap ($5M–$50M) | 20% from peak | Moderate volatility |
| Mid-cap ($50M+) | 15% from peak | Lower volatility — tighter stop acceptable |

All tier thresholds and stop percentages are configurable in `config.json`.

### 6.3 Exit Conditions (first one triggered wins)

| Condition | Action | Default | Configurable |
|-----------|--------|---------|-------------|
| **Trailing stop hit** | Sell 100% | Tiered by mcap (see above) | Yes |
| **SM exit detected** | Sell 100% | SM netflow turns significantly negative | Yes |
| **Take profit tier 1** | Sell 25% | Price up 2x from entry | Yes |
| **Take profit tier 2** | Sell 25% | Price up 3x from entry | Yes |
| **Time exit** | Sell 100% | 14 days with < 5% change | Yes |
| **Emergency stop** | Sell 100% | Price drops 25% from entry | Yes |

All exit parameters are configurable in `config.json`.

### 6.4 Exit Execution

```bash
nansen trade quote \
  --chain solana \
  --from <TOKEN_ADDRESS> \
  --to USDC \
  --amount <AMOUNT> \
  --slippage 0.02

nansen trade execute --quote <QUOTE_ID>
```

Higher slippage tolerance on exits (2%) to ensure we can get out.

---

## 7. P&L Tracking

### 7.1 Per-Trade Metrics

| Metric | How Calculated |
|--------|----------------|
| Entry price | USD value at execution |
| Current price | Jupiter Price API (real-time) |
| Unrealized P&L | (Current - Entry) × Position size |
| Realized P&L | Actual USD received on exit - USD spent on entry |
| Fees | Nansen trading fee (0.10-0.25%) + gas |
| Net P&L | Realized P&L - All fees |
| ROI % | Net P&L / Entry value × 100 |
| Hold time | Time between entry and exit |

### 7.2 Portfolio Metrics

| Metric | Description |
|--------|-------------|
| Total portfolio value | USDC balance + sum of all position values |
| Total realized P&L | Sum of all closed trade P&L |
| Win rate | Profitable trades / Total closed trades |
| Average win | Mean P&L of winning trades |
| Average loss | Mean P&L of losing trades |
| Profit factor | Gross profits / Gross losses |
| Max drawdown | Largest peak-to-trough decline in portfolio value |
| Signals detected | Total convergence events found |
| Signals traded | Events that passed validation and were executed |
| Signal-to-trade ratio | What % of detected signals we acted on |

### 7.3 Portfolio Snapshots

Snapshots taken every **15 minutes** (configurable). Each snapshot records:
- Total portfolio value
- Cash balance
- Positions value
- Open position count
- Realized P&L to date

### 7.4 On-Chain Verifiability

All trades happen through the Nansen wallet on Solana. Anyone can verify:
- The wallet address (published in demo)
- All transaction hashes (logged and displayed)
- Entry/exit prices from on-chain data
- Total P&L matches on-chain balance changes

---

## 8. Dashboard (Web UI)

### 8.1 Authentication

Simple bearer token authentication:
- `DASHBOARD_TOKEN` env var contains the shared secret
- All API routes (except SSE) check `Authorization: Bearer <token>` header
- Dashboard login page accepts the token and stores it in a cookie/localStorage
- Read-only public view is a stretch goal (no auth, hides settings/toggles)

### 8.2 Pages

| Route | Purpose |
|-------|---------|
| `/` | Landing page — hero stats, recent signals, live agent status |
| `/signals` | All detected convergence events with scores, status |
| `/trades` | Trade log — all executed trades with entry/exit/P&L |
| `/positions` | Current open positions with live P&L |
| `/portfolio` | Portfolio performance — P&L curve, metrics, drawdown chart |
| `/settings` | Agent configuration (thresholds, position sizing, config editor) |

### 8.3 Landing Page / Overview

**Header:**
- Agent status indicator: RUNNING (green pulse) / PAUSED
- Uptime counter: "Running for 3d 14h 22m"
- Last scan: "47 seconds ago"

**Hero Stats Row:**
```
PORTFOLIO VALUE    TOTAL P&L    WIN RATE    SIGNALS TODAY    OPEN POSITIONS
$217.43           +$17.43      68%         7               2
                  (+8.7%)
```

**Pipeline Visualization:**
```
SM Scan → Convergence Detect → Validate → EXECUTE → Manage → P&L
12 tokens   3 convergences     2 passed    1 traded   2 open   +8.7%
```

**Recent Activity Feed:**
- Real-time log of agent actions (scans, signals, trades, exits)
- Color-coded: green (profitable exit), red (loss), yellow (signal detected), blue (scan)
- Powered by SSE polling agent_log table with cursor

### 8.4 Signals Page

Table of all convergence events:

| Time | Token | Chain | SM Wallets | Score | Volume | Status | Contested | Action |
|------|-------|-------|------------|-------|--------|--------|-----------|--------|
| 2h ago | $BONK | SOL | 5 | 82 | $45K | TRADED | No | View |
| 6h ago | $DEGEN | SOL | 3 | 61 | $12K | WATCHING | Yes ⚠️ | View |
| 1d ago | $WIF | SOL | 4 | 74 | $28K | CLOSED (+12%) | No | View |

Click into a signal to see:
- Which SM wallets bought (truncated addresses by default, full on click + Solscan link)
- SM label for each wallet
- Timing chart of their purchases
- Validation results (which filters passed/failed)
- If contested: which SM wallets are selling
- Trade details if executed

### 8.5 Portfolio Page

- **Equity curve chart** — portfolio value over time (from 15-min snapshots)
- **Drawdown chart** — current and maximum drawdown
- **Trade distribution** — win/loss histogram
- **Key metrics** — win rate, profit factor, avg win/loss, total P&L

### 8.6 Settings Page

- View and edit `config.json` values
- Toggle agent pause/resume
- Add tokens to blocklist (never trade)
- View current credit usage estimate
- View and dismiss alerts

### 8.7 Design System

- **Dark mode** (crypto standard)
- **Color scheme:** Dark background (#0A0A0F), green for profits (#00E676), red for losses (#FF5252), blue for signals (#448AFF), amber for warnings (#FFD740)
- **Font:** Inter or Space Grotesk (monospace for numbers)
- **Component library:** shadcn/ui + Tailwind CSS
- **Charts:** Recharts
- **Aesthetic:** Clean, data-dense, terminal-inspired but not a terminal. Think "trading desk."

---

## 9. Agent Process Architecture

### 9.1 Two Separate Processes (Docker Compose)

```
┌─────────────────────────────┐    ┌─────────────────────────────┐
│    AGENT CONTAINER          │    │    WEB CONTAINER            │
│    (Node.js + tsx/esbuild)  │    │    (Next.js)                │
│                             │    │                             │
│  - Scan loop (10 min)       │    │  - Dashboard UI             │
│  - Convergence detection    │    │  - API routes for data      │
│  - Validation               │    │  - SSE via DB polling       │
│  - Trade execution          │    │  - Settings management      │
│  - Position management      │    │  - Bearer token auth        │
│  - P&L tracking             │    │                             │
│                             │    │                             │
│  Writes to → SQLite (WAL) ← Reads from                        │
│              (shared volume mount)                              │
└─────────────────────────────┘    └─────────────────────────────┘
```

The agent runs independently. If the dashboard crashes, the agent keeps trading. If the agent crashes, the dashboard still shows historical data.

**SQLite Configuration:**
- WAL mode enabled on connection
- `busy_timeout` set to 5000ms
- Agent is the primary writer; dashboard API routes are read-only (except settings)

### 9.2 Agent Loop (Pseudocode)

```typescript
while (running) {
  // 1. SCAN
  const trades = await scanSmartMoneyDexTrades('solana');
  await storeTrades(trades);

  // 2. DETECT
  const convergences = detectConvergenceEvents(trades, {
    windowHours: config.convergenceWindowHours,
    minWallets: config.minConvergenceWallets
  });

  for (const signal of convergences) {
    // 3. VALIDATE
    if (signal.score < 50) continue;

    const validation = await validateToken(signal.token, signal.chain);
    if (!validation.passed) {
      await logSignal(signal, 'FILTERED', validation.reason);
      continue;
    }

    // Enrich score with on-demand netflow/DCA data
    const enrichedScore = await enrichSignalScore(signal);

    // 4. EXECUTE (if score high enough)
    if (enrichedScore >= config.minConvergenceScore && !signal.alreadyTraded) {
      const positionSize = calculatePositionSize(enrichedScore, portfolio, config);
      const trade = await executeTrade(signal.token, signal.chain, positionSize);
      await logTrade(trade);
      await addPosition(trade);
    } else {
      await logSignal(signal, 'WATCHING');
    }
  }

  // 5. MANAGE existing positions
  for (const position of await getOpenPositions()) {
    const currentPrice = await getJupiterPrice(position.token);
    const exitSignal = checkExitConditions(position, currentPrice, config);
    if (exitSignal) {
      const exit = await executeExit(position, exitSignal.reason);
      await logExit(exit);
    }
  }

  // 6. UPDATE portfolio metrics (every 15 min)
  if (shouldSnapshot()) {
    await updatePortfolioSnapshot();
  }

  // Wait for next cycle
  await sleep(config.scanIntervalMs);
}
```

### 9.3 Error Handling

| Scenario | Strategy |
|----------|----------|
| Nansen CLI call fails | Wait 5 seconds, retry once. If still fails, log error and continue to next cycle. |
| Trade quote fails | Retry once after 5 seconds. If still fails, skip signal and log as `QUOTE_FAILED`. |
| Trade execute fails | Do NOT retry execution (risk of double trade). Log as `EXEC_FAILED`. |
| Rate limit hit | Log warning, skip remaining calls for this cycle, continue next cycle. |
| SQLite BUSY | Handled by WAL mode + 5s busy_timeout. If still fails, retry after 1s. |
| Agent crash | Docker restart policy (`unless-stopped`). Resumes from last scan timestamp in DB. |

---

## 10. Configuration — `config.json`

All runtime-tunable parameters live in a single `config.json` file at the project root. The agent reads this file at startup and can optionally reload it on each cycle (or via SIGHUP). The dashboard settings page reads and writes this file.

```json
{
  "scanning": {
    "scanIntervalMs": 600000,
    "chains": ["solana"],
    "quietHours": {
      "enabled": false,
      "startUtc": 2,
      "endUtc": 8,
      "reducedIntervalMs": 1800000
    }
  },
  "convergence": {
    "windowHours": 24,
    "minWallets": 3,
    "minScore": 70,
    "minVolumeUsd": 10000
  },
  "validation": {
    "minLiquidityUsd": 100000,
    "minVolume24hUsd": 50000,
    "minMcapUsd": 500000,
    "maxTop10HolderPct": 50,
    "minTokenAgeDays": 3
  },
  "execution": {
    "maxPositionPct": 10,
    "maxTotalExposurePct": 50,
    "maxSlippage": 0.01,
    "maxPriceImpactPct": 2,
    "minTradeUsd": 10
  },
  "positionManagement": {
    "checkIntervalMs": 300000,
    "trailingStop": {
      "microCap": { "maxMcap": 5000000, "stopPct": 25 },
      "smallCap": { "maxMcap": 50000000, "stopPct": 20 },
      "midCap": { "stopPct": 15 }
    },
    "emergencyStopPct": 25,
    "takeProfitTiers": [
      { "multiplier": 2, "sellPct": 25 },
      { "multiplier": 3, "sellPct": 25 }
    ],
    "timeExitDays": 14,
    "timeExitMinChangePct": 5
  },
  "positionSizing": {
    "score70_79Pct": 3,
    "score80_89Pct": 5,
    "score90_100Pct": 8
  },
  "portfolio": {
    "snapshotIntervalMs": 900000
  },
  "cache": {
    "defaultTtlMs": 300000,
    "perEndpoint": {
      "token-info": 300000,
      "sm-dex-trades": 300000,
      "sm-netflow": 600000
    }
  },
  "retry": {
    "maxRetries": 1,
    "retryDelayMs": 5000
  },
  "blocklist": []
}
```

---

## 11. Nansen CLI Endpoints Used

### Smart Money Domain (6 endpoints)

| Endpoint | Credits (no sub) | When Used | Purpose |
|----------|-----------------|-----------|---------|
| `sm dex-trades` | ~50 | Every 10 min (scheduled) | Core signal source — detect SM buying activity |
| `sm holdings` | ~50 | On-demand (validation) | Confirm SM is holding |
| `sm netflow` | ~50 | On-demand (validation + exit monitoring) | Aggregate capital flow direction per token |
| `sm dcas` | ~50 | On-demand (validation) | Detect Jupiter DCA orders (strong conviction signal) |
| `sm perp-trades` | ~50 | On-demand (validation) | Cross-reference perp positions |
| `sm historical-holdings` | ~50 | On-demand (deep dive) | Check if SM holding is new or longstanding |

### Token Domain (3 endpoints)

| Endpoint | Credits (no sub) | When Used | Purpose |
|----------|-----------------|-----------|---------|
| `token info` | ~10 | On-demand (validation) | Mcap, liquidity, holder stats |
| `token flow-intelligence` | ~50 | On-demand (validation) | Labeled flow analysis |
| `token dex-trades` | ~50 | On-demand (validation) | Recent trading activity for timing analysis |

### Profiler Domain (2 endpoints)

| Endpoint | Credits (no sub) | When Used | Purpose |
|----------|-----------------|-----------|---------|
| `profiler pnl-summary` | ~10 | On-demand (validation) | Check SM wallet track records |
| `profiler transactions` | ~10 | On-demand (deep dive) | Historical trade patterns |

### Trading Domain (2 endpoints)

| Endpoint | Credits | When Used | Purpose |
|----------|---------|-----------|---------|
| `trade quote` | 0 | On every trade attempt | Get swap quote + price impact |
| `trade execute` | 0 | On confirmed trade | Execute the swap |

**Total unique endpoints: 13** (across 4 domains + trading)

### Estimated Daily Credit Usage (Solana only, no subscription)

| Activity | Credits/Day | Notes |
|----------|-------------|-------|
| SM dex-trades scanning (6/hr × 24h × ~50 credits) | ~7,200 | Core scheduled scan |
| On-demand validation (~5-10 signals/day × ~200 credits each) | ~1,000-2,000 | Netflow, holdings, token info, etc. |
| Wallet profiling (~3-5 wallets × ~50 credits, 1hr cache) | ~750-2,500 | `profiler pnl-summary`, cached aggressively |
| Position monitoring (SM netflow checks, cached) | ~500-1,000 | Cached aggressively |
| GoPlus security checks | 0 | Free API, no auth |
| **Total** | **~9,450-12,700** | |

**Estimated daily cost: ~$10-18/day** (within budget target of $10-20/day)

> **RISK ITEM:** Credit costs and rate limits need to be verified against actual Nansen tier. These are estimates based on 10x multiplier assumption.

---

## 12. Database Schema

### Tables

```sql
-- Raw SM trade observations
CREATE TABLE sm_trades (
  id INTEGER PRIMARY KEY,
  wallet_address TEXT NOT NULL,
  sm_label TEXT NOT NULL,          -- Fund, Smart Trader, 30D, 90D, 180D
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  chain TEXT NOT NULL,             -- solana (base later)
  direction TEXT NOT NULL,         -- buy, sell
  amount_usd REAL,
  tx_hash TEXT,
  traded_at TEXT NOT NULL,         -- ISO timestamp
  scanned_at TEXT NOT NULL,
  UNIQUE(tx_hash)
);

-- Detected convergence events
CREATE TABLE signals (
  id INTEGER PRIMARY KEY,
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  chain TEXT NOT NULL,
  wallet_count INTEGER NOT NULL,
  convergence_score INTEGER NOT NULL,  -- 0-100
  combined_volume_usd REAL,
  wallets_json TEXT,                   -- JSON array of {address, label, amount, timestamp}
  is_contested INTEGER DEFAULT 0,     -- 1 if SM wallets are also selling
  contested_details TEXT,             -- JSON of sell-side wallet info
  status TEXT NOT NULL,                -- DETECTED, VALIDATING, PASSED, FILTERED, TRADED, WATCHING, EXPIRED, CAPPED
  filter_reason TEXT,
  detected_at TEXT NOT NULL,
  validated_at TEXT,
  UNIQUE(token_address, chain, detected_at)
);

-- Executed trades
CREATE TABLE trades (
  id INTEGER PRIMARY KEY,
  signal_id INTEGER REFERENCES signals(id),
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  chain TEXT NOT NULL,
  direction TEXT NOT NULL,         -- BUY, SELL
  amount_token REAL,
  amount_usd REAL,
  price_at_execution REAL,
  slippage_actual REAL,
  price_impact REAL,
  fee_usd REAL,
  quote_id TEXT,
  tx_hash TEXT,
  status TEXT NOT NULL,            -- PENDING, EXECUTED, FAILED, SKIPPED_IMPACT, QUOTE_FAILED, EXEC_FAILED
  executed_at TEXT NOT NULL
);

-- Open and closed positions
CREATE TABLE positions (
  id INTEGER PRIMARY KEY,
  signal_id INTEGER REFERENCES signals(id),
  entry_trade_id INTEGER REFERENCES trades(id),
  token_address TEXT NOT NULL,
  token_symbol TEXT,
  chain TEXT NOT NULL,
  entry_price REAL NOT NULL,
  entry_amount_usd REAL NOT NULL,
  current_amount_token REAL,       -- Decreases as we scale out
  highest_price_seen REAL,         -- For trailing stop
  trailing_stop_price REAL,        -- Currently set stop
  mcap_tier TEXT,                  -- micro, small, mid (determines stop %)
  status TEXT NOT NULL,            -- OPEN, PARTIALLY_CLOSED, CLOSED
  exit_reason TEXT,                -- trailing_stop, sm_exit, take_profit_1, take_profit_2, time_exit, emergency_stop, replaced
  realized_pnl REAL DEFAULT 0,
  total_fees REAL DEFAULT 0,
  opened_at TEXT NOT NULL,
  closed_at TEXT
);

-- Portfolio snapshots (for equity curve, every 15 min)
CREATE TABLE portfolio_snapshots (
  id INTEGER PRIMARY KEY,
  total_value_usd REAL NOT NULL,
  cash_balance_usd REAL NOT NULL,
  positions_value_usd REAL NOT NULL,
  open_position_count INTEGER,
  total_realized_pnl REAL,
  snapshot_at TEXT NOT NULL
);

-- Agent event log (for activity feed + SSE)
CREATE TABLE agent_log (
  id INTEGER PRIMARY KEY,
  event_type TEXT NOT NULL,        -- SCAN, SIGNAL, VALIDATE, TRADE, EXIT, ERROR, INFO
  severity TEXT DEFAULT 'INFO',    -- INFO, WARN, ERROR
  message TEXT NOT NULL,
  data_json TEXT,                  -- Optional structured data
  created_at TEXT NOT NULL
);

-- Agent state (for crash recovery)
CREATE TABLE agent_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
-- Keys: 'last_scan_at', 'agent_started_at', 'total_scans', etc.
```

---

## 13. Configuration — Environment Variables

```env
# Nansen
NANSEN_API_KEY=                    # API key for CLI auth
NANSEN_WALLET_PASSWORD=            # Wallet password for trade execution (TBD if needed)

# Dashboard Auth
DASHBOARD_TOKEN=                   # Bearer token for dashboard API auth

# Telegram Alerts (optional — silently skipped if not set)
TELEGRAM_BOT_TOKEN=                # Bot token from @BotFather
TELEGRAM_CHAT_ID=                  # Chat/group ID for alerts

# Database
DATABASE_PATH=./data/operator.db   # SQLite database path

# Dashboard
PORT=3000                          # Dashboard port
```

All runtime-tunable settings (thresholds, intervals, risk parameters) live in `config.json`, NOT in env vars. Env vars are reserved for secrets and infrastructure config only.

---

## 14. Project Structure

```
nansen-ai3/
├── SPEC.md
├── package.json
├── tsconfig.json
├── next.config.ts
├── config.json                     # Runtime-tunable settings (ALL thresholds, intervals, risk params)
├── docker-compose.yml              # 2 services: agent + web
├── Dockerfile.agent                # Agent container
├── Dockerfile.web                  # Dashboard container
├── .env.example
│
├── agent/                          # Standalone agent process
│   ├── index.ts                    # Entry point — starts the agent loop
│   ├── scanner.ts                  # Poll Nansen SM endpoints
│   ├── convergence.ts              # Convergence detection algorithm
│   ├── validator.ts                # Token validation + safety filters
│   ├── executor.ts                 # Trade execution via nansen-trading
│   ├── position-manager.ts         # Exit conditions + trailing stops
│   ├── portfolio.ts                # Portfolio metrics + position sizing
│   └── config.ts                   # Load + validate config.json
│
├── lib/                            # Shared code (agent + web)
│   ├── nansen/
│   │   ├── client.ts               # Nansen CLI wrapper (exec shell commands + TTL cache)
│   │   ├── types.ts                # Response types (defined from docs, adjusted after testing)
│   │   └── endpoints.ts            # Typed functions for each endpoint
│   ├── prices/
│   │   ├── jupiter.ts              # Jupiter Price API client (free, real-time)
│   │   └── dexscreener.ts          # DexScreener API (free, no auth)
│   ├── security/
│   │   └── goplus.ts               # GoPlus Security API — token safety checks (free)
│   ├── notifications/
│   │   ├── telegram.ts             # Telegram Bot API — send alerts (optional)
│   │   └── formatters.ts           # Format events into readable alert messages
│   ├── db/
│   │   ├── schema.ts               # SQLite schema + migrations + WAL setup
│   │   └── queries.ts              # All database operations
│   ├── scoring/
│   │   └── convergence-score.ts    # Convergence scoring + enrichment bonuses
│   └── utils/
│       ├── format.ts               # Number/date formatting
│       └── logger.ts               # Structured logging
│
├── app/                            # Next.js dashboard
│   ├── layout.tsx
│   ├── page.tsx                    # Overview / landing
│   ├── globals.css
│   ├── signals/
│   │   └── page.tsx                # Signals list
│   ├── trades/
│   │   └── page.tsx                # Trade log
│   ├── positions/
│   │   └── page.tsx                # Open positions
│   ├── portfolio/
│   │   └── page.tsx                # P&L charts + metrics
│   ├── settings/
│   │   └── page.tsx                # Agent configuration
│   └── api/
│       ├── signals/route.ts
│       ├── trades/route.ts
│       ├── positions/route.ts
│       ├── portfolio/route.ts
│       ├── agent/
│       │   ├── status/route.ts
│       │   ├── toggle/route.ts     # POST pause/resume
│       │   └── events/route.ts     # SSE (polls agent_log with cursor)
│       ├── settings/route.ts       # GET/POST config.json
│       └── middleware.ts           # Bearer token auth
│
├── components/
│   ├── AgentStatus.tsx
│   ├── PipelineViz.tsx
│   ├── SignalCard.tsx
│   ├── TradeRow.tsx
│   ├── PositionCard.tsx
│   ├── EquityCurve.tsx             # Recharts
│   ├── ActivityFeed.tsx
│   ├── StatsRow.tsx
│   └── ConvergenceDetail.tsx
│
├── data/                           # SQLite database files (gitignored)
│   └── operator.db
│
└── public/
    └── (static assets)
```

---

## 15. Risk Items — Must Validate Early (Day 1-2)

| Risk | Action Required | Priority |
|------|----------------|----------|
| Nansen CLI output format | Run every endpoint, capture actual output, adjust types | **P0** |
| Wallet auth for trade execution | Test `nansen trade execute` auth flow (interactive? env? flag?) | **P0** |
| Actual credit costs per call | Run calls, check billing, confirm 10x assumption | **P0** |
| Rate limits for our tier | Test actual limits, adjust scan frequency if needed | **P0** |
| Wallet funding | Create Nansen wallet, fund with SOL + USDC | **P1** |
| Jupiter Price API integration | Test API, confirm response format for Solana tokens | **P1** |

---

## 16. Build Phases

Each phase ends with a **test gate** — a set of verifiable checks that must pass before moving to the next phase. After each phase, update this spec and any relevant docs with findings.

---

### Phase 0: Foundation + Risk Validation

**Goal:** Eliminate all P0 unknowns. Don't write product code until these are answered.

**Work:**
1. Project scaffolding: `pnpm create next-app`, tsconfig, eslint, folder structure
2. Install core deps: `better-sqlite3`, `shadcn/ui`, `recharts`, `zod`
3. Create `config.json` with all default values
4. Create `.env.example` with secret placeholders
5. Run every Nansen CLI endpoint manually, capture raw output to `docs/cli-samples/`
6. Test `nansen trade quote` and `nansen trade execute` auth flow
7. Confirm actual credit cost per call — update estimates in this spec
8. Test rate limits — how many calls/min before throttled?
9. Test Jupiter Price API — fetch price for a known Solana token
10. Create Nansen wallet (if not already done), note address

**Test Gate:**
- [ ] `pnpm dev` starts Next.js without errors
- [ ] `config.json` loads and validates (manually or with a test script)
- [ ] Raw CLI output captured for: `sm dex-trades`, `sm netflow`, `sm holdings`, `sm dcas`, `token info`, `token flow-intelligence`, `trade quote`
- [ ] Wallet auth method documented (flag, env, keychain, or interactive + workaround)
- [ ] Actual credit costs per endpoint recorded and spec updated
- [ ] Jupiter Price API returns a valid price for a Solana token
- [ ] All P0 risk items resolved or have documented workaround

**Spec Update:** Revise Section 11 (credit estimates), Section 5.4 (wallet auth), and `lib/nansen/types.ts` design based on real CLI output.

---

### Phase 1: Data Layer + Nansen Client

**Goal:** SQLite database works, Nansen CLI wrapper fetches and stores real data.

**Work:**
1. `lib/db/schema.ts` — create all tables, WAL mode, busy_timeout, migrations
2. `lib/db/queries.ts` — insert/read functions for sm_trades, signals, agent_log, agent_state
3. `lib/nansen/types.ts` — TypeScript types based on captured CLI output (from Phase 0)
4. `lib/nansen/client.ts` — shell exec wrapper with TTL cache, retry logic, error handling
5. `lib/nansen/endpoints.ts` — typed functions for each endpoint (`getSmDexTrades`, `getTokenInfo`, etc.)
6. `lib/prices/jupiter.ts` — Jupiter Price API client
7. `lib/utils/logger.ts` — structured logger that writes to both stdout and agent_log table
8. `agent/config.ts` — load, validate, and type config.json (with Zod)

**Test Gate:**
- [ ] `schema.ts` creates all tables on fresh DB, WAL mode confirmed (`PRAGMA journal_mode` returns `wal`)
- [ ] Insert and read sm_trades round-trips correctly
- [ ] `client.ts` executes `nansen smart-money dex-trades --chain solana`, parses response, returns typed data
- [ ] Cache works: second call within TTL returns cached data (no shell exec)
- [ ] Retry works: simulated failure retries once then returns error
- [ ] Jupiter client returns a real-time price for SOL, USDC, and at least one memecoin
- [ ] `config.ts` loads config.json and throws on invalid values
- [ ] Typecheck passes: `pnpm tsc --noEmit`

---

### Phase 2: Convergence Engine

**Goal:** Agent can scan, detect convergence events, score them, and store signals.

**Work:**
1. `agent/scanner.ts` — poll `sm dex-trades` for Solana, store new trades (upsert by tx_hash)
2. `lib/scoring/convergence-score.ts` — scoring algorithm (4 base factors + on-demand enrichment)
3. `agent/convergence.ts` — rolling 24h window, group by token, detect 3+ wallets, dedup logic
4. `agent/validator.ts` — safety filters (liquidity, volume, mcap, holders, age, net direction)
5. `agent/index.ts` — basic agent loop: scan → detect → validate → log (no execution yet)
6. Wire up signal deduplication (update existing within 24h window)
7. Wire up "contested" flagging (SM sells detected)

**Test Gate:**
- [ ] Run agent loop once manually — it fetches real SM trades and stores them in DB
- [ ] Plant 3+ fake SM trades for the same token in DB → convergence detection fires
- [ ] Scoring produces expected values for known inputs (write a few test cases)
- [ ] Validation correctly filters a low-liquidity token and passes a valid one
- [ ] Signal dedup: second detection for same token updates existing signal, doesn't create new
- [ ] Contested flag: signal with SM sells gets `is_contested = 1`
- [ ] Agent log table has entries for each step (SCAN, SIGNAL, VALIDATE)
- [ ] Typecheck passes

**Spec Update:** Record any scoring adjustments or filter threshold changes based on real data.

---

### Phase 3: Trade Execution + Position Management

**Goal:** Agent can open and close real positions via Nansen Trading.

**Work:**
1. `agent/executor.ts` — quote → validate impact → execute (or halve + retry)
2. `agent/portfolio.ts` — position sizing (fractional Kelly), exposure cap logic, close-weakest logic
3. `agent/position-manager.ts` — Jupiter price check, mcap-tiered trailing stops, all exit conditions
4. Wire execution into agent loop (signal score >= 70 → trade)
5. Wire position management into agent loop (check exits every cycle)
6. Portfolio snapshots every 15 minutes
7. Complete agent loop: scan → detect → validate → execute → manage → snapshot

**Test Gate:**
- [ ] Execute a real trade: buy a small amount ($10) of a known Solana token via `trade quote` + `trade execute`
- [ ] Trade appears in `trades` table with tx_hash, price, fees
- [ ] Position created in `positions` table with correct entry price
- [ ] Position manager detects current price via Jupiter, updates `highest_price_seen`
- [ ] Trailing stop calculation is correct for each mcap tier (micro/small/mid)
- [ ] Execute a real exit: sell the token back to USDC
- [ ] Exit recorded with realized P&L, exit reason, fees
- [ ] Portfolio snapshot written with correct values
- [ ] Exposure cap: simulate near-cap scenario, verify position sizing reduces
- [ ] Price impact handling: verify halve-and-retry logic with a low-liquidity token (or mock)
- [ ] Typecheck passes

**Spec Update:** Record actual slippage, fees, and price impact observed. Adjust defaults in config.json if needed.

---

### Phase 4: Dashboard — Core Pages

**Goal:** All 6 dashboard pages render real data from the SQLite database.

**Work:**
1. `app/layout.tsx` — dark theme, nav sidebar, shadcn/ui setup
2. `app/globals.css` — color scheme, fonts (Inter, Space Grotesk for numbers)
3. `app/api/middleware.ts` — bearer token auth on all API routes
4. API routes: `signals`, `trades`, `positions`, `portfolio`, `agent/status`, `settings`
5. `app/page.tsx` — overview: hero stats, pipeline viz, activity feed
6. `app/signals/page.tsx` — signals table with score, status, contested flag, drill-down
7. `app/trades/page.tsx` — trade log with entry/exit/P&L
8. `app/positions/page.tsx` — open positions with live P&L (Jupiter prices via client-side fetch)
9. `app/portfolio/page.tsx` — equity curve (Recharts), drawdown, key metrics
10. `app/settings/page.tsx` — config.json editor, pause/resume toggle, blocklist
11. `app/api/agent/events/route.ts` — SSE endpoint polling agent_log with cursor
12. `components/ActivityFeed.tsx` — real-time feed via SSE
13. Wallet addresses: truncated by default, full on click with Solscan link

**Test Gate:**
- [ ] Dashboard loads at localhost:3000 with dark theme
- [ ] Auth: unauthenticated request to any API route returns 401
- [ ] Auth: valid bearer token allows access
- [ ] Overview page shows real stats from DB (or zeros if empty)
- [ ] Signals page lists signals from DB, click-through shows wallet details
- [ ] Trades page shows executed trades with tx hashes
- [ ] Positions page shows open positions with current price (from Jupiter)
- [ ] Portfolio page renders equity curve from snapshots
- [ ] Settings page displays current config.json, can save changes
- [ ] SSE activity feed updates when new agent_log rows appear
- [ ] All pages responsive (at least desktop + tablet)
- [ ] Typecheck passes, no console errors

---

### Phase 5: Integration + Soak Test

**Goal:** Agent and dashboard run together end-to-end. Let it soak with real data.

**Work:**
1. Docker Compose: `Dockerfile.agent` (esbuild compile), `Dockerfile.web` (Next.js build), shared SQLite volume
2. `docker-compose.yml` — 2 services, restart policy `unless-stopped`, env vars from `.env`
3. Test crash recovery: kill agent container, restart, verify it resumes from last scan
4. Test concurrent access: agent writing + dashboard reading simultaneously
5. Run agent for 24-48 hours with small capital, monitor:
   - Credit usage vs budget
   - Signal quality (are convergence events real or noise?)
   - Trade execution success rate
   - P&L tracking accuracy (compare DB to on-chain)
   - Error rate in agent_log
6. Tune config.json based on observations (thresholds, intervals, stop levels)
7. Fix bugs surfaced during soak test

**Test Gate:**
- [ ] `docker compose up` starts both containers successfully
- [ ] Dashboard accessible on VPS IP:3000 with auth
- [ ] Agent scans, detects, validates, and (if signals found) trades autonomously
- [ ] Kill agent container → restart → agent resumes from correct point (no missed scans, no duplicate trades)
- [ ] Dashboard shows live data while agent is writing
- [ ] Daily credit usage within $10-20 target
- [ ] No unhandled errors in agent_log over 24h
- [ ] Portfolio value in DB matches on-chain wallet balance (within fees)
- [ ] config.json changes from dashboard settings page take effect on next agent cycle

**Spec Update:** Record observed credit usage, signal frequency, and any config.json tuning decisions.

---

### Phase 6: Polish + Demo

**Goal:** Ship-quality dashboard, compelling demo video, submission ready.

**Work:**
1. Dashboard polish: loading states, empty states, error states, animations
2. Pipeline visualization on overview page
3. Solscan links on all tx hashes and wallet addresses
4. Mobile responsiveness pass (judges may view on phone)
5. Record demo footage — capture real signals, trades, P&L over the soak period
6. Cut 60-90s video following the Scene 1-5 script in Section 17
7. Write tweet copy
8. Final README.md for GitHub repo (setup instructions, architecture diagram, endpoint list)
9. Deploy to production VPS with real domain (optional: Nginx + SSL)
10. Capture wallet address, screenshot P&L with tx hashes for proof points

**Test Gate:**
- [ ] Dashboard looks polished — no broken layouts, empty flickers, or unstyled elements
- [ ] All 6 pages functional with real data
- [ ] Demo video is 60-90s, shows full loop (signal → validate → execute → P&L)
- [ ] Tweet drafted with video, @nansen_ai, #NansenCLI
- [ ] GitHub repo clean: no secrets in code, .env.example present, README complete
- [ ] VPS deployment accessible (if public demo planned)
- [ ] On-chain trades verifiable via Solscan links in the video/dashboard

---

### Phase Summary

| Phase | Focus | Key Deliverable |
|-------|-------|-----------------|
| **0** | Foundation + Risk Validation | All P0 unknowns resolved, project scaffolded |
| **1** | Data Layer + Nansen Client | DB + CLI wrapper working with real data |
| **2** | Convergence Engine | Signal detection + scoring + validation pipeline |
| **3** | Trade Execution + Positions | Real trades executed, positions managed |
| **4** | Dashboard | All 6 pages with real data |
| **5** | Integration + Soak Test | 24-48h autonomous run, bugs fixed, config tuned |
| **6** | Polish + Demo | Video, tweet, submission |

---

## 17. Demo Strategy (reference Phase 6)

### The Video (60-90 seconds)

**Scene 1 (0-15s): The Hook**
> "Every Nansen CLI challenge winner built a dashboard that shows you signals. None of them trade. The Operator does."

Show: dashboard with agent running, green "LIVE" indicator.

**Scene 2 (15-40s): The Signal**
> "Right now, 4 smart money wallets have independently bought $TOKEN in the last 18 hours. Convergence score: 84. The Operator validates the token — liquidity, holder distribution, market cap — all clear."

Show: signals page with the convergence event, SM wallets listed (truncated), score highlighted.

**Scene 3 (40-55s): The Trade**
> "Score above 70. The Operator executes autonomously via Nansen Trading. $12 position on Solana. Transaction hash on-chain."

Show: trade execution log, tx hash link to Solscan.

**Scene 4 (55-75s): The Results**
> "48 hours later. $TOKEN up 28%. Trailing stop managing the exit. Every trade verifiable on-chain."

Show: portfolio page with equity curve, P&L stats, open positions.

**Scene 5 (75-90s): The Pitch**
> "13 Nansen endpoints. Real money. Real P&L. They built the radar. I built the pilot."
> "Built with @nansen_ai CLI + nansen-trading. #NansenCLI"

Show: endpoint count, final dashboard shot.

### The Tweet

```
The Operator — Autonomous Smart Money Trading Agent built with @nansen_ai CLI

They built the radar. I built the pilot.

Detects when 3+ SM wallets converge on the same token → validates → auto-executes via nansen-trading → tracks real P&L on-chain.

13 endpoints. Real money. Fully autonomous.

#NansenCLI

[video]
```

### Proof Points
- Link to wallet address on Solscan (verifiable trades)
- Screenshot of P&L (with tx hashes visible)
- GitHub repo link
- Live dashboard URL (auth-protected, share read-only view)

---

## 18. Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Lose money on trades | Small positions (3-8% each), tiered trailing stops, hard stop-loss (25%), max 50% exposure |
| No convergence signals during demo | Record footage over several days. Compile best moments. |
| Credit budget exhaustion | Track daily usage, configurable scan frequency, on-demand supplementary calls |
| Trade execution failures | Retry once, then skip and log. Never force a trade. Never retry execution (double-trade risk). |
| Token rugs despite filters | Emergency stop ensures max loss is 25% of position |
| Agent crashes | Docker restart policy (`unless-stopped`). State persisted in DB. Resume from last scan. |
| Price impact too high | Halve position and retry once. Skip if still too high. |
| Wallet auth blocks automation | P0 risk item — test Day 1 |

---

## 19. Success Criteria

### For the Competition
- [ ] Video demo showing full loop: signal → validate → execute → P&L
- [ ] 13+ Nansen endpoints used
- [ ] nansen-trading integration (bonus points)
- [ ] Running 24/7 on VPS
- [ ] Clean dashboard with real data (all 6 pages)
- [ ] On-chain verifiable trades
- [ ] Posted on X with @nansen_ai #NansenCLI

### For Making Money
- [ ] Positive P&L after 7 days (even if small)
- [ ] Win rate > 55%
- [ ] No catastrophic losses (no single trade > -25%)
- [ ] System runs autonomously without manual intervention

### Stretch Goals
- [ ] Base chain support
- [ ] AI-generated daily intelligence report (Gemini)
- [ ] Telegram alerts for new signals
- [ ] Public read-only dashboard view
- [ ] Publish as ClawHub skill
