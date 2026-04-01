"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Radio,
  ArrowLeftRight,
  Briefcase,
  TrendingUp,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/signals", label: "Signals", icon: Radio },
  { href: "/trades", label: "Trades", icon: ArrowLeftRight },
  { href: "/positions", label: "Positions", icon: Briefcase },
  { href: "/portfolio", label: "Portfolio", icon: TrendingUp },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex-1 py-3 px-2 space-y-0.5">
      {links.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors",
              active
                ? "bg-signal/10 text-signal font-medium"
                : "text-text-secondary hover:text-text-primary hover:bg-bg-card",
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
