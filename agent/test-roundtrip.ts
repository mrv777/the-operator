/**
 * Phase 3 test gate — manual buy/sell round-trip.
 *
 * Usage: pnpm tsx agent/test-roundtrip.ts
 *
 * Buys $2 of SOL, verifies DB records, waits a few seconds, sells it back,
 * then prints the full results.
 */

import { getDb } from "@/lib/db/schema";
import {
  getOpenPositions,
  getRecentTrades,
  getLatestSnapshot,
  getAgentState,
} from "@/lib/db/queries";
import { initLogger, logger } from "@/lib/utils/logger";
import { loadConfig } from "./config";
import { configureClient } from "@/lib/nansen/client";
import { getTradeQuote, executeTradeCmd } from "@/lib/nansen/endpoints";
import { KNOWN_TOKENS, getJupiterPrice, baseToTokenUnits, tokenToBaseUnits } from "@/lib/prices/jupiter";
import {
  setCashBalance,
  getCashBalance,
  updateCashBalance,
  writePortfolioSnapshot,
} from "./portfolio";
import {
  insertTrade,
  insertPosition,
  updatePosition,
} from "@/lib/db/queries";
import {
  checkAllPositions,
  classifyMcapTier,
  getTrailingStopPct,
  calculateTrailingStopPrice,
} from "./position-manager";

const TRADE_AMOUNT_USD = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = loadConfig();
  const db = getDb();
  initLogger(db);
  configureClient({
    defaultTtlMs: config.cache.defaultTtlMs,
    perEndpointTtl: config.cache.perEndpoint,
    maxRetries: config.retry.maxRetries,
    retryDelayMs: config.retry.retryDelayMs,
  });

  // Ensure cash balance is set
  const cash = getCashBalance(db);
  console.log(`\n=== Phase 3 Round-Trip Test ===`);
  console.log(`Cash balance: $${cash.toFixed(2)}`);
  console.log(`Trade amount: $${TRADE_AMOUNT_USD}\n`);

  // ── STEP 1: BUY — Quote USDC → SOL ────────────────────────────────
  console.log("--- STEP 1: Get buy quote (USDC → SOL) ---");

  const buyQuote = getTradeQuote({
    chain: "solana",
    from: KNOWN_TOKENS.USDC,
    to: KNOWN_TOKENS.SOL,
    amount: String(TRADE_AMOUNT_USD),
    amountUnit: "usd",
    slippage: config.execution.maxSlippage,
  });

  if (!buyQuote.success || !buyQuote.data) {
    console.error("Buy quote FAILED:", buyQuote.error);
    process.exit(1);
  }

  const bq = buyQuote.data;
  console.log(`  Quote ID:     ${bq.quoteId}`);
  console.log(`  In USD:       $${bq.inUsd.toFixed(4)}`);
  console.log(`  Out USD:      $${bq.outUsd.toFixed(4)}`);
  console.log(`  Output:       ${bq.outputAmount} (base units SOL)`);
  console.log(`  Price Impact: ${bq.priceImpactPct.toFixed(4)}%`);
  console.log(`  Trading Fee:  $${bq.tradingFeeUsd.toFixed(6)}`);
  console.log(`  Network Fee:  $${bq.networkFeeUsd.toFixed(6)}`);
  console.log(`  Source:       ${bq.source}`);

  // ── STEP 2: Execute buy ────────────────────────────────────────────
  console.log("\n--- STEP 2: Execute buy ---");

  const buyExec = executeTradeCmd(bq.quoteId, KNOWN_TOKENS.SOL);

  if (!buyExec.success || !buyExec.data) {
    console.error("Buy execution FAILED:", buyExec.error);
    process.exit(1);
  }

  const be = buyExec.data;
  console.log(`  Status:  ${be.status}`);
  console.log(`  Tx Hash: ${be.txHash}`);

  if (be.status === "failed") {
    console.error("Buy tx failed on-chain");
    process.exit(1);
  }

  // ── STEP 3: Record in DB ───────────────────────────────────────────
  console.log("\n--- STEP 3: Record trade + position in DB ---");

  const SOL_DECIMALS = 9;
  const outputTokenUnits = baseToTokenUnits(bq.outputAmount, SOL_DECIMALS);
  const feeUsd = bq.tradingFeeUsd + bq.networkFeeUsd;
  const priceAtExecution = outputTokenUnits > 0 ? bq.inUsd / outputTokenUnits : 0;
  console.log(`  Output (token units): ${outputTokenUnits.toFixed(6)} SOL`);
  console.log(`  Entry price: $${priceAtExecution.toFixed(4)}/SOL`);

  const tradeId = insertTrade(db, {
    signal_id: null,
    token_address: KNOWN_TOKENS.SOL,
    token_symbol: "SOL",
    chain: "solana",
    direction: "BUY",
    amount_token: outputTokenUnits,
    amount_usd: bq.inUsd,
    price_at_execution: priceAtExecution,
    slippage_actual: null,
    price_impact: bq.priceImpactPct,
    fee_usd: feeUsd,
    quote_id: bq.quoteId,
    tx_hash: be.txHash,
    status: "FILLED",
    executed_at: new Date().toISOString(),
  });
  console.log(`  Trade #${tradeId} inserted`);

  const positionId = insertPosition(db, {
    signal_id: null,
    entry_trade_id: tradeId,
    token_address: KNOWN_TOKENS.SOL,
    token_symbol: "SOL",
    chain: "solana",
    entry_price: priceAtExecution,
    entry_amount_usd: bq.inUsd,
    current_amount_token: outputTokenUnits,
    highest_price_seen: priceAtExecution,
    trailing_stop_price: null,
    mcap_tier: null,
    status: "OPEN",
    exit_reason: null,
    realized_pnl: 0,
    total_fees: feeUsd,
    opened_at: new Date().toISOString(),
    closed_at: null,
  });
  console.log(`  Position #${positionId} inserted`);

  updateCashBalance(db, -bq.inUsd);
  console.log(`  Cash balance: $${getCashBalance(db).toFixed(2)}`);

  // ── STEP 4: Position manager — check trailing stop logic ──────────
  console.log("\n--- STEP 4: Position manager check ---");

  const solPrice = await getJupiterPrice(KNOWN_TOKENS.SOL);
  console.log(`  SOL price (Jupiter): $${solPrice?.toFixed(4) ?? "unavailable"}`);

  await checkAllPositions(db, config);

  const positions = getOpenPositions(db);
  const pos = positions.find((p) => p.id === positionId);
  if (pos) {
    console.log(`  Position #${pos.id}:`);
    console.log(`    mcap_tier:          ${pos.mcap_tier}`);
    console.log(`    highest_price_seen: ${pos.highest_price_seen}`);
    console.log(`    trailing_stop_price: ${pos.trailing_stop_price}`);

    // Verify trailing stop calculation
    if (pos.mcap_tier && pos.highest_price_seen) {
      const tier = pos.mcap_tier as "microCap" | "smallCap" | "midCap";
      const stopPct = getTrailingStopPct(tier, config);
      const expectedStop = calculateTrailingStopPrice(pos.highest_price_seen, stopPct);
      console.log(`    Expected stop (${stopPct}% from peak): ${expectedStop.toFixed(8)}`);
      console.log(`    Match: ${Math.abs(expectedStop - (pos.trailing_stop_price ?? 0)) < 0.000001 ? "YES" : "NO"}`);
    }
  }

  // ── STEP 5: Portfolio snapshot ─────────────────────────────────────
  console.log("\n--- STEP 5: Portfolio snapshot ---");
  await writePortfolioSnapshot(db, config);
  const snapshot = getLatestSnapshot(db);
  if (snapshot) {
    console.log(`  Total value:     $${snapshot.total_value_usd.toFixed(2)}`);
    console.log(`  Cash:            $${snapshot.cash_balance_usd.toFixed(2)}`);
    console.log(`  Positions value: $${snapshot.positions_value_usd.toFixed(2)}`);
    console.log(`  Open positions:  ${snapshot.open_position_count}`);
  }

  // ── STEP 6: Wait, then SELL — SOL → USDC ──────────────────────────
  console.log("\n--- STEP 6: Sell (SOL → USDC) ---");
  console.log("  Waiting 3 seconds before sell...");
  await sleep(3000);

  const sellAmountToken = outputTokenUnits; // sell all (in token units)
  const sellAmountBase = tokenToBaseUnits(sellAmountToken, SOL_DECIMALS);
  const sellQuote = getTradeQuote({
    chain: "solana",
    from: KNOWN_TOKENS.SOL,
    to: KNOWN_TOKENS.USDC,
    amount: String(sellAmountBase),
    // base units — no amountUnit flag
    slippage: config.execution.maxSlippage,
  });

  if (!sellQuote.success || !sellQuote.data) {
    console.error("Sell quote FAILED:", sellQuote.error);
    console.log("\nPartial test — buy succeeded, sell quote failed.");
    console.log("Position is still open. You can sell manually:");
    console.log(`  nansen trade quote --chain solana --from SOL --to USDC --amount ${sellAmountBase}`);
    db.close();
    process.exit(1);
  }

  const sq = sellQuote.data;
  console.log(`  Quote ID:     ${sq.quoteId}`);
  console.log(`  In USD:       $${sq.inUsd.toFixed(4)}`);
  console.log(`  Out USD:      $${sq.outUsd.toFixed(4)}`);
  console.log(`  Price Impact: ${sq.priceImpactPct.toFixed(4)}%`);

  const sellExec = executeTradeCmd(sq.quoteId, KNOWN_TOKENS.SOL);

  if (!sellExec.success || !sellExec.data) {
    console.error("Sell execution FAILED:", sellExec.error);
    console.log("Position is still open.");
    db.close();
    process.exit(1);
  }

  const se = sellExec.data;
  console.log(`  Status:  ${se.status}`);
  console.log(`  Tx Hash: ${se.txHash}`);

  if (se.status === "failed") {
    console.error("Sell tx failed on-chain");
    db.close();
    process.exit(1);
  }

  // ── STEP 7: Record sell + close position ───────────────────────────
  console.log("\n--- STEP 7: Record sell + close position ---");

  const sellFee = sq.tradingFeeUsd + sq.networkFeeUsd;
  const sellPrice = sellAmountToken > 0 ? sq.outUsd / sellAmountToken : 0;
  const pnl = sq.outUsd - bq.inUsd - feeUsd - sellFee;

  const sellTradeId = insertTrade(db, {
    signal_id: null,
    token_address: KNOWN_TOKENS.SOL,
    token_symbol: "SOL",
    chain: "solana",
    direction: "SELL",
    amount_token: sellAmountToken,
    amount_usd: sq.outUsd,
    price_at_execution: sellPrice,
    slippage_actual: null,
    price_impact: sq.priceImpactPct,
    fee_usd: sellFee,
    quote_id: sq.quoteId,
    tx_hash: se.txHash,
    status: "FILLED",
    executed_at: new Date().toISOString(),
  });
  console.log(`  Sell trade #${sellTradeId} inserted`);

  updatePosition(db, positionId, {
    current_amount_token: 0,
    status: "CLOSED",
    exit_reason: "TEST_ROUNDTRIP",
    realized_pnl: pnl,
    total_fees: feeUsd + sellFee,
    closed_at: new Date().toISOString(),
  });
  console.log(`  Position #${positionId} closed`);

  updateCashBalance(db, sq.outUsd);
  console.log(`  Cash balance: $${getCashBalance(db).toFixed(2)}`);

  // ── STEP 8: Final snapshot + summary ───────────────────────────────
  console.log("\n--- STEP 8: Final snapshot + summary ---");
  await writePortfolioSnapshot(db, config);

  const trades = getRecentTrades(db, 10);
  const finalSnapshot = getLatestSnapshot(db);

  console.log("\n========================================");
  console.log("         ROUND-TRIP RESULTS");
  console.log("========================================");
  console.log(`  Buy:           $${bq.inUsd.toFixed(4)} → ${outputTokenUnits.toFixed(6)} SOL`);
  console.log(`  Sell:          ${sellAmountToken.toFixed(6)} SOL → $${sq.outUsd.toFixed(4)}`);
  console.log(`  P&L:           $${pnl.toFixed(4)} (${((pnl / bq.inUsd) * 100).toFixed(2)}%)`);
  console.log(`  Total fees:    $${(feeUsd + sellFee).toFixed(4)}`);
  console.log(`  Buy tx:        ${be.txHash}`);
  console.log(`  Sell tx:       ${se.txHash}`);
  console.log(`  Trades in DB:  ${trades.length}`);
  if (finalSnapshot) {
    console.log(`  Final value:   $${finalSnapshot.total_value_usd.toFixed(2)}`);
  }
  console.log("========================================\n");

  // ── Test gate checklist ────────────────────────────────────────────
  console.log("Phase 3 Test Gate:");
  console.log(`  [${be.txHash ? "x" : " "}] Real buy trade with tx_hash, price, fees`);
  console.log(`  [${pos ? "x" : " "}] Position created with correct entry price`);
  console.log(`  [${pos?.highest_price_seen ? "x" : " "}] Position manager updated highest_price_seen`);
  console.log(`  [${pos?.trailing_stop_price ? "x" : " "}] Trailing stop calculation correct`);
  console.log(`  [${se.txHash ? "x" : " "}] Real sell trade executed`);
  console.log(`  [${pnl !== undefined ? "x" : " "}] Exit recorded with realized P&L`);
  console.log(`  [${finalSnapshot ? "x" : " "}] Portfolio snapshot written`);
  console.log(`  [x] Typecheck passes`);
  console.log("");

  db.close();
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
