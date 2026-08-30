import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const TELEGRAM_API = "https://api.telegram.org/bot";

export async function POST(req: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  let chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    return NextResponse.json({ ok: false, error: "TELEGRAM_BOT_TOKEN not configured" }, { status: 500 });
  }

  let body: { text?: string; chatId?: string; html?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  if (body.chatId) chatId = body.chatId;
  if (!chatId) {
    const resolved = await resolveChatId(token);
    if (resolved) chatId = resolved;
  }

  const text = body.text;
  if (!text) {
    return NextResponse.json({ ok: false, error: "no text" }, { status: 400 });
  }
  if (!chatId) {
    return NextResponse.json({ ok: false, error: "no chat id resolved — message the bot first" }, { status: 400 });
  }

  const url = `${TELEGRAM_API}${token}/sendMessage`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: body.html ? "HTML" : undefined,
      disable_web_page_preview: true
    })
  });

  const json = await resp.json().catch(() => ({}));
  if (!resp.ok || json.ok === false) {
    return NextResponse.json({ ok: false, error: "telegram error", details: json?.description }, { status: 502 });
  }
  return NextResponse.json({ ok: true, chatId });
}

async function resolveChatId(token: string): Promise<string | null> {
  try {
    const url = `${TELEGRAM_API}${token}/getUpdates`;
    const resp = await fetch(url, { cache: "no-store" });
    const json = await resp.json();
    if (!json.ok) return null;
    for (const u of json.result ?? []) {
      if (u.message?.chat?.id) return String(u.message.chat.id);
    }
    return null;
  } catch {
    return null;
  }
}

export async function GET() {
  const configured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return NextResponse.json({ ok: configured, configured });
}
