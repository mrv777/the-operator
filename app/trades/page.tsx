"use client";

import { useEffect, useState } from "react";
import { TradesTable } from "@/components/TradeRow";
import { formatUsd, formatPnl } from "@/lib/utils/format";

interface Trade {
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

export default function TradesPage() {
  const [trades, setTrades] = useState<Trade[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/trades");
        if (res.ok) {
          const data = await res.json();
          setTrades(data.trades);
        }
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const totalVolume = trades.reduce((sum, t) => sum + (t.amount_usd ?? 0), 0);
  const totalFees = trades.reduce((sum, t) => sum + (t.fee_usd ?? 0), 0);
  const buys = trades.filter((t) => t.direction === "BUY").length;
  const sells = trades.filter((t) => t.direction === "SELL").length;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Trades</h1>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-text-muted uppercase tracking-wider">Total Trades</p>
          <p className="text-xl font-semibold font-num">{trades.length}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-text-muted uppercase tracking-wider">Buy / Sell</p>
          <p className="text-xl font-semibold font-num">
            <span className="text-profit">{buys}</span>
            <span className="text-text-muted"> / </span>
            <span className="text-loss">{sells}</span>
          </p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-text-muted uppercase tracking-wider">Total Volume</p>
          <p className="text-xl font-semibold font-num">{formatUsd(totalVolume, true)}</p>
        </div>
        <div className="bg-bg-card rounded-xl border border-border p-3">
          <p className="text-xs text-text-muted uppercase tracking-wider">Total Fees</p>
          <p className="text-xl font-semibold font-num text-text-secondary">{formatUsd(totalFees)}</p>
        </div>
      </div>

      <TradesTable trades={trades} />
    </div>
  );
}
