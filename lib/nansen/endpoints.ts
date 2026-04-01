import { nansenCliCall, invalidateCacheForToken } from "./client";
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
  TradeQuoteResponse,
  TradeExecuteResponse,
  NansenCliResult,
} from "./types";

// ── Smart Money Domain (6 endpoints) ────────────────────────────────

export function getSmDexTrades(
  chain: string = "solana",
): Promise<NansenCliResult<SmDexTradesResponse>> {
  return nansenCliCall(`smart-money dex-trades --chain ${chain}`);
}

export function getSmNetflow(
  chain: string = "solana",
  token?: string,
): Promise<NansenCliResult<SmNetflowResponse>> {
  let cmd = `smart-money netflow --chain ${chain}`;
  if (token) cmd += ` --token ${token}`;
  return nansenCliCall(cmd);
}

export function getSmHoldings(
  chain: string = "solana",
  token?: string,
): Promise<NansenCliResult<SmHoldingsResponse>> {
  let cmd = `smart-money holdings --chain ${chain}`;
  if (token) cmd += ` --token ${token}`;
  return nansenCliCall(cmd);
}

export function getSmDcas(
  chain: string = "solana",
  token?: string,
): Promise<NansenCliResult<SmDcasResponse>> {
  let cmd = `smart-money dcas --chain ${chain}`;
  if (token) cmd += ` --token ${token}`;
  return nansenCliCall(cmd);
}

export function getSmPerpTrades(
  chain: string = "solana",
): Promise<NansenCliResult<SmPerpTradesResponse>> {
  return nansenCliCall(`smart-money perp-trades --chain ${chain}`);
}

export function getSmHistoricalHoldings(
  chain: string = "solana",
  wallet?: string,
): Promise<NansenCliResult<SmHistoricalHoldingsResponse>> {
  let cmd = `smart-money historical-holdings --chain ${chain}`;
  if (wallet) cmd += ` --wallet ${wallet}`;
  return nansenCliCall(cmd);
}

// ── Token Domain (3 endpoints) ──────────────────────────────────────

export function getTokenInfo(
  token: string,
  chain: string = "solana",
): Promise<NansenCliResult<TokenInfoResponse>> {
  return nansenCliCall(`token info --token ${token} --chain ${chain}`);
}

export function getTokenFlowIntelligence(
  token: string,
  chain: string = "solana",
): Promise<NansenCliResult<TokenFlowIntelligenceResponse>> {
  return nansenCliCall(`token flow-intelligence --token ${token} --chain ${chain}`);
}

export function getTokenDexTrades(
  token: string,
  chain: string = "solana",
): Promise<NansenCliResult<TokenDexTradesResponse>> {
  return nansenCliCall(`token dex-trades --token ${token} --chain ${chain}`);
}

// ── Profiler Domain (2 endpoints) ───────────────────────────────────

export function getProfilerPnlSummary(
  wallet: string,
  chain: string = "solana",
): Promise<NansenCliResult<ProfilerPnlSummaryResponse>> {
  return nansenCliCall(`profiler pnl-summary --address ${wallet} --chain ${chain}`);
}

export function getProfilerTransactions(
  wallet: string,
  chain: string = "solana",
): Promise<NansenCliResult<ProfilerTransactionsResponse>> {
  return nansenCliCall(`profiler transactions --address ${wallet} --chain ${chain}`);
}

// ── Trading Domain (2 endpoints) ────────────────────────────────────

export function getTradeQuote(opts: {
  chain?: string;
  from: string;
  to: string;
  amount: string;
  slippage?: number;
}): Promise<NansenCliResult<TradeQuoteResponse>> {
  const chain = opts.chain ?? "solana";
  const slippage = opts.slippage ?? 0.01;
  return nansenCliCall(
    `trade quote --chain ${chain} --from ${opts.from} --to ${opts.to} --amount ${opts.amount} --slippage ${slippage}`,
    { skipCache: true },
  );
}

export async function executeTrade(
  quoteId: string,
  tokenAddress?: string,
): Promise<NansenCliResult<TradeExecuteResponse>> {
  const result = await nansenCliCall<TradeExecuteResponse>(
    `trade execute --quote ${quoteId}`,
    { skipCache: true },
  );

  // Invalidate cache for this token after trade execution
  if (tokenAddress) {
    invalidateCacheForToken(tokenAddress);
  }

  return result;
}
