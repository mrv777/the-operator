import {
  nansenCliCall,
  nansenCliCallRaw,
  invalidateCacheForToken,
  parseTradeQuoteOutput,
  parseTradeExecuteOutput,
  type ParsedTradeQuote,
  type ParsedTradeExecution,
} from "./client";
import type {
  SmDexTradesResponse,
  SmNetflowResponse,
  SmHoldingsResponse,
  SmDcasResponse,
  SmPerpTradesResponse,
  SmHistoricalHoldingsResponse,
  TokenInfoResponse,
  TokenFlowIntelligenceResponse,
  TokenDexTradesResponse,
  ProfilerPnlSummaryResponse,
  ProfilerTransactionsResponse,
  NansenCliResult,
} from "./types";

// ── Account ─────────────────────────────────────────────────────────

export interface AccountInfo {
  plan: string;
  credits_remaining: number;
}

export function getAccountInfo(): AccountInfo | null {
  try {
    const raw = nansenCliCallRaw("account");
    const jsonStart = raw.indexOf("{");
    if (jsonStart === -1) return null;
    const parsed = JSON.parse(raw.substring(jsonStart));
    const data = parsed.data ?? parsed;
    return {
      plan: data.plan ?? "unknown",
      credits_remaining: data.credits_remaining ?? 0,
    };
  } catch {
    return null;
  }
}

// ── Smart Money Domain (6 endpoints) ────────────────────────────────

export function getSmDexTrades(
  chain: string = "solana",
  limit: number = 500,
): Promise<NansenCliResult<SmDexTradesResponse>> {
  return nansenCliCall(`research smart-money dex-trades --chain ${chain} --limit ${limit}`);
}

export function getSmNetflow(
  chain: string = "solana",
  token?: string,
): Promise<NansenCliResult<SmNetflowResponse>> {
  let cmd = `research smart-money netflow --chain ${chain} --limit 500`;
  if (token) cmd += ` --token ${token}`;
  return nansenCliCall(cmd);
}

export function getSmHoldings(
  chain: string = "solana",
  token?: string,
): Promise<NansenCliResult<SmHoldingsResponse>> {
  let cmd = `research smart-money holdings --chain ${chain} --limit 500`;
  if (token) cmd += ` --token ${token}`;
  return nansenCliCall(cmd);
}

export function getSmDcas(
  chain: string = "solana",
  token?: string,
): Promise<NansenCliResult<SmDcasResponse>> {
  let cmd = `research smart-money dcas --chain ${chain} --limit 500`;
  if (token) cmd += ` --token ${token}`;
  return nansenCliCall(cmd);
}

export function getSmPerpTrades(
  chain: string = "solana",
): Promise<NansenCliResult<SmPerpTradesResponse>> {
  return nansenCliCall(`research smart-money perp-trades --chain ${chain} --limit 500`);
}

export function getSmHistoricalHoldings(
  chain: string = "solana",
  wallet?: string,
): Promise<NansenCliResult<SmHistoricalHoldingsResponse>> {
  let cmd = `research smart-money historical-holdings --chain ${chain} --limit 500`;
  if (wallet) cmd += ` --wallet ${wallet}`;
  return nansenCliCall(cmd);
}

// ── Token Domain (3 endpoints) ──────────────────────────────────────

export function getTokenInfo(
  token: string,
  chain: string = "solana",
): Promise<NansenCliResult<TokenInfoResponse>> {
  return nansenCliCall(`research token info --token ${token} --chain ${chain}`);
}

export function getTokenFlowIntelligence(
  token: string,
  chain: string = "solana",
): Promise<NansenCliResult<TokenFlowIntelligenceResponse>> {
  return nansenCliCall(`research token flow-intelligence --token ${token} --chain ${chain}`);
}

export function getTokenDexTrades(
  token: string,
  chain: string = "solana",
): Promise<NansenCliResult<TokenDexTradesResponse>> {
  return nansenCliCall(`research token dex-trades --token ${token} --chain ${chain} --limit 500`);
}

// ── Profiler Domain (2 endpoints) ───────────────────────────────────

export function getProfilerPnlSummary(
  wallet: string,
  chain: string = "solana",
): Promise<NansenCliResult<ProfilerPnlSummaryResponse>> {
  return nansenCliCall(`research profiler pnl-summary --address ${wallet} --chain ${chain}`);
}

export function getProfilerTransactions(
  wallet: string,
  chain: string = "solana",
): Promise<NansenCliResult<ProfilerTransactionsResponse>> {
  return nansenCliCall(`research profiler transactions --address ${wallet} --chain ${chain}`);
}

// ── Trading Domain (2 endpoints) ────────────────────────────────────
// Trade commands output formatted text, not JSON.
// We use nansenCliCallRaw + text parsers instead of nansenCliCall.

export function getTradeQuote(opts: {
  chain?: string;
  from: string;
  to: string;
  amount: string;
  amountUnit?: "usd" | "token" | "base";
  slippage?: number;
}): NansenCliResult<ParsedTradeQuote> {
  const chain = opts.chain ?? "solana";
  const slippage = opts.slippage ?? 0.01;
  const unitFlag = opts.amountUnit ? ` --amount-unit ${opts.amountUnit}` : "";
  const cmd = `trade quote --chain ${chain} --from ${opts.from} --to ${opts.to} --amount ${opts.amount}${unitFlag} --slippage ${slippage}`;

  try {
    const raw = nansenCliCallRaw(cmd);
    const parsed = parseTradeQuoteOutput(raw);
    return { success: true, data: parsed, error: null, cached: false, command: cmd };
  } catch (err) {
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      cached: false,
      command: cmd,
    };
  }
}

export function executeTradeCmd(
  quoteId: string,
  tokenAddress?: string,
): NansenCliResult<ParsedTradeExecution> {
  const cmd = `trade execute --quote ${quoteId}`;

  try {
    const raw = nansenCliCallRaw(cmd);
    const parsed = parseTradeExecuteOutput(raw);

    // Invalidate cache for this token after trade execution
    if (tokenAddress) {
      invalidateCacheForToken(tokenAddress);
    }

    return { success: true, data: parsed, error: null, cached: false, command: cmd };
  } catch (err) {
    // NEVER retry execute — Section 9.3
    if (tokenAddress) {
      invalidateCacheForToken(tokenAddress);
    }
    return {
      success: false,
      data: null,
      error: err instanceof Error ? err.message : String(err),
      cached: false,
      command: cmd,
    };
  }
}
