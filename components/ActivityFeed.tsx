"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { timeAgo } from "@/lib/utils/format";

interface LogEvent {
  id: number;
  event_type: string;
  severity: string;
  message: string;
  data_json: string | null;
  created_at: string;
}

const eventColors: Record<string, string> = {
  SCAN: "text-signal",
  SIGNAL: "text-warning",
  VALIDATE: "text-text-secondary",
  TRADE: "text-profit",
  EXIT: "text-loss",
  ERROR: "text-loss",
  INFO: "text-text-secondary",
};

const eventIcons: Record<string, string> = {
  SCAN: "~",
  SIGNAL: "!",
  VALIDATE: "?",
  TRADE: "$",
  EXIT: "x",
  ERROR: "!",
  INFO: "i",
};

export function ActivityFeed() {
  const [events, setEvents] = useState<LogEvent[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cursor = 0;
    let es: EventSource | null = null;

    function connect() {
      const token = ""; // SSE with query param auth
      es = new EventSource(`/api/agent/events?cursor=${cursor}&token=${token}`);
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (data.events?.length > 0) {
            cursor = data.cursor;
            setEvents((prev) => [...prev, ...data.events].slice(-100));
          }
        } catch { /* ignore parse errors */ }
      };
      es.onerror = () => {
        es?.close();
        setTimeout(connect, 5000);
      };
    }

    connect();
    return () => es?.close();
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [events]);

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Activity Feed</p>
      <div ref={containerRef} className="h-64 overflow-y-auto space-y-1 text-sm font-mono">
        {events.length === 0 && (
          <p className="text-text-muted text-xs">No events yet. Agent activity will appear here.</p>
        )}
        {events.map((ev) => (
          <div key={ev.id} className="flex items-start gap-2 py-0.5">
            <span
              className={cn(
                "w-5 h-5 rounded text-[10px] flex items-center justify-center shrink-0 mt-0.5 bg-bg-card-hover",
                eventColors[ev.event_type] ?? "text-text-muted",
              )}
            >
              {eventIcons[ev.event_type] ?? "."}
            </span>
            <span className="text-text-muted text-xs shrink-0 font-num w-14">
              {timeAgo(ev.created_at)}
            </span>
            <span className={cn("text-xs", eventColors[ev.event_type] ?? "text-text-secondary")}>
              {ev.message}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
