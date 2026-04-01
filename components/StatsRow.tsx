"use client";

import { cn } from "@/lib/utils";

interface Stat {
  label: string;
  value: string;
  subValue?: string;
  color?: "profit" | "loss" | "signal" | "warning" | "default";
}

export function StatsRow({ stats }: { stats: Stat[] }) {
  const colorMap = {
    profit: "text-profit",
    loss: "text-loss",
    signal: "text-signal",
    warning: "text-warning",
    default: "text-text-primary",
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-bg-card rounded-xl border border-border p-4"
        >
          <p className="text-xs text-text-muted uppercase tracking-wider mb-1">{s.label}</p>
          <p className={cn("text-xl font-semibold font-num", colorMap[s.color ?? "default"])}>
            {s.value}
          </p>
          {s.subValue && (
            <p className={cn("text-xs font-num mt-0.5", colorMap[s.color ?? "default"])}>
              {s.subValue}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
