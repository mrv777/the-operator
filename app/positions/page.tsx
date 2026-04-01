"use client";

import { useEffect, useState } from "react";
import { PositionCards } from "@/components/PositionCard";
import { formatUsd, formatPnl } from "@/lib/utils/format";
import { authFetch } from "@/lib/auth-client";

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

export default function PositionsPage() {
  const [open, setOpen] = useState<Position[]>([]);
  const [closed, setClosed] = useState<Position[]>([]);
  const [showClosed, setShowClosed] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [openRes, allRes] = await Promise.all([
          authFetch("/api/positions"),
          authFetch("/api/positions?all=true"),
        ]);
        if (openRes.ok) setOpen((await openRes.json()).positions);
        if (allRes.ok) {
          const all: Position[] = (await allRes.json()).positions;
          setClosed(all.filter((p) => p.status === "CLOSED"));
        }
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const totalExposure = open.reduce((sum, p) => sum + p.entry_amount_usd, 0);
  const totalRealizedPnl = closed.reduce((sum, p) => sum + p.realized_pnl, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Positions</h1>
        <button
          onClick={() => setShowClosed(!showClosed)}
          className="text-xs px-3 py-1.5 rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text-primary transition-colors"
        >
          {showClosed ? "Show Open" : "Show Closed"}
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-text-muted uppercase tracking-wider">Open</p>
          <p className="text-xl font-semibold font-num text-profit">{open.length}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-text-muted uppercase tracking-wider">Closed</p>
          <p className="text-xl font-semibold font-num">{closed.length}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-text-muted uppercase tracking-wider">Total Exposure</p>
          <p className="text-xl font-semibold font-num">{formatUsd(totalExposure)}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-text-muted uppercase tracking-wider">Realized P&L</p>
          <p className={`text-xl font-semibold font-num ${totalRealizedPnl >= 0 ? "text-profit" : "text-loss"}`}>
            {formatPnl(totalRealizedPnl)}
          </p>
        </div>
      </div>

      <PositionCards positions={showClosed ? closed : open} />
    </div>
  );
}
