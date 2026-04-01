import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { SidebarNav } from "@/components/SidebarNav";
import { AuthShell } from "@/components/AuthShell";

export const metadata: Metadata = {
  title: "The Operator",
  description: "Autonomous Smart Money Convergence Trading Agent",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-bg-primary text-text-primary min-h-screen antialiased font-sans">
        <AuthShell>
          <div className="flex min-h-screen">
            {/* Sidebar */}
            <aside className="w-56 bg-bg-sidebar border-r border-border flex flex-col shrink-0">
              <div className="p-4 border-b border-border">
                <Link href="/" className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-signal flex items-center justify-center text-sm font-bold">
                    O
                  </div>
                  <div>
                    <h1 className="text-sm font-semibold leading-tight">The Operator</h1>
                    <p className="text-[10px] text-text-muted">SM Convergence Agent</p>
                  </div>
                </Link>
              </div>
              <SidebarNav />
            </aside>

            {/* Main content */}
            <main className="flex-1 overflow-auto">
              <div className="max-w-[1400px] mx-auto p-6">
                {children}
              </div>
            </main>
          </div>
        </AuthShell>
      </body>
    </html>
  );
}
