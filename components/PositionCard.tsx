"use client";

import { cn } from "@/lib/utils";
import { formatUsd, formatPnl, formatPct, truncateAddress, solscanUrl, jupUrl, timeAgo } from "@/lib/utils/format";

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
  const pnlColor = p.realized_pnl >= 0 ? "text-profit" : "text-loss";
  const isOpen = p.status === "OPEN" || p.status === "PARTIALLY_CLOSED";

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 space-y-3">
      {/* Header */}
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

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <span className="text-text-muted text-xs">Entry Price</span>
          <p className="font-num">${p.entry_price.toPrecision(4)}</p>
        </div>
        <div>
          <span className="text-text-muted text-xs">Entry Size</span>
          <p className="font-num">{formatUsd(p.entry_amount_usd)}</p>
        </div>
        {p.highest_price_seen && (
          <div>
            <span className="text-text-muted text-xs">Peak Price</span>
            <p className="font-num">${p.highest_price_seen.toPrecision(4)}</p>
          </div>
        )}
        {p.trailing_stop_price && isOpen && (
          <div>
            <span className="text-text-muted text-xs">Trailing Stop</span>
            <p className="font-num text-warning">${p.trailing_stop_price.toPrecision(4)}</p>
          </div>
        )}
        {p.mcap_tier && (
          <div>
            <span className="text-text-muted text-xs">Mcap Tier</span>
            <p className="text-text-secondary capitalize">{p.mcap_tier}</p>
          </div>
        )}
        <div>
          <span className="text-text-muted text-xs">Realized P&L</span>
          <p className={cn("font-num font-semibold", pnlColor)}>{formatPnl(p.realized_pnl)}</p>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-text-muted pt-1 border-t border-border/50">
        <span>Opened {timeAgo(p.opened_at)}</span>
        {p.exit_reason && <span>Exit: {p.exit_reason}</span>}
        {p.total_fees > 0 && <span className="font-num">Fees: {formatUsd(p.total_fees)}</span>}
      </div>
    </div>
  );
}
