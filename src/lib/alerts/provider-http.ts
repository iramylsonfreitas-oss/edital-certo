import { Webhook } from "svix";
import type { EmailMessageRpc } from "./persisted.ts";

const safeHeaders = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };
export async function limitedBody(request: Request, max = 65_536): Promise<string> {
  if (Number(request.headers.get("content-length")) > max) throw new Error("BODY_TOO_LARGE");
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0; let raw = "";
  try {
    while (true) { const part = await reader.read(); if (part.done) break;
      bytes += part.value.byteLength;
      if (bytes > max) throw new Error("BODY_TOO_LARGE");
      raw += decoder.decode(part.value, { stream: true });
    }
    return raw + decoder.decode();
  } catch { await reader.cancel(); throw new Error("BODY_INVALID"); }
  finally { reader.releaseLock(); }
}
async function sha(value: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map((v) => v.toString(16).padStart(2,"0")).join("");
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function handleProviderWebhook(request: Request, options: { client: EmailMessageRpc; secret: string; expectedFrom: string }) {
  if (request.method !== "POST") return new Response(null, { status: 405, headers: safeHeaders });
  let raw: string; let event: Record<string, unknown>; const eventId = request.headers.get("svix-id") ?? "";
  try {
    raw = await limitedBody(request);
    new Webhook(options.secret).verify(raw, {
      "svix-id": eventId, "svix-timestamp": request.headers.get("svix-timestamp") ?? "",
      "svix-signature": request.headers.get("svix-signature") ?? "",
    });
    event = JSON.parse(raw) as Record<string, unknown>;
    if (!event || typeof event !== "object" || Array.isArray(event)) throw new Error("EVENT_INVALID");
  } catch { return new Response(null, { status: 400, headers: safeHeaders }); }
  const kinds = new Set(["email.sent","email.delivered","email.bounced","email.complained","email.failed","email.suppressed"]);
  if (typeof event.type !== "string" || !kinds.has(event.type)) return new Response(null, { status: 204, headers: safeHeaders });
  const data = event.data as { email_id?: unknown; from?: unknown; to?: unknown; tags?: Record<string, unknown> } | undefined;
  if (data?.from !== options.expectedFrom) return new Response(null, { status: 204, headers: safeHeaders });
  if (typeof data.email_id !== "string" || !uuid.test(data.email_id) || !Array.isArray(data.to) || data.to.length !== 1
    || typeof data.to[0] !== "string" || typeof event.created_at !== "string" || !Number.isFinite(Date.parse(event.created_at))) {
    return new Response(null, { status: 400, headers: safeHeaders });
  }
  const tag = data.tags?.edital_message_id;
  if (tag !== undefined && (typeof tag !== "string" || !uuid.test(tag))) return new Response(null, { status: 400, headers: safeHeaders });
  try {
    const result = await options.client.rpc("record_email_provider_event", {
      p_event_id: eventId, p_provider_id: data.email_id, p_message_id: tag ?? null,
      p_kind: event.type.slice(6), p_occurred_at: event.created_at, p_body_hash: await sha(raw),
      p_from_hash: await sha(options.expectedFrom.toLowerCase()), p_to_hash: await sha(data.to[0].toLowerCase()),
    });
    if (result.error || !["processed","duplicate"].includes(result.data as string)) return new Response(null, { status: 503, headers: safeHeaders });
    return new Response(null, { status: 204, headers: safeHeaders });
  } catch { return new Response(null, { status: 503, headers: safeHeaders }); }
}

export async function handleUnsubscribe(request: Request, client: EmailMessageRpc | null) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) return new Response("Link inválido.", { status: 400, headers: safeHeaders });
  if (request.method === "GET") {
    // Link scanners cannot unsubscribe a user. GET only presents confirmation.
    const html = '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cancelar alertas | Edital Certo</title><body style="font:18px/1.6 system-ui;max-width:600px;margin:48px auto;padding:20px"><h1>Cancelar alertas por e-mail</h1><p>Confirme para pausar todos os seus alertas de e-mail no Edital Certo.</p><form method="post" action="/email/unsubscribe?token=' + token + '"><button type="submit" name="confirm" value="yes" style="padding:14px 20px">Confirmar cancelamento</button></form></body></html>';
    return new Response(html, { headers: { ...safeHeaders, "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'" } });
  }
  if (request.method !== "POST") return new Response(null, { status: 405, headers: safeHeaders });
  if (!client) return new Response("Serviço indisponível.", { status: 503, headers: safeHeaders });
  try {
    const body = new URLSearchParams(await limitedBody(request, 1024));
    if (body.get("List-Unsubscribe") !== "One-Click" && body.get("confirm") !== "yes") return new Response(null, { status: 400, headers: safeHeaders });
    const result = await client.rpc("unsubscribe_email_token", { p_token: token });
    if (result.error) return new Response(null, { status: 503, headers: safeHeaders });
    if (result.data !== true) return new Response("Link inválido.", { status: 400, headers: safeHeaders });
    return new Response(body.has("List-Unsubscribe") ? "" : "Alertas por e-mail cancelados.", { headers: safeHeaders });
  } catch { return new Response(null, { status: 503, headers: safeHeaders }); }
}
