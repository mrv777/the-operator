import type Database from "better-sqlite3";
import type { Config } from "./config";
import type { SignalRow, PositionRow } from "@/lib/db/queries";
import {
  getOpenPositions,
  getAgentState,
  setAgentState,
  insertPortfolioSnapshot,
  getPortfolioMetrics,
} from "@/lib/db/queries";
import { getJupiterPrices } from "@/lib/prices/jupiter";
import { logger } from "@/lib/utils/logger";

// ── Cash balance (stored in agent_state) ────────────────────────────

const CASH_KEY = "cash_balance_usd";
const DEFAULT_INITIAL_CASH = 50; // $50 starting bankroll (adjust via agent_state)

export function getCashBalance(db: Database.Database): number {
  const raw = getAgentState(db, CASH_KEY);
  if (raw === undefined) {
    // Initialize on first access
    setAgentState(db, CASH_KEY, String(DEFAULT_INITIAL_CASH));
    return DEFAULT_INITIAL_CASH;
  }
  return parseFloat(raw);
}

export function updateCashBalance(db: Database.Database, delta: number): void {
  const current = getCashBalance(db);
  setAgentState(db, CASH_KEY, String(current + delta));
}

export function setCashBalance(db: Database.Database, amount: number): void {
  setAgentState(db, CASH_KEY, String(amount));
}

// ── Portfolio valuation ─────────────────────────────────────────────

export interface PortfolioSnapshot {
  cashUsd: number;
  positionsValueUsd: number;
  totalValueUsd: number;
  openPositionCount: number;
  totalRealizedPnl: number;
  positions: Array<{
    id: number;
    token: string;
    symbol: string | null;
    currentPrice: number | null;
    currentValueUsd: number;
    unrealizedPnl: number;
  }>;
}

export async function getPortfolioSnapshot(
  db: Database.Database,
): Promise<PortfolioSnapshot> {
  const positions = getOpenPositions(db);
  const cashUsd = getCashBalance(db);
  const metrics = getPortfolioMetrics(db);

  // Fetch current prices for all open positions
  const mints = positions.map((p) => p.token_address);
  let prices: Record<string, number> = {};
  if (mints.length > 0) {
    try {
      prices = await getJupiterPrices(mints);
    } catch (err) {
      logger.warn("Jupiter price fetch failed for portfolio snapshot", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  let positionsValueUsd = 0;
  const positionDetails = positions.map((p) => {
    const currentPrice = prices[p.token_address] ?? null;
    const currentValueUsd = currentPrice
      ? (p.current_amount_token ?? 0) * currentPrice
      : p.entry_amount_usd; // fallback to entry value if price unavailable
    const unrealizedPnl = currentValueUsd - p.entry_amount_usd + p.realized_pnl;
    positionsValueUsd += currentValueUsd;

    return {
      id: p.id,
      token: p.token_address,
      symbol: p.token_symbol,
      currentPrice,
      currentValueUsd,
      unrealizedPnl,
    };
  });

  return {
    cashUsd,
    positionsValueUsd,
    totalValueUsd: cashUsd + positionsValueUsd,
    openPositionCount: positions.length,
    totalRealizedPnl: metrics.totalRealizedPnl,
    positions: positionDetails,
  };
}

// ── Position sizing (fractional Kelly via config score tiers) ────────

export function calculatePositionSize(
  db: Database.Database,
  signal: SignalRow,
  config: Config,
): number {
  const score = signal.convergence_score;
  const { positionSizing, execution } = config;

  // Determine allocation % based on score tier
  let allocationPct: number;
  if (score >= 90) {
    allocationPct = positionSizing.score90_100Pct;
  } else if (score >= 80) {
    allocationPct = positionSizing.score80_89Pct;
  } else {
    allocationPct = positionSizing.score70_79Pct;
  }

  // Cap at maxPositionPct
  allocationPct = Math.min(allocationPct, execution.maxPositionPct);

  // Calculate dollar amount from total portfolio value
  const cashUsd = getCashBalance(db);
  const positions = getOpenPositions(db);

  // Estimate total portfolio value (use entry values as approximation to avoid async price fetch)
  const positionsValueUsd = positions.reduce(
    (sum, p) => sum + p.entry_amount_usd,
    0,
  );
  const totalValue = cashUsd + positionsValueUsd;

  const tradeAmountUsd = totalValue * (allocationPct / 100);

  // Can't spend more than available cash
  return Math.min(tradeAmountUsd, cashUsd);
}

// ── Exposure cap ────────────────────────────────────────────────────

export function getAvailableExposure(
  db: Database.Database,
  config: Config,
): number {
  const cashUsd = getCashBalance(db);
  const positions = getOpenPositions(db);
  const positionsValueUsd = positions.reduce(
    (sum, p) => sum + p.entry_amount_usd,
    0,
  );
  const totalValue = cashUsd + positionsValueUsd;
  const maxExposureUsd = totalValue * (config.execution.maxTotalExposurePct / 100);
  const currentExposureUsd = positionsValueUsd;

  return Math.max(0, maxExposureUsd - currentExposureUsd);
}

export function isAtExposureCap(
  db: Database.Database,
  config: Config,
): boolean {
  return getAvailableExposure(db, config) <= 0;
}

/**
 * Find the weakest open position (lowest unrealized P&L ratio).
 * Used when exposure cap is hit and we need to close one to make room.
 */
export function findWeakestPosition(
  positions: PositionRow[],
  prices: Record<string, number>,
): PositionRow | null {
  if (positions.length === 0) return null;

  let weakest: PositionRow | null = null;
  let worstPnlRatio = Infinity;

  for (const p of positions) {
    const currentPrice = prices[p.token_address];
    if (!currentPrice) continue;

    const currentValue = (p.current_amount_token ?? 0) * currentPrice;
    const pnlRatio = (currentValue - p.entry_amount_usd) / p.entry_amount_usd;

    if (pnlRatio < worstPnlRatio) {
      worstPnlRatio = pnlRatio;
      weakest = p;
    }
  }

  return weakest;
}

// ── Snapshot writer ─────────────────────────────────────────────────

const LAST_SNAPSHOT_KEY = "last_snapshot_at";

export function shouldTakeSnapshot(db: Database.Database, config: Config): boolean {
  const last = getAgentState(db, LAST_SNAPSHOT_KEY);
  if (!last) return true;
  const elapsed = Date.now() - new Date(last).getTime();
  return elapsed >= config.portfolio.snapshotIntervalMs;
}

export async function writePortfolioSnapshot(
  db: Database.Database,
  config: Config,
): Promise<void> {
  const snapshot = await getPortfolioSnapshot(db);

  insertPortfolioSnapshot(db, {
    total_value_usd: snapshot.totalValueUsd,
    cash_balance_usd: snapshot.cashUsd,
    positions_value_usd: snapshot.positionsValueUsd,
    open_position_count: snapshot.openPositionCount,
    total_realized_pnl: snapshot.totalRealizedPnl,
    snapshot_at: new Date().toISOString(),
  });

  setAgentState(db, LAST_SNAPSHOT_KEY, new Date().toISOString());

  logger.info("Portfolio snapshot written", {
    totalValue: snapshot.totalValueUsd.toFixed(2),
    cash: snapshot.cashUsd.toFixed(2),
    positionsValue: snapshot.positionsValueUsd.toFixed(2),
    openPositions: snapshot.openPositionCount,
  });
}
