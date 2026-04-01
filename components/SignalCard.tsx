"use client";

import { cn } from "@/lib/utils";
import { truncateAddress, jupUrl, formatUsd, timeAgo } from "@/lib/utils/format";
import { Tooltip, HelpIcon } from "@/components/Tooltip";

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

const statusDescriptions: Record<string, string> = {
  DETECTED: "Convergence event just identified, pending validation",
  VALIDATING: "Running safety checks (liquidity, market cap, etc.)",
  PASSED: "Passed all checks, score meets threshold — ready to trade",
  TRADED: "Trade executed for this signal",
  WATCHING: "Passed safety checks but score is below the trading threshold. Monitoring for changes.",
  FILTERED: "Failed one or more safety checks",
  EXPIRED: "Signal aged out of the 24h window without trading",
  CAPPED: "Would trade but portfolio exposure cap reached",
};

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? "text-profit" : score >= 70 ? "text-signal" : score >= 50 ? "text-warning" : "text-text-muted";

  const label =
    score >= 80 ? "Strong" : score >= 70 ? "Tradeable" : score >= 50 ? "Moderate" : "Weak";

  return (
    <Tooltip content={<>{label} signal. Scores 70+ are eligible for trading. Based on wallet count, independence, volume concentration, and timing.</>}>
      <span className={cn("font-num font-semibold cursor-help", color)}>{score}</span>
    </Tooltip>
  );
}

function StatusBadge({ status, filterReason }: { status: string; filterReason: string | null }) {
  const desc = statusDescriptions[status] ?? status;
  const content = status === "FILTERED" && filterReason
    ? <><span className="font-medium">Filtered:</span> {filterReason}</>
    : desc;

  return (
    <Tooltip content={content} maxWidth={300}>
      <span className={cn("text-xs px-2 py-0.5 rounded-full cursor-help", statusColors[status] ?? "text-text-muted")}>
        {status}
      </span>
    </Tooltip>
  );
}

function ContestedBadge({ isContested, contestedDetails }: { isContested: boolean; contestedDetails: string | null }) {
  if (!isContested) {
    return <span className="text-text-muted">—</span>;
  }

  let sellerCount = 0;
  if (contestedDetails) {
    try {
      sellerCount = JSON.parse(contestedDetails).length;
    } catch { /* ignore */ }
  }

  const detail = sellerCount > 0
    ? `${sellerCount} SM wallet${sellerCount > 1 ? "s" : ""} selling while others are buying. Mixed conviction — proceed with caution.`
    : "Some SM wallets are selling this token while others are buying. The signal is not purely bullish.";

  return (
    <Tooltip content={detail}>
      <span className="text-warning cursor-help">&#x26A0;&#xFE0F;</span>
    </Tooltip>
  );
}

export function SignalsTable({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-8 text-center">
        <p className="text-text-muted">No signals detected yet</p>
        <p className="text-text-muted text-xs mt-1">Signals appear when 3+ smart money wallets independently buy the same token within 24 hours</p>
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
              <th className="text-right p-3 font-medium">
                <Tooltip content="Number of distinct smart money wallets buying this token within the convergence window">
                  <span className="cursor-help">SM Wallets<HelpIcon /></span>
                </Tooltip>
              </th>
              <th className="text-right p-3 font-medium">
                <Tooltip content="Convergence score (0-100). Based on wallet count, label diversity, volume, and timing. 70+ triggers a trade.">
                  <span className="cursor-help">Score<HelpIcon /></span>
                </Tooltip>
              </th>
              <th className="text-right p-3 font-medium">
                <Tooltip content="Combined USD buy volume from all SM wallets in this convergence event">
                  <span className="cursor-help">Volume<HelpIcon /></span>
                </Tooltip>
              </th>
              <th className="text-left p-3 font-medium">Status</th>
              <th className="text-center p-3 font-medium">
                <Tooltip content="Whether SM wallets are also selling this token — a mixed signal">
                  <span className="cursor-help">Contested<HelpIcon /></span>
                </Tooltip>
              </th>
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
            href={jupUrl(signal.token_address)}
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
        <StatusBadge status={signal.status} filterReason={signal.filter_reason} />
      </td>
      <td className="p-3 text-center">
        <ContestedBadge isContested={signal.is_contested === 1} contestedDetails={signal.contested_details} />
      </td>
    </tr>
  );
}
