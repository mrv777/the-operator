import type Database from "better-sqlite3";

// ── sm_trades ────────────────────────────────────────────────────────

export interface SmTradeRow {
  id: number;
  wallet_address: string;
  sm_label: string;
  token_address: string;
  token_symbol: string | null;
  chain: string;
  direction: string;
  amount_usd: number | null;
  tx_hash: string | null;
  traded_at: string;
  scanned_at: string;
}

export function insertSmTrade(
  db: Database.Database,
  trade: Omit<SmTradeRow, "id">,
): number | null {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO sm_trades
      (wallet_address, sm_label, token_address, token_symbol, chain, direction, amount_usd, tx_hash, traded_at, scanned_at)
    VALUES
      (@wallet_address, @sm_label, @token_address, @token_symbol, @chain, @direction, @amount_usd, @tx_hash, @traded_at, @scanned_at)
  `);
  const result = stmt.run(trade);
  return result.changes > 0 ? Number(result.lastInsertRowid) : null;
}

export function insertSmTrades(
  db: Database.Database,
  trades: Omit<SmTradeRow, "id">[],
): number {
  const insert = db.transaction((rows: Omit<SmTradeRow, "id">[]) => {
    let count = 0;
    for (const trade of rows) {
      const id = insertSmTrade(db, trade);
      if (id !== null) count++;
    }
    return count;
  });
  return insert(trades);
}

export function getSmTradesByToken(
  db: Database.Database,
  tokenAddress: string,
  chain: string,
  sinceHoursAgo: number = 24,
): SmTradeRow[] {
  const cutoff = new Date(Date.now() - sinceHoursAgo * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT * FROM sm_trades
       WHERE token_address = ? AND chain = ? AND traded_at >= ?
       ORDER BY traded_at DESC`,
    )
    .all(tokenAddress, chain, cutoff) as SmTradeRow[];
}

export function getRecentSmTrades(
  db: Database.Database,
  chain: string,
  sinceHoursAgo: number = 24,
): SmTradeRow[] {
  const cutoff = new Date(Date.now() - sinceHoursAgo * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT * FROM sm_trades
       WHERE chain = ? AND traded_at >= ?
       ORDER BY traded_at DESC`,
    )
    .all(chain, cutoff) as SmTradeRow[];
}

// ── token netflow (local, computed from sm_trades) ──────────────────

export interface TokenNetflow {
  buyVolumeUsd: number;
  sellVolumeUsd: number;
  netFlowUsd: number;
}

export function getTokenNetflow(
  db: Database.Database,
  tokenAddress: string,
  chain: string,
  windowHours: number = 24,
): TokenNetflow {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  const rows = db
    .prepare(
      `SELECT direction, COALESCE(SUM(amount_usd), 0) as total
       FROM sm_trades
       WHERE token_address = ? AND chain = ? AND traded_at >= ?
       GROUP BY direction`,
    )
    .all(tokenAddress, chain, cutoff) as { direction: string; total: number }[];

  let buyVolumeUsd = 0;
  let sellVolumeUsd = 0;
  for (const row of rows) {
    if (row.direction === "buy") buyVolumeUsd = row.total;
    else if (row.direction === "sell") sellVolumeUsd = row.total;
  }

  return { buyVolumeUsd, sellVolumeUsd, netFlowUsd: buyVolumeUsd - sellVolumeUsd };
}

// ── signals ──────────────────────────────────────────────────────────

export interface SignalRow {
  id: number;
  token_address: string;
  token_symbol: string | null;
  chain: string;
  wallet_count: number;
  convergence_score: number;
  combined_volume_usd: number | null;
  wallets_json: string | null;
  is_contested: number;
  contested_details: string | null;
  status: string;
  filter_reason: string | null;
  detected_at: string;
  validated_at: string | null;
}

export function insertSignal(
  db: Database.Database,
  signal: Omit<SignalRow, "id">,
): number {
  const stmt = db.prepare(`
    INSERT INTO signals
      (token_address, token_symbol, chain, wallet_count, convergence_score,
       combined_volume_usd, wallets_json, is_contested, contested_details,
       status, filter_reason, detected_at, validated_at)
    VALUES
      (@token_address, @token_symbol, @chain, @wallet_count, @convergence_score,
       @combined_volume_usd, @wallets_json, @is_contested, @contested_details,
       @status, @filter_reason, @detected_at, @validated_at)
  `);
  return Number(stmt.run(signal).lastInsertRowid);
}

export function updateSignal(
  db: Database.Database,
  id: number,
  updates: Partial<Pick<SignalRow, "wallet_count" | "convergence_score" | "combined_volume_usd" | "wallets_json" | "is_contested" | "contested_details" | "status" | "filter_reason" | "validated_at">>,
): void {
  const fields = Object.keys(updates)
    .map((k) => `${k} = @${k}`)
    .join(", ");
  db.prepare(`UPDATE signals SET ${fields} WHERE id = @id`).run({ ...updates, id });
}

export function getSignalById(db: Database.Database, id: number): SignalRow | undefined {
  return db.prepare("SELECT * FROM signals WHERE id = ?").get(id) as SignalRow | undefined;
}

export function getActiveSignal(
  db: Database.Database,
  tokenAddress: string,
  chain: string,
  windowHours: number = 24,
): SignalRow | undefined {
  const cutoff = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
  return db
    .prepare(
      `SELECT * FROM signals
       WHERE token_address = ? AND chain = ? AND detected_at >= ?
         AND status NOT IN ('EXPIRED', 'FILTERED')
       ORDER BY detected_at DESC LIMIT 1`,
    )
    .get(tokenAddress, chain, cutoff) as SignalRow | undefined;
}

export function getSignalsByStatus(db: Database.Database, status: string, limit: number = 100): SignalRow[] {
  return db
    .prepare("SELECT * FROM signals WHERE status = ? ORDER BY detected_at DESC LIMIT ?")
    .all(status, limit) as SignalRow[];
}

export function getRecentSignals(db: Database.Database, limit: number = 50): SignalRow[] {
  return db
    .prepare("SELECT * FROM signals ORDER BY detected_at DESC LIMIT ?")
    .all(limit) as SignalRow[];
}

// ── trades ───────────────────────────────────────────────────────────

export interface TradeRow {
  id: number;
  signal_id: number | null;
  token_address: string;
  token_symbol: string | null;
  chain: string;
  direction: string;
  amount_token: number | null;
  amount_usd: number | null;
  price_at_execution: number | null;
  slippage_actual: number | null;
  price_impact: number | null;
  fee_usd: number | null;
  quote_id: string | null;
  tx_hash: string | null;
  status: string;
  executed_at: string;
}

export function insertTrade(db: Database.Database, trade: Omit<TradeRow, "id">): number {
  const stmt = db.prepare(`
    INSERT INTO trades
      (signal_id, token_address, token_symbol, chain, direction,
       amount_token, amount_usd, price_at_execution, slippage_actual,
       price_impact, fee_usd, quote_id, tx_hash, status, executed_at)
    VALUES
      (@signal_id, @token_address, @token_symbol, @chain, @direction,
       @amount_token, @amount_usd, @price_at_execution, @slippage_actual,
       @price_impact, @fee_usd, @quote_id, @tx_hash, @status, @executed_at)
  `);
  return Number(stmt.run(trade).lastInsertRowid);
}

export function updateTradeStatus(db: Database.Database, id: number, status: string, txHash?: string): void {
  if (txHash) {
    db.prepare("UPDATE trades SET status = ?, tx_hash = ? WHERE id = ?").run(status, txHash, id);
  } else {
    db.prepare("UPDATE trades SET status = ? WHERE id = ?").run(status, id);
  }
}

export function getTradesBySignal(db: Database.Database, signalId: number): TradeRow[] {
  return db.prepare("SELECT * FROM trades WHERE signal_id = ? ORDER BY executed_at DESC").all(signalId) as TradeRow[];
}

export function getRecentTrades(db: Database.Database, limit: number = 50): TradeRow[] {
  return db.prepare("SELECT * FROM trades ORDER BY executed_at DESC LIMIT ?").all(limit) as TradeRow[];
}

// ── positions ────────────────────────────────────────────────────────

export interface PositionRow {
  id: number;
  signal_id: number | null;
  entry_trade_id: number | null;
  token_address: string;
  token_symbol: string | null;
  chain: string;
  entry_price: number;
  entry_amount_usd: number;
  current_amount_token: number | null;
  highest_price_seen: number | null;
  trailing_stop_price: number | null;
  mcap_tier: string | null;
  status: string;
  exit_reason: string | null;
  realized_pnl: number;
  total_fees: number;
  opened_at: string;
  closed_at: string | null;
}

export function insertPosition(db: Database.Database, position: Omit<PositionRow, "id">): number {
  const stmt = db.prepare(`
    INSERT INTO positions
      (signal_id, entry_trade_id, token_address, token_symbol, chain,
       entry_price, entry_amount_usd, current_amount_token, highest_price_seen,
       trailing_stop_price, mcap_tier, status, exit_reason, realized_pnl,
       total_fees, opened_at, closed_at)
    VALUES
      (@signal_id, @entry_trade_id, @token_address, @token_symbol, @chain,
       @entry_price, @entry_amount_usd, @current_amount_token, @highest_price_seen,
       @trailing_stop_price, @mcap_tier, @status, @exit_reason, @realized_pnl,
       @total_fees, @opened_at, @closed_at)
  `);
  return Number(stmt.run(position).lastInsertRowid);
}

export function updatePosition(
  db: Database.Database,
  id: number,
  updates: Partial<Pick<PositionRow, "current_amount_token" | "highest_price_seen" | "trailing_stop_price" | "mcap_tier" | "status" | "exit_reason" | "realized_pnl" | "total_fees" | "closed_at">>,
): void {
  const fields = Object.keys(updates)
    .map((k) => `${k} = @${k}`)
    .join(", ");
  db.prepare(`UPDATE positions SET ${fields} WHERE id = @id`).run({ ...updates, id });
}

export function getOpenPositions(db: Database.Database): PositionRow[] {
  return db
    .prepare("SELECT * FROM positions WHERE status IN ('OPEN', 'PARTIALLY_CLOSED') ORDER BY opened_at ASC")
    .all() as PositionRow[];
}

export function getPositionByToken(
  db: Database.Database,
  tokenAddress: string,
  chain: string,
): PositionRow | undefined {
  return db
    .prepare(
      "SELECT * FROM positions WHERE token_address = ? AND chain = ? AND status IN ('OPEN', 'PARTIALLY_CLOSED') LIMIT 1",
    )
    .get(tokenAddress, chain) as PositionRow | undefined;
}

export function getAllPositions(db: Database.Database, limit: number = 100): PositionRow[] {
  return db.prepare("SELECT * FROM positions ORDER BY opened_at DESC LIMIT ?").all(limit) as PositionRow[];
}

// ── portfolio_snapshots ──────────────────────────────────────────────

export interface PortfolioSnapshotRow {
  id: number;
  total_value_usd: number;
  cash_balance_usd: number;
  positions_value_usd: number;
  open_position_count: number | null;
  total_realized_pnl: number | null;
  snapshot_at: string;
}

export function insertPortfolioSnapshot(
  db: Database.Database,
  snapshot: Omit<PortfolioSnapshotRow, "id">,
): number {
  const stmt = db.prepare(`
    INSERT INTO portfolio_snapshots
      (total_value_usd, cash_balance_usd, positions_value_usd, open_position_count, total_realized_pnl, snapshot_at)
    VALUES
      (@total_value_usd, @cash_balance_usd, @positions_value_usd, @open_position_count, @total_realized_pnl, @snapshot_at)
  `);
  return Number(stmt.run(snapshot).lastInsertRowid);
}

export function getPortfolioSnapshots(db: Database.Database, limit: number = 500): PortfolioSnapshotRow[] {
  return db
    .prepare("SELECT * FROM portfolio_snapshots ORDER BY snapshot_at DESC LIMIT ?")
    .all(limit) as PortfolioSnapshotRow[];
}

export function getLatestSnapshot(db: Database.Database): PortfolioSnapshotRow | undefined {
  return db
    .prepare("SELECT * FROM portfolio_snapshots ORDER BY snapshot_at DESC LIMIT 1")
    .get() as PortfolioSnapshotRow | undefined;
}

// ── agent_log ────────────────────────────────────────────────────────

export interface AgentLogRow {
  id: number;
  event_type: string;
  severity: string;
  message: string;
  data_json: string | null;
  created_at: string;
}

export function insertAgentLog(
  db: Database.Database,
  log: Omit<AgentLogRow, "id">,
): number {
  const stmt = db.prepare(`
    INSERT INTO agent_log (event_type, severity, message, data_json, created_at)
    VALUES (@event_type, @severity, @message, @data_json, @created_at)
  `);
  return Number(stmt.run(log).lastInsertRowid);
}

export function getAgentLogsSince(db: Database.Database, afterId: number, limit: number = 100): AgentLogRow[] {
  return db
    .prepare("SELECT * FROM agent_log WHERE id > ? ORDER BY id ASC LIMIT ?")
    .all(afterId, limit) as AgentLogRow[];
}

export function getRecentAgentLogs(db: Database.Database, limit: number = 100): AgentLogRow[] {
  return db
    .prepare("SELECT * FROM agent_log ORDER BY id DESC LIMIT ?")
    .all(limit) as AgentLogRow[];
}

// ── agent_state ──────────────────────────────────────────────────────

export interface AgentStateRow {
  key: string;
  value: string;
  updated_at: string;
}

export function getAgentState(db: Database.Database, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM agent_state WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setAgentState(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO agent_state (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  ).run(key, value, new Date().toISOString());
}

// ── aggregate queries ────────────────────────────────────────────────

export interface PortfolioMetrics {
  totalRealizedPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
}

export function getPortfolioMetrics(db: Database.Database): PortfolioMetrics {
  const closed = db
    .prepare("SELECT realized_pnl FROM positions WHERE status = 'CLOSED'")
    .all() as { realized_pnl: number }[];

  const wins = closed.filter((p) => p.realized_pnl > 0);
  const losses = closed.filter((p) => p.realized_pnl < 0);

  const totalRealizedPnl = closed.reduce((sum, p) => sum + p.realized_pnl, 0);
  const grossProfit = wins.reduce((sum, p) => sum + p.realized_pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, p) => sum + p.realized_pnl, 0));

  return {
    totalRealizedPnl,
    totalTrades: closed.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate: closed.length > 0 ? wins.length / closed.length : 0,
    avgWin: wins.length > 0 ? grossProfit / wins.length : 0,
    avgLoss: losses.length > 0 ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0,
  };
}
