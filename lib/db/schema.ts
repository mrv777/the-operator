import Database from "better-sqlite3";
import path from "path";

const DEFAULT_DB_PATH = "./data/operator.db";

export function getDb(dbPath?: string): Database.Database {
  const resolvedPath = path.resolve(dbPath ?? process.env.DATABASE_PATH ?? DEFAULT_DB_PATH);
  const db = new Database(resolvedPath);

  // WAL mode — readers never block writers
  db.pragma("journal_mode = WAL");
  // 5s busy timeout for concurrent access (agent writes, dashboard reads)
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database): void {
  db.exec(`
    -- Raw SM trade observations
    CREATE TABLE IF NOT EXISTS sm_trades (
      id INTEGER PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      sm_label TEXT NOT NULL,
      token_address TEXT NOT NULL,
      token_symbol TEXT,
      chain TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount_usd REAL,
      tx_hash TEXT,
      traded_at TEXT NOT NULL,
      scanned_at TEXT NOT NULL,
      UNIQUE(tx_hash)
    );

    -- Detected convergence events
    CREATE TABLE IF NOT EXISTS signals (
      id INTEGER PRIMARY KEY,
      token_address TEXT NOT NULL,
      token_symbol TEXT,
      chain TEXT NOT NULL,
      wallet_count INTEGER NOT NULL,
      convergence_score INTEGER NOT NULL,
      combined_volume_usd REAL,
      wallets_json TEXT,
      is_contested INTEGER DEFAULT 0,
      contested_details TEXT,
      status TEXT NOT NULL,
      filter_reason TEXT,
      detected_at TEXT NOT NULL,
      validated_at TEXT,
      UNIQUE(token_address, chain, detected_at)
    );

    -- Executed trades
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY,
      signal_id INTEGER REFERENCES signals(id),
      token_address TEXT NOT NULL,
      token_symbol TEXT,
      chain TEXT NOT NULL,
      direction TEXT NOT NULL,
      amount_token REAL,
      amount_usd REAL,
      price_at_execution REAL,
      slippage_actual REAL,
      price_impact REAL,
      fee_usd REAL,
      quote_id TEXT,
      tx_hash TEXT,
      status TEXT NOT NULL,
      executed_at TEXT NOT NULL
    );

    -- Open and closed positions
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY,
      signal_id INTEGER REFERENCES signals(id),
      entry_trade_id INTEGER REFERENCES trades(id),
      token_address TEXT NOT NULL,
      token_symbol TEXT,
      chain TEXT NOT NULL,
      entry_price REAL NOT NULL,
      entry_amount_usd REAL NOT NULL,
      current_amount_token REAL,
      highest_price_seen REAL,
      trailing_stop_price REAL,
      mcap_tier TEXT,
      status TEXT NOT NULL,
      exit_reason TEXT,
      realized_pnl REAL DEFAULT 0,
      total_fees REAL DEFAULT 0,
      opened_at TEXT NOT NULL,
      closed_at TEXT
    );

    -- Portfolio snapshots (equity curve, every 15 min)
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id INTEGER PRIMARY KEY,
      total_value_usd REAL NOT NULL,
      cash_balance_usd REAL NOT NULL,
      positions_value_usd REAL NOT NULL,
      open_position_count INTEGER,
      total_realized_pnl REAL,
      snapshot_at TEXT NOT NULL
    );

    -- Agent event log (activity feed + SSE)
    CREATE TABLE IF NOT EXISTS agent_log (
      id INTEGER PRIMARY KEY,
      event_type TEXT NOT NULL,
      severity TEXT DEFAULT 'INFO',
      message TEXT NOT NULL,
      data_json TEXT,
      created_at TEXT NOT NULL
    );

    -- Agent state (crash recovery)
    CREATE TABLE IF NOT EXISTS agent_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    -- Indexes for common queries
    CREATE INDEX IF NOT EXISTS idx_sm_trades_token_chain
      ON sm_trades(token_address, chain, traded_at);
    CREATE INDEX IF NOT EXISTS idx_sm_trades_scanned
      ON sm_trades(scanned_at);
    CREATE INDEX IF NOT EXISTS idx_signals_status
      ON signals(status);
    CREATE INDEX IF NOT EXISTS idx_signals_token_chain
      ON signals(token_address, chain);
    CREATE INDEX IF NOT EXISTS idx_trades_signal
      ON trades(signal_id);
    CREATE INDEX IF NOT EXISTS idx_positions_status
      ON positions(status);
    CREATE INDEX IF NOT EXISTS idx_agent_log_created
      ON agent_log(created_at);
    CREATE INDEX IF NOT EXISTS idx_agent_log_id
      ON agent_log(id);
    CREATE INDEX IF NOT EXISTS idx_portfolio_snapshots_at
      ON portfolio_snapshots(snapshot_at);
  `);
}
