export interface TelegramSendResult {
  ok: boolean;
  error?: string;
  chatId?: string;
}

export function telegramConfigured(): boolean {
  return Boolean(
    typeof process !== "undefined" &&
      process.env &&
      (process.env.NEXT_PUBLIC_TELEGRAM_ENABLED === "true" || process.env.TELEGRAM_BOT_TOKEN)
  );
}

export async function sendTelegram(text: string, html = false, chatId?: string): Promise<TelegramSendResult> {
  try {
    const resp = await fetch("/api/telegram/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, html, chatId })
    });
    const json = await resp.json().catch(() => ({}));
    return { ok: Boolean(json.ok), error: json.error, chatId: json.chatId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "network error" };
  }
}
