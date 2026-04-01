/**
 * DRAFT types — defined from Nansen docs, not from captured CLI output.
 * Adjust after running actual commands and capturing output in docs/cli-samples/.
 */

// ── Smart Money Domain ───────────────────────────────────────────────

export type SmLabelType =
  | "Fund"
  | "Smart Trader"
  | "30D Smart Trader"
  | "90D Smart Trader"
  | "180D Smart Trader";

export interface SmDexTrade {
  wallet_address: string;
  sm_label: SmLabelType;
  token_address: string;
  token_symbol: string;
  chain: string;
  direction: "buy" | "sell";
  amount_usd: number;
  tx_hash: string;
  traded_at: string; // ISO timestamp
}

export interface SmDexTradesResponse {
  data: SmDexTrade[];
}

export interface SmNetflowEntry {
  token_address: string;
  token_symbol: string;
  chain: string;
  net_flow_usd: number;
  inflow_usd: number;
  outflow_usd: number;
  wallet_count: number;
}

export interface SmNetflowResponse {
  data: SmNetflowEntry[];
}

export interface SmHolding {
  wallet_address: string;
  sm_label: string;
  token_address: string;
  token_symbol: string;
  chain: string;
  amount_token: number;
  amount_usd: number;
  pnl_usd: number | null;
  first_bought_at: string | null;
}

export interface SmHoldingsResponse {
  data: SmHolding[];
}

export interface SmDca {
  wallet_address: string;
  sm_label: string;
  token_address: string;
  token_symbol: string;
  chain: string;
  dca_amount_usd: number;
  frequency: string;
  status: string;
}

export interface SmDcasResponse {
  data: SmDca[];
}

export interface SmPerpTrade {
  wallet_address: string;
  sm_label: string;
  token_symbol: string;
  chain: string;
  direction: "long" | "short";
  size_usd: number;
  leverage: number | null;
  platform: string;
  tx_hash: string;
  traded_at: string;
}

export interface SmPerpTradesResponse {
  data: SmPerpTrade[];
}

export interface SmHistoricalHolding {
  wallet_address: string;
  sm_label: string;
  token_address: string;
  token_symbol: string;
  chain: string;
  amount_usd: number;
  snapshot_date: string;
}

export interface SmHistoricalHoldingsResponse {
  data: SmHistoricalHolding[];
}

// ── Token Domain ─────────────────────────────────────────────────────

export interface TokenInfo {
  token_address: string;
  token_symbol: string;
  token_name: string;
  chain: string;
  market_cap_usd: number | null;
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  holder_count: number | null;
  top_10_holder_pct: number | null;
  created_at: string | null;
}

export interface TokenInfoResponse {
  data: TokenInfo;
}

export interface TokenFlowIntelligence {
  token_address: string;
  token_symbol: string;
  chain: string;
  smart_money_inflow_usd: number;
  smart_money_outflow_usd: number;
  retail_inflow_usd: number;
  retail_outflow_usd: number;
  net_flow_usd: number;
}

export interface TokenFlowIntelligenceResponse {
  data: TokenFlowIntelligence;
}

export interface TokenDexTrade {
  tx_hash: string;
  wallet_address: string;
  token_address: string;
  token_symbol: string;
  chain: string;
  direction: "buy" | "sell";
  amount_usd: number;
  traded_at: string;
}

export interface TokenDexTradesResponse {
  data: TokenDexTrade[];
}

// ── Profiler Domain ──────────────────────────────────────────────────

export interface ProfilerPnlSummary {
  wallet_address: string;
  total_pnl_usd: number;
  win_rate: number;
  total_trades: number;
  avg_trade_pnl_usd: number;
  best_trade_pnl_usd: number;
  worst_trade_pnl_usd: number;
}

export interface ProfilerPnlSummaryResponse {
  data: ProfilerPnlSummary;
}

export interface ProfilerTransaction {
  tx_hash: string;
  wallet_address: string;
  token_address: string;
  token_symbol: string;
  chain: string;
  direction: string;
  amount_usd: number;
  pnl_usd: number | null;
  traded_at: string;
}

export interface ProfilerTransactionsResponse {
  data: ProfilerTransaction[];
}

// ── Trading Domain ───────────────────────────────────────────────────

export interface TradeQuote {
  quote_id: string;
  from_token: string;
  to_token: string;
  chain: string;
  input_amount: string;
  expected_output: string;
  price_impact: number;
  slippage: number;
  fee_pct: number;
  expires_at: string;
}

export interface TradeQuoteResponse {
  data: TradeQuote;
}

export interface TradeExecuteResult {
  tx_hash: string;
  status: "success" | "failed";
  from_token: string;
  to_token: string;
  chain: string;
  input_amount: string;
  output_amount: string;
  fee_usd: number;
  executed_at: string;
}

export interface TradeExecuteResponse {
  data: TradeExecuteResult;
}

// ── CLI wrapper types ────────────────────────────────────────────────

export interface NansenCliResult<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  cached: boolean;
  command: string;
}
