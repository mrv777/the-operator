"use client";

import { cn } from "@/lib/utils";
import { formatUsd, formatPnl, truncateAddress, solscanUrl, jupUrl, timeAgo } from "@/lib/utils/format";

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

const statusColors: Record<string, string> = {
  FILLED: "text-profit",
  PENDING: "text-warning",
  EXEC_FAILED: "text-loss",
  TX_FAILED: "text-loss",
  QUOTE_FAILED: "text-loss",
  SKIPPED_IMPACT: "text-warning",
};

export function TradesTable({ trades }: { trades: Trade[] }) {
  if (trades.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-text-muted">No trades executed yet</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-text-muted text-xs uppercase tracking-wider">
              <th className="text-left p-3 font-medium">Time</th>
              <th className="text-left p-3 font-medium">Token</th>
              <th className="text-center p-3 font-medium">Direction</th>
              <th className="text-right p-3 font-medium">Amount</th>
              <th className="text-right p-3 font-medium">Price</th>
              <th className="text-right p-3 font-medium">Impact</th>
              <th className="text-right p-3 font-medium">Fee</th>
              <th className="text-left p-3 font-medium">Tx</th>
              <th className="text-left p-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => (
              <tr key={t.id} className="border-b border-border/50 hover:bg-bg-card-hover transition-colors">
                <td className="p-3 text-text-secondary font-num text-xs">{timeAgo(t.executed_at)}</td>
                <td className="p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="font-medium">{t.token_symbol ?? "???"}</span>
                    <a
                      href={jupUrl(t.token_address)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted text-xs hover:text-signal font-num"
                    >
                      {truncateAddress(t.token_address)}
                    </a>
                  </div>
                </td>
                <td className="p-3 text-center">
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      t.direction === "BUY" ? "bg-profit/20 text-profit" : "bg-loss/20 text-loss",
                    )}
                  >
                    {t.direction}
                  </span>
                </td>
                <td className="p-3 text-right font-num">{t.amount_usd ? formatUsd(t.amount_usd) : "—"}</td>
                <td className="p-3 text-right font-num text-text-secondary">
                  {t.price_at_execution ? `$${t.price_at_execution.toPrecision(4)}` : "—"}
                </td>
                <td className="p-3 text-right font-num text-text-secondary">
                  {t.price_impact != null ? `${(t.price_impact * 100).toFixed(2)}%` : "—"}
                </td>
                <td className="p-3 text-right font-num text-text-secondary">
                  {t.fee_usd != null ? formatUsd(t.fee_usd) : "—"}
                </td>
                <td className="p-3">
                  {t.tx_hash ? (
                    <a
                      href={solscanUrl(t.tx_hash, "tx")}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-signal text-xs hover:underline font-num"
                    >
                      {truncateAddress(t.tx_hash)}
                    </a>
                  ) : (
                    <span className="text-text-muted text-xs">—</span>
                  )}
                </td>
                <td className="p-3">
                  <span className={cn("text-xs font-num", statusColors[t.status] ?? "text-text-muted")}>
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
