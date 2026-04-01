import type Database from "better-sqlite3";
import type { Config } from "./config";
import type { SmTradeRow, SignalRow } from "@/lib/db/queries";
import {
  getRecentSmTrades,
  getActiveSignal,
  insertSignal,
  updateSignal,
  getTradesBySignal,
} from "@/lib/db/queries";
import {
  calculateConvergenceScore,
  type ConvergenceScoreResult,
} from "@/lib/scoring/convergence-score";
import { logger } from "@/lib/utils/logger";

// ── Types ───────────────────────────────────────────────────────────

interface WalletInfo {
  address: string;
  label: string;
  amount_usd: number;
  timestamp: string;
  direction: string;
}

export interface ConvergenceEvent {
  tokenAddress: string;
  tokenSymbol: string | null;
  chain: string;
  buyTrades: SmTradeRow[];
  sellTrades: SmTradeRow[];
  distinctLabels: string[];
  walletCount: number;
  combinedVolumeUsd: number;
  score: ConvergenceScoreResult;
  isContested: boolean;
  /** If this is an update to an existing signal */
  existingSignalId: number | null;
  /** If a trade was already executed for this signal */
  alreadyTraded: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

function getDistinctBuyLabels(buyTrades: SmTradeRow[]): string[] {
  const seen = new Set<string>();
  for (const t of buyTrades) {
    seen.add(t.sm_label);
  }
  return [...seen];
}

function buildWalletsJson(trades: SmTradeRow[]): WalletInfo[] {
  return trades.map((t) => ({
    address: t.wallet_address,
    label: t.sm_label,
    amount_usd: t.amount_usd ?? 0,
    timestamp: t.traded_at,
    direction: t.direction,
  }));
}

function buildContestedDetails(sellTrades: SmTradeRow[]): WalletInfo[] {
  return sellTrades.map((t) => ({
    address: t.wallet_address,
    label: t.sm_label,
    amount_usd: t.amount_usd ?? 0,
    timestamp: t.traded_at,
    direction: "sell",
  }));
}

// ── Core detection ──────────────────────────────────────────────────

/**
 * Group trades by token, detect convergence events (3+ distinct SM label types buying).
 * Handles dedup: updates existing signal within 24h window.
 * Handles contested flagging: SM sells flagged but don't filter.
 */
export function detectConvergenceEvents(
  db: Database.Database,
  config: Config,
): ConvergenceEvent[] {
  const events: ConvergenceEvent[] = [];

  for (const chain of config.scanning.chains) {
    const allTrades = getRecentSmTrades(db, chain, config.convergence.windowHours);

    if (allTrades.length === 0) continue;

    // Group by token
    const byToken = new Map<string, SmTradeRow[]>();
    for (const trade of allTrades) {
      const key = trade.token_address;
      if (!byToken.has(key)) byToken.set(key, []);
      byToken.get(key)!.push(trade);
    }

    // Track near-misses for logging
    let bestNearMiss: { token: string; wallets: number; volume: number } | null = null;

    for (const [tokenAddress, trades] of byToken) {
      const buyTrades = trades.filter((t) => t.direction === "buy");
      const sellTrades = trades.filter((t) => t.direction === "sell");

      if (buyTrades.length === 0) continue;

      // Convergence = distinct wallet addresses buying the same token
      const distinctWallets = new Set(buyTrades.map((t) => t.wallet_address));
      const distinctLabels = getDistinctBuyLabels(buyTrades);
      const walletCount = distinctWallets.size;

      // Track near-misses (2+ wallets but below threshold)
      if (walletCount >= 2 && walletCount < config.convergence.minWallets) {
        if (!bestNearMiss || walletCount > bestNearMiss.wallets) {
          bestNearMiss = {
            token: buyTrades[0].token_symbol ?? tokenAddress.slice(0, 12),
            wallets: walletCount,
            volume: buyTrades.reduce((s, t) => s + (t.amount_usd ?? 0), 0),
          };
        }
      }

      // Need 3+ distinct wallets
      if (walletCount < config.convergence.minWallets) continue;

      // Combined buy volume must exceed threshold
      const combinedVolumeUsd = buyTrades.reduce(
        (sum, t) => sum + (t.amount_usd ?? 0),
        0,
      );
      if (combinedVolumeUsd < config.convergence.minVolumeUsd) continue;

      // Calculate convergence score
      const score = calculateConvergenceScore({
        buyTrades,
        distinctLabels,
      });

      // Contested = SM wallets selling same token
      const isContested = sellTrades.length > 0;

      // Check for existing active signal (dedup)
      const existing = getActiveSignal(
        db,
        tokenAddress,
        chain,
        config.convergence.windowHours,
      );

      let alreadyTraded = false;
      if (existing) {
        // Check if trade was already executed for this signal
        const signalTrades = getTradesBySignal(db, existing.id);
        alreadyTraded = signalTrades.some(
          (t) => t.status === "EXECUTED" && t.direction === "BUY",
        );
      }

      events.push({
        tokenAddress,
        tokenSymbol: buyTrades[0].token_symbol,
        chain,
        buyTrades,
        sellTrades,
        distinctLabels,
        walletCount,
        combinedVolumeUsd,
        score,
        isContested,
        existingSignalId: existing?.id ?? null,
        alreadyTraded,
      });
    }

    // Log near-miss for tuning visibility
    if (events.length === 0 && bestNearMiss) {
      logger.signal(`Near-miss: ${bestNearMiss.token} has ${bestNearMiss.wallets} wallets (need ${config.convergence.minWallets})`, {
        chain,
        token: bestNearMiss.token,
        walletCount: bestNearMiss.wallets,
        volume: bestNearMiss.volume,
      });
    }
  }

  return events;
}

// ── Persist signals ─────────────────────────────────────────────────

export function persistConvergenceEvent(
  db: Database.Database,
  event: ConvergenceEvent,
): SignalRow {
  const walletsJson = JSON.stringify(buildWalletsJson([...event.buyTrades, ...event.sellTrades]));
  const contestedDetails = event.isContested
    ? JSON.stringify(buildContestedDetails(event.sellTrades))
    : null;

  if (event.existingSignalId !== null) {
    // Dedup: update existing signal with new data
    logger.signal(`Updating existing signal #${event.existingSignalId} for ${event.tokenSymbol ?? event.tokenAddress}`, {
      tokenAddress: event.tokenAddress,
      chain: event.chain,
      walletCount: event.walletCount,
      score: event.score.total,
      previousSignalId: event.existingSignalId,
    });

    updateSignal(db, event.existingSignalId, {
      wallet_count: event.walletCount,
      convergence_score: event.score.total,
      combined_volume_usd: event.combinedVolumeUsd,
      wallets_json: walletsJson,
      is_contested: event.isContested ? 1 : 0,
      contested_details: contestedDetails,
    });

    // Return the updated row (re-read from DB)
    const stmt = db.prepare("SELECT * FROM signals WHERE id = ?");
    return stmt.get(event.existingSignalId) as SignalRow;
  }

  // New signal
  const status = event.score.total >= 50 ? "DETECTED" : "DETECTED";
  const id = insertSignal(db, {
    token_address: event.tokenAddress,
    token_symbol: event.tokenSymbol,
    chain: event.chain,
    wallet_count: event.walletCount,
    convergence_score: event.score.total,
    combined_volume_usd: event.combinedVolumeUsd,
    wallets_json: walletsJson,
    is_contested: event.isContested ? 1 : 0,
    contested_details: contestedDetails,
    status,
    filter_reason: null,
    detected_at: new Date().toISOString(),
    validated_at: null,
  });

  logger.signal(`New convergence event for ${event.tokenSymbol ?? event.tokenAddress}`, {
    signalId: id,
    tokenAddress: event.tokenAddress,
    chain: event.chain,
    walletCount: event.walletCount,
    distinctLabels: event.distinctLabels,
    combinedVolumeUsd: event.combinedVolumeUsd,
    score: event.score.total,
    isContested: event.isContested,
  });

  const stmt = db.prepare("SELECT * FROM signals WHERE id = ?");
  return stmt.get(id) as SignalRow;
}
