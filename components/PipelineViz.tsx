"use client";

import { cn } from "@/lib/utils";

interface PipelineStep {
  label: string;
  count: number | string;
  active?: boolean;
}

export function PipelineViz({ steps }: { steps: PipelineStep[] }) {
  return (
    <div className="bg-bg-card rounded-xl border border-border p-4">
      <p className="text-xs text-text-muted uppercase tracking-wider mb-3">Pipeline</p>
      <div className="flex items-center gap-1 overflow-x-auto">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-1">
            <div
              className={cn(
                "rounded-lg px-3 py-2 min-w-[100px] text-center border",
                step.active
                  ? "bg-signal/10 border-signal/30 text-signal"
                  : "bg-bg-card-hover border-border text-text-secondary",
              )}
            >
              <p className="text-[10px] uppercase tracking-wider opacity-70">{step.label}</p>
              <p className="text-lg font-semibold font-num">{step.count}</p>
            </div>
            {i < steps.length - 1 && (
              <span className="text-text-muted text-xs px-0.5">&rarr;</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
