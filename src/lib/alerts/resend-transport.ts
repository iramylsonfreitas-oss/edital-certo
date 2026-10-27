import type { EmailPayload, EmailTransport, ProviderOutcome } from "./delivery.ts";

export const emailAppOrigin = "https://edital-certo-six.vercel.app";
export const emailDevelopmentUrl = "https://afbuozouupuguvkkuvib.supabase.co";
const uuid = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
export const isEmailAddress = (value: string) => /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i.test(value)
  && !/@(?:.*\.)?(?:invalid|test|example|localhost)$/i.test(value) && !/@(?:.*\.)?example\.(?:com|net|org)$/i.test(value);

export function unsubscribeToken(payload: Readonly<EmailPayload>): string {
  const prefix = emailAppOrigin + "/email/unsubscribe?token=";
  const matches = [...payload.text.matchAll(/https:\/\/[^\s<>]+/g)].map(([url]) => url).filter((url) => url.startsWith(prefix));
  if (matches.length !== 1) throw new Error("EMAIL_UNSUBSCRIBE_LINK_REQUIRED");
  const token = matches[0].slice(prefix.length);
  if (!/^[a-f0-9]{64}$/.test(token) || !payload.html.includes('href="' + prefix + token + '"')) {
    throw new Error("EMAIL_UNSUBSCRIBE_LINK_REQUIRED");
  }
  return token;
}

// No default configuration, implicit retries, arbitrary host, CC or BCC.
export function createResendTransport(options: {
  apiKey: string; from: string; allowedRecipients: readonly string[]; fetcher?: typeof fetch;
}): EmailTransport {
  if (!/^re_[A-Za-z0-9_-]+$/.test(options.apiKey) || !isEmailAddress(options.from)
    || options.allowedRecipients.length < 1 || options.allowedRecipients.length > 10
    || options.allowedRecipients.some((address) => !isEmailAddress(address))) throw new Error("EMAIL_PROVIDER_CONFIG_INVALID");
  const from = options.from;
  const allowed = new Set(options.allowedRecipients.map((value) => value.toLowerCase()));
  const fetcher = options.fetcher ?? fetch;
  return {
    async send(payload, key): Promise<ProviderOutcome> {
      const id = new RegExp("^edital-certo/(" + uuid + ")$", "i").exec(key)?.[1];
      if (!id || payload.from !== from || !allowed.has(payload.to.toLowerCase()) || !isEmailAddress(payload.to)
        || /[\r\n]/.test(payload.subject) || new TextEncoder().encode(payload.html + payload.text).length > 120_000) {
        throw new Error("EMAIL_PROVIDER_POLICY_REJECTED");
      }
      const token = unsubscribeToken(payload);
      const url = emailAppOrigin + "/email/unsubscribe?token=" + token;
      const body = JSON.stringify({ from: payload.from, to: [payload.to], subject: payload.subject,
        html: payload.html, text: payload.text,
        headers: { "List-Unsubscribe": "<" + url + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
        tags: [{ name: "edital_message_id", value: id }],
      });
      try {
        const response = await fetcher("https://api.resend.com/emails", {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
          headers: { Authorization: "Bearer " + options.apiKey, "Content-Type": "application/json", "Idempotency-Key": key }, body,
        });
        const raw = await response.text();
        if (raw.length > 32_000) return { kind: "unknown" };
        let data: { id?: unknown; name?: unknown } = {};
        try { data = JSON.parse(raw); } catch { /* An HTTP error remains usable without its body. */ }
        if (response.ok) return typeof data?.id === "string" && new RegExp("^" + uuid + "$", "i").test(data.id)
          ? { kind: "accepted", id: data.id } : { kind: "unknown" };
        return { kind: "rejected", status: response.status,
          ...(data?.name === "concurrent_idempotent_requests" ? { errorCode: "concurrent_idempotent_requests" } : {}) };
      } catch { return { kind: "unknown" }; }
    },
  };
}
