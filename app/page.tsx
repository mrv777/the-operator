"use client";

import { useEffect, useState } from "react";
import { AgentStatus } from "@/components/AgentStatus";
import { StatsRow } from "@/components/StatsRow";
import { PipelineViz } from "@/components/PipelineViz";
import { ActivityFeed } from "@/components/ActivityFeed";
import { formatUsd, formatPnl, formatPct } from "@/lib/utils/format";
import { authFetch } from "@/lib/auth-client";

interface StatusData {
  status: string;
  portfolioValue: number;
  totalPnl: number;
  signalsToday: number;
  openPositionCount: number;
  totalScans: number;
  cashBalance: number;
}

interface PipelineData {
  scannedTokens: number;
  convergences: number;
  validated: number;
  traded: number;
  openPositions: number;
  totalPnl: number;
}

export default function OverviewPage() {
  const [status, setStatus] = useState<StatusData | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [statusRes, signalsRes, tradesRes, positionsRes, portfolioRes] = await Promise.all([
          authFetch("/api/agent/status"),
          authFetch("/api/signals"),
          authFetch("/api/trades"),
          authFetch("/api/positions"),
          authFetch("/api/portfolio"),
        ]);

        if (statusRes.ok) {
          const s = await statusRes.json();
          setStatus(s);
        }

        const signals = signalsRes.ok ? (await signalsRes.json()).signals : [];
        const trades = tradesRes.ok ? (await tradesRes.json()).trades : [];
        const positions = positionsRes.ok ? (await positionsRes.json()).positions : [];
        const portfolio = portfolioRes.ok ? await portfolioRes.json() : null;

        const validated = signals.filter((s: { status: string }) =>
          ["PASSED", "TRADED", "WATCHING"].includes(s.status)
        ).length;
        const traded = signals.filter((s: { status: string }) => s.status === "TRADED").length;

        setPipeline({
          scannedTokens: signals.length,
          convergences: signals.length,
          validated,
          traded,
          openPositions: positions.length,
          totalPnl: portfolio?.metrics?.totalRealizedPnl ?? 0,
        });
      } catch {
        /* retry on next poll */
      }
    }

    load();
    const id = setInterval(load, 15_000);
    return () => clearInterval(id);
  }, []);

  const winRate = 0; // Will be populated from portfolio metrics

  const stats = status
    ? [
        {
          label: "Portfolio Value",
          value: formatUsd(status.portfolioValue),
          color: "default" as const,
        },
        {
          label: "Total P&L",
          value: formatPnl(status.totalPnl),
          subValue: status.portfolioValue > 0
            ? formatPct((status.totalPnl / (status.portfolioValue - status.totalPnl)) * 100)
            : undefined,
          color: (status.totalPnl >= 0 ? "profit" : "loss") as "profit" | "loss",
        },
        {
          label: "Win Rate",
          value: `${(winRate * 100).toFixed(0)}%`,
          color: "default" as const,
        },
        {
          label: "Signals Today",
          value: String(status.signalsToday),
          color: "signal" as const,
        },
        {
          label: "Open Positions",
          value: String(status.openPositionCount),
          color: "default" as const,
        },
      ]
    : [];

  const pipelineSteps = pipeline
    ? [
        { label: "SM Scan", count: pipeline.scannedTokens, active: true },
        { label: "Convergence", count: pipeline.convergences },
        { label: "Validated", count: pipeline.validated },
        { label: "Traded", count: pipeline.traded },
        { label: "Open", count: pipeline.openPositions },
        { label: "P&L", count: formatPnl(pipeline.totalPnl), active: pipeline.totalPnl !== 0 },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Overview</h1>
        <AgentStatus />
      </div>

      {/* Hero stats */}
      {stats.length > 0 && <StatsRow stats={stats} />}

      {/* Pipeline */}
      {pipelineSteps.length > 0 && <PipelineViz steps={pipelineSteps} />}

      {/* Activity feed */}
      <ActivityFeed />
    </div>
  );
}
