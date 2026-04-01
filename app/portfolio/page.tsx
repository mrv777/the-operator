"use client";

import { useEffect, useState } from "react";
import { EquityCurve, DrawdownChart } from "@/components/EquityCurve";
import { formatUsd, formatPnl, formatPct, formatNumber } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

interface Snapshot {
  snapshot_at: string;
  total_value_usd: number;
  cash_balance_usd: number;
  positions_value_usd: number;
}

interface Metrics {
  totalRealizedPnl: number;
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  maxDrawdown: number;
  cashBalance: number;
  openPositionCount: number;
}

export default function PortfolioPage() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/portfolio");
        if (res.ok) {
          const data = await res.json();
          setSnapshots(data.snapshots);
          setMetrics(data.metrics);
        }
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Portfolio</h1>

      {/* Key metrics */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Total Realized P&L"
            value={formatPnl(metrics.totalRealizedPnl)}
            color={metrics.totalRealizedPnl >= 0 ? "profit" : "loss"}
          />
          <MetricCard
            label="Win Rate"
            value={metrics.totalTrades > 0 ? formatPct(metrics.winRate * 100).replace("+", "") : "—"}
            sub={`${metrics.winningTrades}W / ${metrics.losingTrades}L`}
          />
          <MetricCard
            label="Profit Factor"
            value={metrics.profitFactor === Infinity ? "∞" : formatNumber(metrics.profitFactor)}
            color={metrics.profitFactor >= 1 ? "profit" : "loss"}
          />
          <MetricCard
            label="Max Drawdown"
            value={formatPct(-metrics.maxDrawdown)}
            color="loss"
          />
          <MetricCard
            label="Avg Win"
            value={metrics.avgWin > 0 ? formatUsd(metrics.avgWin) : "—"}
            color="profit"
          />
          <MetricCard
            label="Avg Loss"
            value={metrics.avgLoss > 0 ? formatUsd(metrics.avgLoss) : "—"}
            color="loss"
          />
          <MetricCard
            label="Cash Balance"
            value={formatUsd(metrics.cashBalance)}
          />
          <MetricCard
            label="Open Positions"
            value={String(metrics.openPositionCount)}
          />
        </div>
      )}

      {/* Charts */}
      <EquityCurve snapshots={snapshots} />
      <DrawdownChart snapshots={snapshots} />
    </div>
  );
}

function MetricCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: "profit" | "loss";
}) {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-3">
      <p className="text-xs text-text-muted uppercase tracking-wider">{label}</p>
      <p
        className={cn(
          "text-xl font-semibold font-num",
          color === "profit" && "text-profit",
          color === "loss" && "text-loss",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-xs text-text-muted font-num">{sub}</p>}
    </div>
  );
}
