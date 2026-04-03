// Telegram Bot API — send alerts for signals, trades, and exits.
// Entirely optional: silently skips if TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set.
// Never throws — notification failures must never interrupt the agent loop.

import { logger } from "@/lib/utils/logger";

const API_BASE = "https://api.telegram.org/bot";

/**
 * Send a Telegram message. Silently no-ops if unconfigured.
 */
export async function sendTelegramAlert(
  message: string,
  parseMode: "HTML" | "Markdown" = "HTML",
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) return;

  try {
    const res = await fetch(`${API_BASE}${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: parseMode,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(5_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      logger.warn(`Telegram send failed: HTTP ${res.status}`, { body });
    }
  } catch (err) {
    logger.warn(`Telegram notification error`, {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
