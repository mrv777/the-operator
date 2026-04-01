"use client";

import { useEffect, useState } from "react";
import { formatUptime, timeAgo } from "@/lib/utils/format";
import { cn } from "@/lib/utils";

interface AgentStatusData {
  status: "RUNNING" | "PAUSED" | "STOPPED";
  agentStartedAt: string | null;
  lastScanAt: string | null;
  totalScans: number;
}

export function AgentStatus() {
  const [data, setData] = useState<AgentStatusData | null>(null);

  useEffect(() => {
    async function fetch_() {
      try {
        const res = await fetch("/api/agent/status");
        if (res.ok) setData(await res.json());
      } catch { /* retry next tick */ }
    }
    fetch_();
    const id = setInterval(fetch_, 10_000);
    return () => clearInterval(id);
  }, []);

  if (!data) return null;

  const statusColors = {
    RUNNING: "bg-profit",
    PAUSED: "bg-warning",
    STOPPED: "bg-loss",
  };

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "w-2 h-2 rounded-full",
            statusColors[data.status],
            data.status === "RUNNING" && "animate-pulse-live",
          )}
        />
        <span className="font-medium">{data.status}</span>
      </div>
      {data.agentStartedAt && (
        <span className="text-text-secondary">
          Uptime: <span className="font-num">{formatUptime(data.agentStartedAt)}</span>
        </span>
      )}
      {data.lastScanAt && (
        <span className="text-text-secondary">
          Last scan: <span className="font-num">{timeAgo(data.lastScanAt)}</span>
        </span>
      )}
      <span className="text-text-muted">
        Scans: <span className="font-num">{data.totalScans}</span>
      </span>
    </div>
  );
}
