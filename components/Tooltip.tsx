"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: number;
}

interface Position {
  top: number;
  left: number;
  above: boolean;
}

export function Tooltip({ content, children, maxWidth = 260 }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const calcPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const above = rect.top > 120;

    let left = rect.left + rect.width / 2;
    // Clamp so tooltip doesn't overflow viewport edges
    const halfWidth = maxWidth / 2;
    left = Math.max(halfWidth + 8, Math.min(left, window.innerWidth - halfWidth - 8));

    setPos({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left,
      above,
    });
  }, [maxWidth]);

  const show = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      calcPosition();
      setOpen(true);
    }, 200);
  }, [calcPosition]);

  const hide = useCallback(() => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setOpen(false), 100);
  }, []);

  // Reposition on scroll/resize while open
  useEffect(() => {
    if (!open) return;
    const reposition = () => calcPosition();
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, calcPosition]);

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
    >
      {children}
      {open && pos && createPortal(
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.above ? pos.top : pos.top,
            left: pos.left,
            transform: pos.above
              ? "translate(-50%, -100%)"
              : "translate(-50%, 0)",
            maxWidth,
            zIndex: 9999,
          }}
          className="px-3 py-2 text-xs leading-relaxed text-text-primary bg-bg-card border border-border-light rounded-lg shadow-lg shadow-black/40 whitespace-normal pointer-events-none"
        >
          {content}
        </div>,
        document.body,
      )}
    </span>
  );
}

export function HelpIcon() {
  return (
    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-text-muted/40 text-text-muted text-[9px] leading-none ml-1 cursor-help">
      ?
    </span>
  );
}
