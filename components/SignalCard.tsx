"use client";

import { cn } from "@/lib/utils";
import { truncateAddress, solscanUrl, formatUsd, timeAgo } from "@/lib/utils/format";

interface Signal {
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

const statusColors: Record<string, string> = {
  DETECTED: "bg-signal/20 text-signal",
  VALIDATING: "bg-signal/20 text-signal",
  PASSED: "bg-profit/20 text-profit",
  TRADED: "bg-profit/20 text-profit",
  WATCHING: "bg-warning/20 text-warning",
  FILTERED: "bg-text-muted/20 text-text-muted",
  EXPIRED: "bg-text-muted/20 text-text-muted",
  CAPPED: "bg-warning/20 text-warning",
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-profit" : score >= 70 ? "text-signal" : score >= 50 ? "text-warning" : "text-text-muted";
  return <span className={cn("font-num font-semibold", color)}>{score}</span>;
}

export function SignalsTable({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-text-muted">No signals detected yet</p>
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
              <th className="text-left p-3 font-medium">Chain</th>
              <th className="text-right p-3 font-medium">SM Wallets</th>
              <th className="text-right p-3 font-medium">Score</th>
              <th className="text-right p-3 font-medium">Volume</th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-center p-3 font-medium">Contested</th>
            </tr>
          </thead>
          <tbody>
            {signals.map((s) => (
              <SignalRow key={s.id} signal={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SignalRow({ signal }: { signal: Signal }) {
  return (
    <tr className="border-b border-border/50 hover:bg-bg-card-hover transition-colors">
      <td className="p-3 text-text-secondary font-num text-xs">{timeAgo(signal.detected_at)}</td>
      <td className="p-3">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{signal.token_symbol ?? "???"}</span>
          <a
            href={solscanUrl(signal.token_address, "token")}
            target="_blank"
            rel="noopener noreferrer"
            className="text-text-muted text-xs hover:text-signal transition-colors font-num"
          >
            {truncateAddress(signal.token_address)}
          </a>
        </div>
      </td>
      <td className="p-3 text-text-secondary text-xs uppercase">{signal.chain}</td>
      <td className="p-3 text-right font-num">{signal.wallet_count}</td>
      <td className="p-3 text-right">
        <ScoreBadge score={signal.convergence_score} />
      </td>
      <td className="p-3 text-right font-num text-text-secondary">
        {signal.combined_volume_usd ? formatUsd(signal.combined_volume_usd, true) : "—"}
      </td>
      <td className="p-3">
        <span className={cn("text-xs px-2 py-0.5 rounded-full", statusColors[signal.status] ?? "text-text-muted")}>
          {signal.status}
        </span>
      </td>
      <td className="p-3 text-center">
        {signal.is_contested ? (
          <span className="text-warning" title="SM wallets are also selling this token">
            ⚠️
          </span>
        ) : (
          <span className="text-text-muted">—</span>
        )}
      </td>
    </tr>
  );
}
