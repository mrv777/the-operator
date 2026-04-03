# The Operator — Demo Video Script

Target length: 2-3 minutes. Designed for a Remotion-style video or screen recording walkthrough.

---

## Scene 1: Hook (0:00 - 0:15)

**Visual:** Dashboard overview page with activity feed scrolling, positions showing live P&L.

**Narration:**
> "Every hackathon entry this week detects smart money signals. Ours is the only one that trades them autonomously — and proves it with real, on-chain P&L."

---

## Scene 2: The Problem (0:15 - 0:30)

**Visual:** Split screen — left side shows a typical SM dashboard with alerts, right side shows "Now what?" with a shrug emoji.

**Narration:**
> "Week 2 winners built the radar. But a radar doesn't fly the plane. When 3 smart money wallets independently buy the same token, that's not noise — it's consensus. The Operator acts on it."

---

## Scene 3: Architecture Overview (0:30 - 0:55)

**Visual:** Animated pipeline diagram: SCAN → DETECT → VALIDATE → EXECUTE → MANAGE → TRACK

**Narration:**
> "Every 20 minutes, we poll Nansen's smart money dex-trades. When 3+ wallets converge on the same token within 24 hours, we score the signal — weighting wallet count, label quality, volume, and timing."

> "New in this version: we profile each wallet's historical win rate via Nansen's profiler. A Fund with 65% win rate gets weighted higher than a '30D Smart Trader' who barely qualifies."

**Key data points to show:**
- 13 Nansen CLI endpoints used
- 4-factor convergence scoring (wallet 30%, label 25%, volume 20%, timing 25%)
- Enrichment bonuses: netflow, DCA, wallet win-rate (+10 to -5 points)

---

## Scene 4: Safety Layers (0:55 - 1:20)

**Visual:** Validation checklist with green checkmarks and one red X (GoPlus security block).

**Narration:**
> "Before any trade executes, every token passes through 7 safety filters. Liquidity, volume, market cap, token age, smart money net direction..."

> "And now, GoPlus Security — a free on-chain security API that catches what market data can't: honeypots, malicious mint authority, freeze authority, hidden transfer fees. If the contract is rigged, we block it — even if smart money bought in."

**Show:** A real GoPlus security block in the activity feed or Telegram alert:
`"🛡️ Security BLOCKED: TOKEN — GoPlus: mint authority flagged as malicious"`

---

## Scene 5: Live Execution (1:20 - 1:50)

**Visual:** Dashboard trades page showing a real BUY FILLED entry with tx hash linking to Solscan.

**Narration:**
> "When a signal passes all filters and scores above threshold, the agent sizes the position using fractional Kelly — 3% to 8% of portfolio based on conviction — gets a quote from Nansen trading, checks price impact, and executes."

> "Every trade has a Solscan-verifiable transaction hash. No paper trading, no simulations."

**Show:**
- Trade row: BUY, token symbol, amount, price impact, fee, tx hash link
- Telegram alert arriving in real-time: `"✅ BUY FILLED: TOKEN — $X.XX"`

---

## Scene 6: Position Management (1:50 - 2:15)

**Visual:** Positions page with open position cards showing live P&L, trailing stop levels.

**Narration:**
> "Once in a position, 6 independent exit conditions run continuously. Tiered trailing stops based on market cap — micro-caps get 25% leash, mid-caps get 15%. Take-profit tiers sell 25% at 2x and 3x. Smart money exit detection watches for the original wallets selling. And emergency stops prevent catastrophic losses."

**Show:**
- Position card with entry price, current price, unrealized P&L, trailing stop level
- Telegram exit alert: `"💰 EXIT: TOKEN — TRAILING_STOP, P&L: +$X.XX (+XX.X%)"`

---

## Scene 7: Portfolio & P&L (2:15 - 2:35)

**Visual:** Portfolio page with equity curve chart and key metrics.

**Narration:**
> "The portfolio page tracks everything: equity curve, win rate, profit factor, max drawdown. Snapshots every 15 minutes build the full history. All backed by on-chain transactions you can verify yourself."

**Show:**
- Equity curve chart
- Metrics: win rate, profit factor, total realized P&L
- Link to Solscan wallet showing matching balances

---

## Scene 8: Real-Time Alerts (2:35 - 2:50)

**Visual:** Phone screen showing Telegram bot messages — signal detected, trade executed, position exited.

**Narration:**
> "Telegram notifications keep you in the loop without watching the dashboard. New signals, trade executions, security blocks, and position exits — all pushed to your phone in real-time."

**Show sequence of Telegram messages:**
1. `🔔 New Signal: TOKEN (score: 72, 3 wallets, $45.2K volume)`
2. `✅ BUY FILLED: TOKEN — $5.00` (with Solscan link)
3. `💰 EXIT: TOKEN — TRAILING_STOP, P&L: +$1.25 (+25.0%)`

---

## Scene 9: Closing (2:50 - 3:00)

**Visual:** Dashboard overview with all sections visible, activity feed showing recent events.

**Narration:**
> "The Operator. Previous winners built the radar — we built the pilot. Detect, validate, execute, manage, prove. All autonomous, all on-chain, all verifiable."

**End card:** Project name, GitHub link, operator.cookd.wtf URL

---

## B-Roll / Supplementary Shots

Capture these during VPS testing for use as cutaways:

1. **Terminal:** Agent startup logs showing config loaded, chains scanned
2. **Terminal:** Convergence detection log with wallet count and score
3. **Terminal:** GoPlus security check passing/failing
4. **Terminal:** Wallet profiler win-rate enrichment log
5. **Dashboard:** SSE activity feed scrolling in real-time
6. **Dashboard:** Settings page showing config.json editor
7. **Solscan:** Transaction detail page for a real trade
8. **Phone:** Telegram bot chat with alerts

---

## Key Differentiators to Emphasize

1. **Only autonomous executor** — every other entry stops at detection
2. **Multi-wallet convergence** — 65-75% precision vs 45% single-wallet
3. **GoPlus security layer** — free on-chain safety that catches honeypots and rug mechanisms
4. **Wallet win-rate weighting** — not all "smart money" is equally smart
5. **On-chain verifiable P&L** — every trade has a tx hash, final balance matches chain
6. **Production infrastructure** — Docker, WAL SQLite, crash recovery, Telegram alerts
7. **Credit efficient** — $10-18/day with aggressive caching, free APIs for pricing + security
