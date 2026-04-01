"use client";

import { useEffect, useState } from "react";
import { SignalsTable } from "@/components/SignalCard";
import { ConvergenceDetail } from "@/components/ConvergenceDetail";

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

const statuses = ["ALL", "DETECTED", "PASSED", "TRADED", "WATCHING", "FILTERED", "EXPIRED"];

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [filter, setFilter] = useState("ALL");
  const [selected, setSelected] = useState<Signal | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const url = filter === "ALL" ? "/api/signals" : `/api/signals?status=${filter}`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          setSignals(data.signals);
        }
      } catch { /* ignore */ }
    }
    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, [filter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Signals</h1>
        <div className="flex gap-1">
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => { setFilter(s); setSelected(null); }}
              className={`text-xs px-2.5 py-1 rounded-lg transition-colors ${
                filter === s
                  ? "bg-signal/20 text-signal"
                  : "text-text-muted hover:text-text-secondary hover:bg-bg-card"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <SignalsTable signals={signals} />

      {/* Drill-down detail panel */}
      {selected && (
        <div className="bg-bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">
              Signal Detail — {selected.token_symbol ?? selected.token_address.slice(0, 8)}
            </h2>
            <button
              onClick={() => setSelected(null)}
              className="text-text-muted hover:text-text-primary text-sm"
            >
              Close
            </button>
          </div>
          <ConvergenceDetail signal={selected} />
        </div>
      )}
    </div>
  );
}
