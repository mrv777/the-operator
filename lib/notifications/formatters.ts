// Format structured agent events into readable Telegram messages.

export function formatSignalAlert(
  symbol: string,
  tokenAddress: string,
  score: number,
  walletCount: number,
  volumeUsd: number,
  isContested: boolean,
): string {
  const contestedTag = isContested ? " ⚠️ CONTESTED" : "";
  const vol = volumeUsd >= 1000
    ? `$${(volumeUsd / 1000).toFixed(1)}K`
    : `$${volumeUsd.toFixed(0)}`;
  return [
    `🔔 <b>New Signal:</b> ${esc(symbol)}${contestedTag}`,
    `Score: ${score} | Wallets: ${walletCount} | Volume: ${vol}`,
    `<code>${tokenAddress}</code>`,
  ].join("\n");
}

export function formatTradeAlert(
  symbol: string,
  direction: "BUY" | "SELL",
  amountUsd: number,
  txHash: string | null,
): string {
  const icon = direction === "BUY" ? "✅" : "📤";
  const txLink = txHash
    ? `\n<a href="https://solscan.io/tx/${txHash}">View tx</a>`
    : "";
  return [
    `${icon} <b>${direction} FILLED:</b> ${esc(symbol)} — $${amountUsd.toFixed(2)}`,
    txLink,
  ].join("");
}

export function formatExitAlert(
  symbol: string,
  exitReason: string,
  pnlUsd: number,
  pnlPct: number,
  txHash: string | null,
): string {
  const pnlSign = pnlUsd >= 0 ? "+" : "";
  const icon = pnlUsd >= 0 ? "💰" : "📉";
  const txLink = txHash
    ? `\n<a href="https://solscan.io/tx/${txHash}">View tx</a>`
    : "";
  return [
    `${icon} <b>EXIT:</b> ${esc(symbol)} — ${exitReason}`,
    `P&L: ${pnlSign}$${pnlUsd.toFixed(2)} (${pnlSign}${pnlPct.toFixed(1)}%)`,
    txLink,
  ].join("\n");
}

export function formatSecurityAlert(
  symbol: string,
  tokenAddress: string,
  reasons: string[],
): string {
  return [
    `🛡️ <b>Security BLOCKED:</b> ${esc(symbol)}`,
    `<code>${tokenAddress}</code>`,
    `Reasons: ${reasons.join(", ")}`,
  ].join("\n");
}

export function formatExecutionFailedAlert(
  symbol: string,
  reason: string,
): string {
  return `⚠️ <b>Execution failed:</b> ${esc(symbol)} — ${esc(reason)}`;
}

/** Escape HTML special chars for Telegram HTML parse mode */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
