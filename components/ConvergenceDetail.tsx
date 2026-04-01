"use client";

import { truncateAddress, solscanUrl, formatUsd, timeAgo } from "@/lib/utils/format";

interface Wallet {
  address: string;
  label: string;
  amount?: number;
  timestamp?: string;
}

interface Signal {
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
}

export function ConvergenceDetail({ signal }: { signal: Signal }) {
  let wallets: Wallet[] = [];
  try {
    wallets = signal.wallets_json ? JSON.parse(signal.wallets_json) : [];
  } catch { /* ignore */ }

  let contestedWallets: Wallet[] = [];
  try {
    contestedWallets = signal.contested_details ? JSON.parse(signal.contested_details) : [];
  } catch { /* ignore */ }

  return (
    <div className="space-y-4">
      {/* SM wallets that bought */}
      <div>
        <p className="text-xs text-text-muted uppercase tracking-wider mb-2">Smart Money Buyers</p>
        <div className="space-y-1">
          {wallets.map((w, i) => (
            <div key={i} className="flex items-center justify-between bg-bg-card-hover rounded-lg px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <a
                  href={solscanUrl(w.address)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-signal hover:underline font-num text-xs"
                >
                  {truncateAddress(w.address, 6)}
                </a>
                <span className="text-xs bg-signal/10 text-signal px-1.5 py-0.5 rounded">{w.label}</span>
              </div>
              <div className="flex items-center gap-3 text-text-secondary text-xs font-num">
                {w.amount && <span>{formatUsd(w.amount)}</span>}
                {w.timestamp && <span>{timeAgo(w.timestamp)}</span>}
              </div>
            </div>
          ))}
          {wallets.length === 0 && (
            <p className="text-text-muted text-xs">No wallet details available</p>
          )}
        </div>
      </div>

      {/* Contested — SM selling */}
      {signal.is_contested > 0 && contestedWallets.length > 0 && (
        <div>
          <p className="text-xs text-warning uppercase tracking-wider mb-2">
            ⚠️ Contested — SM Selling
          </p>
          <div className="space-y-1">
            {contestedWallets.map((w, i) => (
              <div key={i} className="flex items-center justify-between bg-loss/5 rounded-lg px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <a
                    href={solscanUrl(w.address)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-loss hover:underline font-num text-xs"
                  >
                    {truncateAddress(w.address, 6)}
                  </a>
                  <span className="text-xs bg-loss/10 text-loss px-1.5 py-0.5 rounded">{w.label}</span>
                </div>
                <div className="flex items-center gap-3 text-text-secondary text-xs font-num">
                  {w.amount && <span>{formatUsd(w.amount)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter reason */}
      {signal.filter_reason && (
        <div className="text-xs text-text-muted bg-bg-card-hover rounded-lg px-3 py-2">
          <span className="text-text-secondary">Filter reason:</span> {signal.filter_reason}
        </div>
      )}
    </div>
  );
}
