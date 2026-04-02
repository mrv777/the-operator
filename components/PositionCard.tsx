"use client";

import { cn } from "@/lib/utils";
import { formatUsd, formatPnl, formatPct, truncateAddress, jupUrl, timeAgo } from "@/lib/utils/format";

interface Position {
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
  current_price: number | null;
  current_value_usd: number | null;
  unrealized_pnl: number | null;
  unrealized_pnl_pct: number | null;
}

const statusColors: Record<string, string> = {
  OPEN: "bg-profit/20 text-profit",
  PARTIALLY_CLOSED: "bg-warning/20 text-warning",
  CLOSED: "bg-text-muted/20 text-text-muted",
};

export function PositionCards({ positions }: { positions: Position[] }) {
  if (positions.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-text-muted">No positions</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {positions.map((p) => (
        <PositionCard key={p.id} position={p} />
      ))}
    </div>
  );
}

function PositionCard({ position: p }: { position: Position }) {
  const isOpen = p.status === "OPEN" || p.status === "PARTIALLY_CLOSED";
  const pnl = isOpen ? p.unrealized_pnl : p.realized_pnl;
  const pnlPct = p.unrealized_pnl_pct;
  const pnlColor = (pnl ?? 0) >= 0 ? "text-profit" : "text-loss";

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 space-y-3">
      {/* Header: token + status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">{p.token_symbol ?? "???"}</span>
          <a
            href={jupUrl(p.token_address)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted text-xs hover:text-signal font-num"
          >
            {truncateAddress(p.token_address)}
          </a>
        </div>
        <span className={cn("text-xs px-2 py-0.5 rounded-full", statusColors[p.status] ?? "text-text-muted")}>
          {p.status}
        </span>
      </div>

      {/* Live price + P&L hero (open positions only) */}
      {isOpen && p.current_price != null && (
        <div className="flex items-baseline justify-between py-1">
          <div>
            <span className="text-text-muted text-xs">Current Price</span>
            <p className="text-xl font-semibold font-num">${p.current_price.toPrecision(4)}</p>
          </div>
          <div className="text-right">
            <span className="text-text-muted text-xs">Unrealized P&L</span>
            <p className={cn("text-xl font-semibold font-num", pnlColor)}>
              {pnl != null ? formatPnl(pnl) : "—"}
            </p>
            {pnlPct != null && (
              <p className={cn("text-xs font-num", pnlColor)}>{formatPct(pnlPct)}</p>
            )}
          </div>
        </div>
      )}

      {/* Price ladder: entry → current → peak, with trailing stop */}
      <div className="grid grid-cols-3 gap-x-2 text-sm">
        <div>
          <span className="text-text-muted text-xs">Entry</span>
          <p className="font-num">${p.entry_price.toPrecision(4)}</p>
          <p className="text-text-muted text-xs font-num">{formatUsd(p.entry_amount_usd)}</p>
        </div>
        {isOpen && p.trailing_stop_price ? (
          <div>
            <span className="text-text-muted text-xs">Stop</span>
            <p className="font-num text-warning">${p.trailing_stop_price.toPrecision(4)}</p>
            {p.mcap_tier && (
              <p className="text-text-muted text-xs capitalize">{p.mcap_tier}</p>
            )}
          </div>
        ) : (
          <div>
            {p.current_value_usd != null && (
              <>
                <span className="text-text-muted text-xs">Value</span>
                <p className="font-num">{formatUsd(p.current_value_usd)}</p>
              </>
            )}
          </div>
        )}
        {p.highest_price_seen ? (
          <div className="text-right">
            <span className="text-text-muted text-xs">Peak</span>
            <p className="font-num">${p.highest_price_seen.toPrecision(4)}</p>
          </div>
        ) : <div />}
      </div>

      {/* Closed position P&L */}
      {!isOpen && (
        <div>
          <span className="text-text-muted text-xs">Realized P&L</span>
          <p className={cn("font-num font-semibold", pnlColor)}>{formatPnl(p.realized_pnl)}</p>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-text-muted pt-1 border-t border-border/50">
        <span>Opened {timeAgo(p.opened_at)}</span>
        {p.exit_reason && <span>Exit: {p.exit_reason}</span>}
        {p.total_fees > 0 && <span className="font-num">Fees: {formatUsd(p.total_fees)}</span>}
      </div>
    </div>
  );
}
