"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  /** Max width in px */
  maxWidth?: number;
}

export function Tooltip({ content, children, maxWidth = 240 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(true);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(true), 200);
  }, []);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 100);
  }, []);

  // Flip tooltip below if too close to top of viewport
  useEffect(() => {
    if (open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setAbove(rect.top > 80);
    }
  }, [open]);

  // Cleanup timeout on unmount
  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <span
      ref={triggerRef}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      tabIndex={0}
      role="button"
      aria-describedby={open ? "tooltip" : undefined}
    >
      {children}
      {open && (
        <div
          ref={tooltipRef}
          role="tooltip"
          id="tooltip"
          style={{ maxWidth }}
          className={`absolute z-50 px-3 py-2 text-xs leading-relaxed text-text-primary bg-bg-card border border-border-light rounded-lg shadow-lg whitespace-normal pointer-events-none
            left-1/2 -translate-x-1/2
            ${above ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {content}
          {/* Arrow */}
          <span
            className={`absolute left-1/2 -translate-x-1/2 w-2 h-2 bg-bg-card border-border-light rotate-45
              ${above ? "bottom-0 translate-y-1/2 border-r border-b" : "top-0 -translate-y-1/2 border-l border-t"}`}
          />
        </div>
      )}
    </span>
  );
}

/** Small (?) icon for inline help */
export function HelpIcon() {
  return (
    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-text-muted/40 text-text-muted text-[9px] leading-none ml-1 cursor-help">
      ?
    </span>
  );
}
