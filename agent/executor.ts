import type Database from "better-sqlite3";
import type { Config } from "./config";
import type { SignalRow, PositionRow } from "@/lib/db/queries";
import {
  insertTrade,
  updateTradeStatus,
  insertPosition,
  updatePosition,
  getPositionByToken,
} from "@/lib/db/queries";
import { getTradeQuote, executeTradeCmd } from "@/lib/nansen/endpoints";
import type { ParsedTradeQuote } from "@/lib/nansen/client";
import {
  KNOWN_TOKENS,
  getJupiterDecimals,
  baseToTokenUnits,
  tokenToBaseUnits,
} from "@/lib/prices/jupiter";
import { logger } from "@/lib/utils/logger";
import {
  calculatePositionSize,
  getAvailableExposure,
  updateCashBalance,
} from "./portfolio";

// Cache token decimals to avoid repeated lookups
const decimalsCache = new Map<string, number>();

async function getDecimals(tokenAddress: string): Promise<number> {
  const cached = decimalsCache.get(tokenAddress);
  if (cached !== undefined) return cached;

  try {
    const result = await getJupiterDecimals([tokenAddress]);
    const dec = result[tokenAddress] ?? 9; // default to 9 (SOL-like)
    decimalsCache.set(tokenAddress, dec);
    return dec;
  } catch {
    return 9; // safe default
  }
}

// ── Types ───────────────────────────────────────────────────────────

export interface ExecutionResult {
  success: boolean;
  tradeId: number | null;
  positionId: number | null;
  reason: string;
  txHash: string | null;
}

// ── Execute a buy for a validated signal ────────────────────────────

export async function executeSignalTrade(
  db: Database.Database,
  signal: SignalRow,
  config: Config,
): Promise<ExecutionResult> {
  const token = signal.token_address;
  const chain = signal.chain;
  const symbol = signal.token_symbol ?? token;

  // Guard: already have an open position on this token
  const existing = getPositionByToken(db, token, chain);
  if (existing) {
    logger.trade(`Skipping ${symbol} — already have open position #${existing.id}`, {
      tokenAddress: token,
    });
    return { success: false, tradeId: null, positionId: null, reason: "ALREADY_POSITIONED", txHash: null };
  }

  // ── Position sizing ──────────────────────────────────────────────
  const tradeAmountUsd = calculatePositionSize(db, signal, config);

  if (tradeAmountUsd < config.execution.minTradeUsd) {
    logger.trade(`Skipping ${symbol} — sized amount $${tradeAmountUsd.toFixed(2)} < min $${config.execution.minTradeUsd}`, {
      tokenAddress: token,
    });
    return { success: false, tradeId: null, positionId: null, reason: "BELOW_MIN_TRADE", txHash: null };
  }

  // Check exposure cap
  const availableUsd = getAvailableExposure(db, config);
  if (availableUsd <= 0) {
    logger.trade(`Skipping ${symbol} — exposure cap reached`, { tokenAddress: token });
    return { success: false, tradeId: null, positionId: null, reason: "EXPOSURE_CAP", txHash: null };
  }

  const finalAmount = Math.min(tradeAmountUsd, availableUsd);

  // ── Quote (with halve-and-retry for price impact) ────────────────
  const quoteResult = getQuoteWithImpactCheck(chain, token, finalAmount, config);

  if (!quoteResult.success || !quoteResult.quote) {
    logger.trade(`Quote failed for ${symbol}: ${quoteResult.reason}`, {
      tokenAddress: token,
    });
    return { success: false, tradeId: null, positionId: null, reason: quoteResult.reason, txHash: null };
  }

  const quote = quoteResult.quote;

  // ── Record pending trade ─────────────────────────────────────────
  const tradeId = insertTrade(db, {
    signal_id: signal.id,
    token_address: token,
    token_symbol: signal.token_symbol,
    chain,
    direction: "BUY",
    amount_token: null, // filled after execution
    amount_usd: quoteResult.amountUsd,
    price_at_execution: null, // filled after execution
    slippage_actual: null,
    price_impact: quote.priceImpactPct,
    fee_usd: null,
    quote_id: quote.quoteId,
    tx_hash: null,
    status: "PENDING",
    executed_at: new Date().toISOString(),
  });

  logger.trade(`Executing BUY for ${symbol} — $${quoteResult.amountUsd.toFixed(2)}`, {
    signalId: signal.id,
    tradeId,
    quoteId: quote.quoteId,
    priceImpact: quote.priceImpactPct,
    source: quote.source,
  });

  // ── Execute (NEVER retry — Section 9.3) ──────────────────────────
  const execResult = executeTradeCmd(quote.quoteId, token);

  if (!execResult.success || !execResult.data) {
    logger.error(`Trade execution FAILED for ${symbol}`, {
      tradeId,
      error: execResult.error,
    });
    updateTradeStatus(db, tradeId, "EXEC_FAILED");
    return { success: false, tradeId, positionId: null, reason: "EXEC_FAILED", txHash: null };
  }

  const exec = execResult.data;

  if (exec.status === "failed") {
    logger.error(`Trade tx failed on-chain for ${symbol}`, {
      tradeId,
      txHash: exec.txHash,
    });
    updateTradeStatus(db, tradeId, "TX_FAILED", exec.txHash || undefined);
    return { success: false, tradeId, positionId: null, reason: "TX_FAILED", txHash: exec.txHash || null };
  }

  // Convert base units → token units so prices align with Jupiter
  const outputBaseUnits = quote.outputAmount;
  const decimals = await getDecimals(token);
  const outputTokenUnits = baseToTokenUnits(outputBaseUnits, decimals);
  const inputUsd = quote.inUsd;
  const priceAtExecution = outputTokenUnits > 0 ? inputUsd / outputTokenUnits : 0;
  const feeUsd = quote.tradingFeeUsd + quote.networkFeeUsd;

  // Update trade record with execution details
  db.prepare(
    `UPDATE trades SET
       status = 'FILLED', tx_hash = ?, amount_token = ?, price_at_execution = ?,
       fee_usd = ?, executed_at = ?
     WHERE id = ?`,
  ).run(
    exec.txHash || null,
    outputTokenUnits,
    priceAtExecution,
    feeUsd,
    new Date().toISOString(),
    tradeId,
  );

  // ── Create position ──────────────────────────────────────────────
  const positionId = insertPosition(db, {
    signal_id: signal.id,
    entry_trade_id: tradeId,
    token_address: token,
    token_symbol: signal.token_symbol,
    chain,
    entry_price: priceAtExecution,
    entry_amount_usd: inputUsd,
    current_amount_token: outputTokenUnits,
    highest_price_seen: priceAtExecution,
    trailing_stop_price: null, // set by position manager on first check
    mcap_tier: null, // set by position manager on first check
    status: "OPEN",
    exit_reason: null,
    realized_pnl: 0,
    total_fees: feeUsd,
    opened_at: new Date().toISOString(),
    closed_at: null,
  });

  // Deduct cash balance
  updateCashBalance(db, -inputUsd);

  logger.trade(`BUY FILLED for ${symbol} — ${outputTokenUnits.toFixed(6)} tokens @ $${priceAtExecution.toFixed(4)}`, {
    tradeId,
    positionId,
    txHash: exec.txHash,
    amountUsd: inputUsd,
    amountToken: outputTokenUnits,
    feeUsd,
  });

  return {
    success: true,
    tradeId,
    positionId,
    reason: "FILLED",
    txHash: exec.txHash || null,
  };
}

// ── Execute a sell (exit) for a position ────────────────────────────

export async function executeSellTrade(
  db: Database.Database,
  position: PositionRow,
  sellPct: number,
  exitReason: string,
  config: Config,
): Promise<ExecutionResult> {
  const token = position.token_address;
  const chain = position.chain;
  const symbol = position.token_symbol ?? token;

  // current_amount_token is in token units; convert to base units for the quote
  const amountTokenUnits = (position.current_amount_token ?? 0) * (sellPct / 100);
  if (amountTokenUnits <= 0) {
    return { success: false, tradeId: null, positionId: position.id, reason: "ZERO_AMOUNT", txHash: null };
  }

  const decimals = await getDecimals(token);
  const amountBaseUnits = tokenToBaseUnits(amountTokenUnits, decimals);

  // Quote: sell token → USDC (amount in base units)
  const quoteResult = getTradeQuote({
    chain,
    from: token,
    to: KNOWN_TOKENS.USDC,
    amount: String(amountBaseUnits),
    slippage: config.execution.maxSlippage,
  });

  if (!quoteResult.success || !quoteResult.data) {
    logger.error(`Sell quote failed for ${symbol}: ${quoteResult.error}`, {
      positionId: position.id,
      exitReason,
    });
    return { success: false, tradeId: null, positionId: position.id, reason: "QUOTE_FAILED", txHash: null };
  }

  const quote = quoteResult.data;

  // Record pending sell trade
  const tradeId = insertTrade(db, {
    signal_id: position.signal_id,
    token_address: token,
    token_symbol: position.token_symbol,
    chain,
    direction: "SELL",
    amount_token: amountTokenUnits,
    amount_usd: quote.outUsd,
    price_at_execution: null,
    slippage_actual: null,
    price_impact: quote.priceImpactPct,
    fee_usd: null,
    quote_id: quote.quoteId,
    tx_hash: null,
    status: "PENDING",
    executed_at: new Date().toISOString(),
  });

  logger.trade(`Executing SELL for ${symbol} — ${sellPct}% (${exitReason})`, {
    positionId: position.id,
    tradeId,
    amountToken: amountTokenUnits,
    exitReason,
  });

  // Execute (NEVER retry)
  const execResult = executeTradeCmd(quote.quoteId, token);

  if (!execResult.success || !execResult.data) {
    logger.error(`Sell execution FAILED for ${symbol}`, {
      tradeId,
      error: execResult.error,
    });
    updateTradeStatus(db, tradeId, "EXEC_FAILED");
    return { success: false, tradeId, positionId: position.id, reason: "EXEC_FAILED", txHash: null };
  }

  const exec = execResult.data;

  if (exec.status === "failed") {
    updateTradeStatus(db, tradeId, "TX_FAILED", exec.txHash || undefined);
    return { success: false, tradeId, positionId: position.id, reason: "TX_FAILED", txHash: exec.txHash || null };
  }

  // Use quote USD values for proceeds (execute output is text, not precise amounts)
  const outputUsd = quote.outUsd;
  const priceAtExecution = amountTokenUnits > 0 ? outputUsd / amountTokenUnits : 0;
  const feeUsd = quote.tradingFeeUsd + quote.networkFeeUsd;

  // Update trade record
  db.prepare(
    `UPDATE trades SET
       status = 'FILLED', tx_hash = ?, amount_usd = ?, price_at_execution = ?,
       fee_usd = ?, executed_at = ?
     WHERE id = ?`,
  ).run(
    exec.txHash || null,
    outputUsd,
    priceAtExecution,
    feeUsd,
    new Date().toISOString(),
    tradeId,
  );

  // Update position
  const remainingToken = (position.current_amount_token ?? 0) - amountTokenUnits;
  const costBasisSold = position.entry_price * amountTokenUnits;
  const pnlThisSale = outputUsd - costBasisSold - feeUsd;

  if (sellPct >= 100 || remainingToken <= 0) {
    updatePosition(db, position.id, {
      current_amount_token: 0,
      status: "CLOSED",
      exit_reason: exitReason,
      realized_pnl: position.realized_pnl + pnlThisSale,
      total_fees: position.total_fees + feeUsd,
      closed_at: new Date().toISOString(),
    });
  } else {
    updatePosition(db, position.id, {
      current_amount_token: remainingToken,
      status: "PARTIALLY_CLOSED",
      realized_pnl: position.realized_pnl + pnlThisSale,
      total_fees: position.total_fees + feeUsd,
    });
  }

  // Credit cash balance
  updateCashBalance(db, outputUsd);

  logger.trade(`SELL FILLED for ${symbol} — $${outputUsd.toFixed(2)} (${exitReason})`, {
    tradeId,
    positionId: position.id,
    txHash: exec.txHash,
    amountToken: amountTokenUnits,
    proceedsUsd: outputUsd,
    pnl: pnlThisSale,
    feeUsd,
    exitReason,
  });

  return {
    success: true,
    tradeId,
    positionId: position.id,
    reason: exitReason,
    txHash: exec.txHash || null,
  };
}

// ── Quote with price impact check + halve-and-retry ─────────────────

interface QuoteCheckResult {
  success: boolean;
  quote: ParsedTradeQuote | null;
  amountUsd: number;
  reason: string;
}

function getQuoteWithImpactCheck(
  chain: string,
  tokenAddress: string,
  amountUsd: number,
  config: Config,
): QuoteCheckResult {
  const maxImpact = config.execution.maxPriceImpactPct;
  let currentAmount = amountUsd;

  // Try original amount, then halve once if impact too high
  for (let attempt = 0; attempt < 2; attempt++) {
    if (currentAmount < config.execution.minTradeUsd) {
      return { success: false, quote: null, amountUsd: currentAmount, reason: "AMOUNT_BELOW_MIN_AFTER_HALVE" };
    }

    const quoteResult = getTradeQuote({
      chain,
      from: KNOWN_TOKENS.USDC,
      to: tokenAddress,
      amount: String(currentAmount),
      amountUnit: "usd",
      slippage: config.execution.maxSlippage,
    });

    if (!quoteResult.success || !quoteResult.data) {
      return { success: false, quote: null, amountUsd: currentAmount, reason: "QUOTE_FAILED" };
    }

    const quote = quoteResult.data;

    if (quote.priceImpactPct <= maxImpact) {
      return { success: true, quote, amountUsd: currentAmount, reason: "OK" };
    }

    logger.trade(`Price impact ${quote.priceImpactPct.toFixed(2)}% > ${maxImpact}% — halving amount from $${currentAmount.toFixed(2)}`, {
      tokenAddress,
      attempt,
      priceImpact: quote.priceImpactPct,
    });

    currentAmount = currentAmount / 2;
  }

  return { success: false, quote: null, amountUsd: currentAmount, reason: "PRICE_IMPACT_TOO_HIGH" };
}
