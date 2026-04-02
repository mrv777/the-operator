import type Database from "better-sqlite3";
import type { Config } from "./config";
import type { SmTradeRow } from "@/lib/db/queries";
import { insertSmTrades } from "@/lib/db/queries";
import { setAgentState } from "@/lib/db/queries";
import { getSmDexTrades } from "@/lib/nansen/endpoints";
import { logger } from "@/lib/utils/logger";

// ── Raw CLI trade shape ─────────────────────────────────────────────
// The actual Nansen CLI `sm dex-trades` returns swap records, not
// directional trades. Each record has a bought side and a sold side.

interface RawCliTrade {
  chain: string;
  block_timestamp: string;
  transaction_hash: string;
  trader_address: string;
  trader_address_label: string;
  token_bought_address: string;
  token_sold_address: string;
  token_bought_amount: number;
  token_sold_amount: number;
  token_bought_symbol: string;
  token_sold_symbol: string;
  token_bought_age_days: number | null;
  token_sold_age_days: number | null;
  token_bought_market_cap: number | null;
  token_sold_market_cap: number | null;
  token_bought_fdv: number | null;
  token_sold_fdv: number | null;
  trade_value_usd: number;
}

// Known stablecoin / base asset addresses to determine trade direction
const BASE_ASSETS = new Set([
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", // USDC
  "So11111111111111111111111111111111111111112",       // SOL
  "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",   // USDT
]);

function isBaseAsset(address: string): boolean {
  return BASE_ASSETS.has(address);
}

/**
 * Infer a SM label from the trader_address_label field.
 * The CLI doesn't provide a structured label type — we derive it from
 * the label string. Empty label means the wallet is still SM-listed
 * (the endpoint only returns SM wallets) but label is unknown.
 */
function inferSmLabel(label: string): string {
  if (!label) return "Smart Trader";
  const lower = label.toLowerCase();
  if (lower.includes("fund")) return "Fund";
  if (lower.includes("180d")) return "180D Smart Trader";
  if (lower.includes("90d")) return "90D Smart Trader";
  if (lower.includes("30d")) return "30D Smart Trader";
  if (lower.includes("smart")) return "Smart Trader";
  // Wallets with ENS-style labels or other labels are SM wallets
  return "Smart Trader";
}

/**
 * Convert a raw CLI swap record into 1-2 SmTradeRow entries.
 * A swap "sold A, bought B" becomes:
 * - A BUY of the non-base token (if one side is base)
 * - A SELL of the non-base token (if one side is base)
 * - If neither side is base, we generate both a buy and a sell row
 */
function mapRawTradeToRows(raw: RawCliTrade): Omit<SmTradeRow, "id">[] {
  const rows: Omit<SmTradeRow, "id">[] = [];
  const now = new Date().toISOString();
  const smLabel = inferSmLabel(raw.trader_address_label);
  const tradedAt = raw.block_timestamp.endsWith("Z")
    ? raw.block_timestamp
    : raw.block_timestamp + "Z";

  const boughtIsBase = isBaseAsset(raw.token_bought_address);
  const soldIsBase = isBaseAsset(raw.token_sold_address);

  if (soldIsBase && !boughtIsBase) {
    // Sold SOL/USDC to buy token → this is a BUY of the bought token
    rows.push({
      wallet_address: raw.trader_address,
      sm_label: smLabel,
      token_address: raw.token_bought_address,
      token_symbol: raw.token_bought_symbol,
      chain: raw.chain,
      direction: "buy",
      amount_usd: raw.trade_value_usd,
      tx_hash: raw.transaction_hash,
      traded_at: tradedAt,
      scanned_at: now,
    });
  } else if (boughtIsBase && !soldIsBase) {
    // Sold token to buy SOL/USDC → this is a SELL of the sold token
    rows.push({
      wallet_address: raw.trader_address,
      sm_label: smLabel,
      token_address: raw.token_sold_address,
      token_symbol: raw.token_sold_symbol,
      chain: raw.chain,
      direction: "sell",
      amount_usd: raw.trade_value_usd,
      tx_hash: raw.transaction_hash,
      traded_at: tradedAt,
      scanned_at: now,
    });
  } else {
    // Token-to-token swap — record both sides
    rows.push({
      wallet_address: raw.trader_address,
      sm_label: smLabel,
      token_address: raw.token_sold_address,
      token_symbol: raw.token_sold_symbol,
      chain: raw.chain,
      direction: "sell",
      amount_usd: raw.trade_value_usd,
      tx_hash: raw.transaction_hash + ":sell",
      traded_at: tradedAt,
      scanned_at: now,
    });
    rows.push({
      wallet_address: raw.trader_address,
      sm_label: smLabel,
      token_address: raw.token_bought_address,
      token_symbol: raw.token_bought_symbol,
      chain: raw.chain,
      direction: "buy",
      amount_usd: raw.trade_value_usd,
      tx_hash: raw.transaction_hash + ":buy",
      traded_at: tradedAt,
      scanned_at: now,
    });
  }

  return rows;
}

// ── Public API ──────────────────────────────────────────────────────

export interface ScanResult {
  success: boolean;
  tradesFound: number;
  tradesInserted: number;
  chain: string;
}

export async function scanSmDexTrades(
  db: Database.Database,
  config: Config,
): Promise<ScanResult[]> {
  const results: ScanResult[] = [];

  for (const chain of config.scanning.chains) {
    logger.scan(`Polling SM dex-trades for ${chain}`);

    const response = await getSmDexTrades(chain);

    if (!response.success || !response.data) {
      const reason = response.error ?? "Unknown error";
      logger.error(`SM dex-trades fetch failed for ${chain}: ${reason}`, {
        error: response.error,
        cached: response.cached,
      });
      results.push({ success: false, tradesFound: 0, tradesInserted: 0, chain });
      continue;
    }

    // After client unwrap, response.data is { data: [...], pagination: {...} }
    const payload = response.data as unknown as { data?: RawCliTrade[]; pagination?: unknown };
    const rawTrades = payload.data ?? [];

    if (rawTrades.length === 0) {
      logger.scan(`No SM trades returned for ${chain}`, { cached: response.cached });
      results.push({ success: true, tradesFound: 0, tradesInserted: 0, chain });
      continue;
    }

    // Map raw swaps to directional trade rows
    const allRows: Omit<SmTradeRow, "id">[] = [];
    for (const raw of rawTrades) {
      const rows = mapRawTradeToRows(raw);
      for (const row of rows) {
        // Filter blocklisted tokens
        if (!config.blocklist.includes(row.token_address)) {
          allRows.push(row);
        }
      }
    }

    const inserted = insertSmTrades(db, allRows);

    const uniqueWallets = new Set(allRows.map((r) => r.wallet_address)).size;
    const uniqueTokens = new Set(allRows.map((r) => r.token_address)).size;

    logger.scan(`SM dex-trades scan complete for ${chain}`, {
      cached: response.cached,
      rawSwaps: rawTrades.length,
      tradeRows: allRows.length,
      inserted,
      uniqueWallets,
      uniqueTokens,
    });

    results.push({
      success: true,
      tradesFound: rawTrades.length,
      tradesInserted: inserted,
      chain,
    });
  }

  // Update last scan timestamp for crash recovery
  setAgentState(db, "last_scan_at", new Date().toISOString());

  return results;
}
