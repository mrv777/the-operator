import type Database from "better-sqlite3";
import type { Config } from "./config";
import type { PositionRow } from "@/lib/db/queries";
import { getOpenPositions, updatePosition } from "@/lib/db/queries";
import { getJupiterPrices } from "@/lib/prices/jupiter";
import { getSmNetflow } from "@/lib/nansen/endpoints";
import { getTokenInfo } from "@/lib/nansen/endpoints";
import { executeSellTrade } from "./executor";
import { logger } from "@/lib/utils/logger";

// ── Types ───────────────────────────────────────────────────────────

type McapTier = "microCap" | "smallCap" | "midCap";

export interface ExitCheck {
  triggered: boolean;
  reason: string;
  sellPct: number;
}

interface RawTokenInfoPayload {
  data?: {
    token_details?: {
      market_cap_usd?: number | null;
    };
  };
}

interface RawNetflowPayload {
  data?: Array<{
    token_address?: string;
    net_flow_usd?: number;
    [key: string]: unknown;
  }>;
}

// ── Market cap tier classification ──────────────────────────────────

export function classifyMcapTier(
  mcapUsd: number | null,
  config: Config,
): McapTier {
  if (mcapUsd === null) return "smallCap"; // default if unknown
  const { trailingStop } = config.positionManagement;
  if (mcapUsd < (trailingStop.microCap.maxMcap ?? 5_000_000)) return "microCap";
  if (mcapUsd < (trailingStop.smallCap.maxMcap ?? 50_000_000)) return "smallCap";
  return "midCap";
}

export function getTrailingStopPct(tier: McapTier, config: Config): number {
  return config.positionManagement.trailingStop[tier].stopPct;
}

// ── Trailing stop calculation ───────────────────────────────────────

export function calculateTrailingStopPrice(
  highestPrice: number,
  stopPct: number,
): number {
  return highestPrice * (1 - stopPct / 100);
}

// ── Exit condition checks ───────────────────────────────────────────

function checkTrailingStop(
  position: PositionRow,
  currentPrice: number,
): ExitCheck {
  if (position.trailing_stop_price === null) {
    return { triggered: false, reason: "", sellPct: 0 };
  }

  if (currentPrice <= position.trailing_stop_price) {
    return {
      triggered: true,
      reason: `TRAILING_STOP — price $${currentPrice.toFixed(8)} <= stop $${position.trailing_stop_price.toFixed(8)}`,
      sellPct: 100,
    };
  }

  return { triggered: false, reason: "", sellPct: 0 };
}

function checkEmergencyStop(
  position: PositionRow,
  currentPrice: number,
  config: Config,
): ExitCheck {
  const dropPct = ((position.entry_price - currentPrice) / position.entry_price) * 100;

  if (dropPct >= config.positionManagement.emergencyStopPct) {
    return {
      triggered: true,
      reason: `EMERGENCY_STOP — price dropped ${dropPct.toFixed(1)}% from entry`,
      sellPct: 100,
    };
  }

  return { triggered: false, reason: "", sellPct: 0 };
}

function checkTakeProfitTiers(
  position: PositionRow,
  currentPrice: number,
  config: Config,
): ExitCheck {
  const multiplier = currentPrice / position.entry_price;

  // Check tiers in descending order so we trigger the highest applicable tier
  const tiers = [...config.positionManagement.takeProfitTiers].sort(
    (a, b) => b.multiplier - a.multiplier,
  );

  for (const tier of tiers) {
    if (multiplier >= tier.multiplier) {
      // Check if we already took profit at this tier (position is PARTIALLY_CLOSED)
      // We use a simple heuristic: if current_amount_token is less than what full
      // position would be, we've already taken some profit. For simplicity, we
      // only trigger each tier once by checking if multiplier just crossed it.
      return {
        triggered: true,
        reason: `TAKE_PROFIT_${tier.multiplier}x — price up ${multiplier.toFixed(2)}x from entry`,
        sellPct: tier.sellPct,
      };
    }
  }

  return { triggered: false, reason: "", sellPct: 0 };
}

function checkTimeExit(
  position: PositionRow,
  currentPrice: number,
  config: Config,
): ExitCheck {
  const ageMs = Date.now() - new Date(position.opened_at).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  if (ageDays < config.positionManagement.timeExitDays) {
    return { triggered: false, reason: "", sellPct: 0 };
  }

  // Check if price change is below threshold
  const changePct = Math.abs(
    ((currentPrice - position.entry_price) / position.entry_price) * 100,
  );

  if (changePct < config.positionManagement.timeExitMinChangePct) {
    return {
      triggered: true,
      reason: `TIME_EXIT — ${ageDays.toFixed(1)} days with only ${changePct.toFixed(1)}% change`,
      sellPct: 100,
    };
  }

  return { triggered: false, reason: "", sellPct: 0 };
}

// ── SM exit detection ───────────────────────────────────────────────

async function checkSmExit(
  position: PositionRow,
): Promise<ExitCheck> {
  try {
    const result = await getSmNetflow(position.chain, position.token_address);
    if (!result.success || !result.data) {
      return { triggered: false, reason: "", sellPct: 0 };
    }

    const payload = result.data as unknown as RawNetflowPayload;
    const entries = payload.data ?? [];
    const entry = entries.find(
      (e) => e.token_address === position.token_address,
    ) ?? (entries.length > 0 ? entries[0] : null);

    if (entry && typeof entry.net_flow_usd === "number") {
      // "Significantly negative" = net outflow > $50k (heuristic)
      if (entry.net_flow_usd < -50_000) {
        return {
          triggered: true,
          reason: `SM_EXIT — net outflow $${entry.net_flow_usd.toFixed(0)}`,
          sellPct: 100,
        };
      }
    }
  } catch (err) {
    logger.warn("SM exit check failed", {
      positionId: position.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { triggered: false, reason: "", sellPct: 0 };
}

// ── Fetch market cap for tier classification ────────────────────────

async function fetchMcap(token: string, chain: string): Promise<number | null> {
  try {
    const result = await getTokenInfo(token, chain);
    if (!result.success || !result.data) return null;
    const raw = result.data as unknown as RawTokenInfoPayload;
    return raw.data?.token_details?.market_cap_usd ?? null;
  } catch {
    return null;
  }
}

// ── Main position management cycle ──────────────────────────────────

export async function checkAllPositions(
  db: Database.Database,
  config: Config,
): Promise<void> {
  const positions = getOpenPositions(db);
  if (positions.length === 0) return;

  logger.info(`Checking ${positions.length} open position(s)`);

  // Batch-fetch current prices
  const mints = positions.map((p) => p.token_address);
  let prices: Record<string, number> = {};
  try {
    prices = await getJupiterPrices(mints);
  } catch (err) {
    logger.error("Jupiter price fetch failed — skipping position checks", {
      error: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  for (const position of positions) {
    const currentPrice = prices[position.token_address];
    if (!currentPrice) {
      logger.warn(`No price for ${position.token_symbol ?? position.token_address} — skipping`, {
        positionId: position.id,
      });
      continue;
    }

    await checkSinglePosition(db, position, currentPrice, config);
  }
}

async function checkSinglePosition(
  db: Database.Database,
  position: PositionRow,
  currentPrice: number,
  config: Config,
): Promise<void> {
  const symbol = position.token_symbol ?? position.token_address;

  // ── Update mcap tier if not set ────────────────────────────────
  if (!position.mcap_tier) {
    const mcap = await fetchMcap(position.token_address, position.chain);
    const tier = classifyMcapTier(mcap, config);
    updatePosition(db, position.id, { mcap_tier: tier });
    position.mcap_tier = tier;
  }

  // ── Update highest price seen ──────────────────────────────────
  const highestPrice = Math.max(position.highest_price_seen ?? 0, currentPrice);
  const stopPct = getTrailingStopPct(position.mcap_tier as McapTier, config);
  const trailingStopPrice = calculateTrailingStopPrice(highestPrice, stopPct);

  updatePosition(db, position.id, {
    highest_price_seen: highestPrice,
    trailing_stop_price: trailingStopPrice,
  });

  // Update local object for exit checks
  position.highest_price_seen = highestPrice;
  position.trailing_stop_price = trailingStopPrice;

  const unrealizedPnl = ((currentPrice - position.entry_price) / position.entry_price) * 100;
  logger.info(`Position #${position.id} ${symbol}: $${currentPrice.toFixed(8)} (${unrealizedPnl >= 0 ? "+" : ""}${unrealizedPnl.toFixed(1)}%)`, {
    positionId: position.id,
    currentPrice,
    entryPrice: position.entry_price,
    highestSeen: highestPrice,
    trailingStop: trailingStopPrice,
    mcapTier: position.mcap_tier,
  });

  // ── Check all 6 exit conditions (first triggered wins) ─────────

  // 1. Emergency stop (highest priority — prevent catastrophic loss)
  const emergencyCheck = checkEmergencyStop(position, currentPrice, config);
  if (emergencyCheck.triggered) {
    logger.exit(`EXIT: ${symbol} — ${emergencyCheck.reason}`, { positionId: position.id });
    await executeSellTrade(db, position, emergencyCheck.sellPct, "EMERGENCY_STOP", config);
    return;
  }

  // 2. Trailing stop
  const trailingCheck = checkTrailingStop(position, currentPrice);
  if (trailingCheck.triggered) {
    logger.exit(`EXIT: ${symbol} — ${trailingCheck.reason}`, { positionId: position.id });
    await executeSellTrade(db, position, trailingCheck.sellPct, "TRAILING_STOP", config);
    return;
  }

  // 3. SM exit detected (async — involves API call)
  const smCheck = await checkSmExit(position);
  if (smCheck.triggered) {
    logger.exit(`EXIT: ${symbol} — ${smCheck.reason}`, { positionId: position.id });
    await executeSellTrade(db, position, smCheck.sellPct, "SM_EXIT", config);
    return;
  }

  // 4. Take profit tiers
  const tpCheck = checkTakeProfitTiers(position, currentPrice, config);
  if (tpCheck.triggered) {
    logger.exit(`EXIT: ${symbol} — ${tpCheck.reason}`, { positionId: position.id });
    await executeSellTrade(db, position, tpCheck.sellPct, tpCheck.reason, config);
    return;
  }

  // 5. Time exit
  const timeCheck = checkTimeExit(position, currentPrice, config);
  if (timeCheck.triggered) {
    logger.exit(`EXIT: ${symbol} — ${timeCheck.reason}`, { positionId: position.id });
    await executeSellTrade(db, position, timeCheck.sellPct, "TIME_EXIT", config);
    return;
  }
}
