import type { Metadata } from "next";
import "./globals.css";

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
      <body className="bg-[#0A0A0F] text-white min-h-screen antialiased">
        {children}
      </body>
    </html>
  );
}
