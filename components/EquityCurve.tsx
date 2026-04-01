"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

interface Snapshot {
  snapshot_at: string;
  total_value_usd: number;
  cash_balance_usd: number;
  positions_value_usd: number;
}

export function EquityCurve({ snapshots }: { snapshots: Snapshot[] }) {
  const data = snapshots.map((s) => ({
    time: new Date(s.snapshot_at).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }),
    value: Number(s.total_value_usd.toFixed(2)),
    cash: Number(s.cash_balance_usd.toFixed(2)),
  }));

  if (data.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-4 h-72 flex items-center justify-center">
        <p className="text-text-muted text-sm">No portfolio snapshots yet</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Equity Curve</p>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#448AFF" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#448AFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#555570", fontSize: 10 }}
            axisLine={{ stroke: "#1E1E2E" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#555570", fontSize: 10 }}
            axisLine={{ stroke: "#1E1E2E" }}
            tickLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              background: "#12121A",
              border: "1px solid #1E1E2E",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#F0F0F5",
            }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Portfolio"]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="#448AFF"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorValue)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function DrawdownChart({ snapshots }: { snapshots: Snapshot[] }) {
  let peak = 0;
  const data = snapshots.map((s) => {
    if (s.total_value_usd > peak) peak = s.total_value_usd;
    const dd = peak > 0 ? (((s.total_value_usd - peak) / peak) * 100) : 0;
    return {
      time: new Date(s.snapshot_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      drawdown: Number(dd.toFixed(2)),
    };
  });

  if (data.length === 0) {
    return (
      <div className="bg-bg-card rounded-xl border border-border p-4 h-72 flex items-center justify-center">
        <p className="text-text-muted text-sm">No drawdown data yet</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Drawdown</p>
      <ResponsiveContainer width="100%" height={200}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorDD" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#FF5252" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#FF5252" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1E1E2E" />
          <XAxis
            dataKey="time"
            tick={{ fill: "#555570", fontSize: 10 }}
            axisLine={{ stroke: "#1E1E2E" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#555570", fontSize: 10 }}
            axisLine={{ stroke: "#1E1E2E" }}
            tickLine={false}
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{
              background: "#12121A",
              border: "1px solid #1E1E2E",
              borderRadius: "8px",
              fontSize: "12px",
              color: "#F0F0F5",
            }}
            formatter={(value: number) => [`${value.toFixed(2)}%`, "Drawdown"]}
          />
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="#FF5252"
            strokeWidth={2}
            fillOpacity={1}
            fill="url(#colorDD)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
