import { composeDigest, type DigestOpportunity } from "./digest.ts";
import { cancelUnattemptedMessage, claimStoredMessage, finishStoredAttempt, freezeReservedMessage,
  type EmailMessageRpc } from "./persisted.ts";
import { storedProviderOutcome } from "./stored-worker.ts";
import { createResendTransport, emailAppOrigin, emailDevelopmentUrl, isEmailAddress, unsubscribeToken } from "./resend-transport.ts";

async function rpc(client: EmailMessageRpc, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try { const result = await client.rpc(name, args); if (result.error) throw new Error(); return result.data; }
  catch { throw new Error("EMAIL_PROVIDER_RPC_FAILED:" + name); }
}
export interface EmailProviderConfig {
  enabled: boolean; projectUrl: string; apiKey: string; from: string; recipients: readonly string[]; webhookSecret: string;
}
export function providerReady(config: EmailProviderConfig): boolean {
  return config.enabled && config.projectUrl === emailDevelopmentUrl && /^re_[A-Za-z0-9_-]+$/.test(config.apiKey)
    && isEmailAddress(config.from) && config.recipients.length > 0 && config.recipients.length <= 10
    && config.recipients.every(isEmailAddress) && /^whsec_[A-Za-z0-9+/=_-]+$/.test(config.webhookSecret);
}

// This is deliberately separate from preview staging: old .invalid previews cannot be sent.
export async function stageProviderDigest(client: EmailMessageRpc, config: EmailProviderConfig, now = new Date()) {
  if (!providerReady(config)) return "disabled";
  const selected = await rpc(client, "reserve_next_email_delivery_digest", { p_recipients: [...config.recipients] });
  if (selected === null) return "idle";
  const row = selected as { message_id: string; to: string; items: { opportunity: DigestOpportunity }[] };
  if (!row || !/^[a-f0-9-]{36}$/i.test(row.message_id)) throw new Error("EMAIL_PROVIDER_SELECTION_INVALID");
  try {
    if (!config.recipients.map((value) => value.toLowerCase()).includes(row.to.toLowerCase())) {
      await cancelUnattemptedMessage(client, row.message_id); return "not_allowlisted";
    }
    const digest = composeDigest(row.items.map((item) => item.opportunity), now);
    if (digest.count !== row.items.length) throw new Error("EMAIL_PROVIDER_ITEMS_INVALID");
    const token = await rpc(client, "create_email_unsubscribe_token", { p_message_id: row.message_id });
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/.test(token)) throw new Error("EMAIL_PROVIDER_TOKEN_INVALID");
    const url = emailAppOrigin + "/email/unsubscribe?token=" + token;
    await freezeReservedMessage(client, row.message_id, { from: config.from, to: row.to, subject: digest.subject,
      html: digest.html.replace("</body>", '<p><a href="' + url + '">Cancelar meus alertas por e-mail</a></p></body>'),
      text: digest.text + "\nCancelar meus alertas por e-mail: " + url,
    });
    return "prepared";
  } catch {
    await cancelUnattemptedMessage(client, row.message_id);
    throw new Error("EMAIL_PROVIDER_PREPARATION_FAILED");
  }
}

export async function deliverProviderMessage(client: EmailMessageRpc, config: EmailProviderConfig, fetcher?: typeof fetch) {
  if (!providerReady(config)) return "disabled";
  const transport = createResendTransport({ apiKey: config.apiKey, from: config.from, allowedRecipients: config.recipients, fetcher });
  const id = await rpc(client, "select_email_delivery_candidate", { p_from: config.from, p_recipients: [...config.recipients] });
  if (id === null) return "idle";
  if (typeof id !== "string") throw new Error("EMAIL_PROVIDER_SELECTION_INVALID");
  const claim = await claimStoredMessage(client, id);
  if (!claim) return "idle";
  const token = unsubscribeToken(claim.payload);
  const valid = await rpc(client, "validate_email_delivery_claim", {
    p_message_id: id, p_claim_token: claim.token, p_from: config.from, p_token: token,
  });
  if (valid !== true) { await finishStoredAttempt(client, claim, "permanent"); return "ineligible"; }
  // A recording failure propagates: never call the provider twice in this execution.
  const observed = await transport.send(claim.payload, claim.idempotencyKey);
  const outcome = storedProviderOutcome(observed);
  return finishStoredAttempt(client, claim, outcome.outcome, outcome.providerId);
}
