import { freezeDelivery, type EmailPayload } from "./delivery";

// Inject a server-side service-role client. No client, credential or transport is created here.
export interface EmailMessageRpc {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
}
export interface StoredClaim {
  readonly messageId: string;
  readonly token: string;
  readonly payloadBytes: string;
  readonly payloadHash: string;
  readonly idempotencyKey: string;
  readonly payload: Readonly<EmailPayload>;
}
export type StoredOutcome = "accepted" | "retryable" | "permanent" | "unknown" | "conflict";
export type StoredCompletion = "accepted" | "retry" | "failed" | "uncertain";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
function requireId(value: string): void {
  if (!uuid.test(value)) throw new Error("EMAIL_MESSAGE_ID_INVALID");
}
function serialize(payload: Readonly<EmailPayload>): string {
  return JSON.stringify([payload.from, payload.to, payload.subject, payload.html, payload.text]);
}
async function hashBytes(bytes: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(bytes)))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
}
async function call(client: EmailMessageRpc, name: string, args: Record<string, unknown>): Promise<unknown> {
  // Do not attach provider/database errors: they may contain addresses or message bodies.
  try {
    const result = await client.rpc(name, args);
    if (result.error) throw new Error("RPC");
    return result.data;
  } catch {
    throw new Error("EMAIL_MESSAGE_RPC_FAILED:" + name);
  }
}
export async function cancelUnattemptedMessage(client: EmailMessageRpc, messageId: string): Promise<boolean> {
  requireId(messageId);
  const result = await call(client, "cancel_unattempted_email_message", { p_message_id: messageId });
  if (typeof result !== "boolean") throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  return result;
}

// Reserve once. Never retry a reservation automatically after an ambiguous database response.
export async function stageEmailMessage(client: EmailMessageRpc, queueIds: readonly string[], payload: EmailPayload): Promise<string> {
  if (queueIds.length < 1 || queueIds.length > 20 || new Set(queueIds).size !== queueIds.length) {
    throw new Error("EMAIL_MESSAGE_ITEMS_INVALID");
  }
  const items = [...queueIds];
  items.forEach(requireId);
  // Snapshot and validate before awaiting the database; caller mutations cannot change this message.
  const snapshot = await freezeDelivery(items[0], payload);
  const bytes = serialize(snapshot.payload);
  if (encoder.encode(bytes).byteLength > 120000) throw new Error("EMAIL_MESSAGE_PAYLOAD_TOO_LARGE");
  const id = await call(client, "reserve_email_message", { p_queue_ids: items });
  if (typeof id !== "string" || !uuid.test(id)) throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  return freezeReservedMessage(client, id, snapshot.payload);
}

export async function freezeReservedMessage(client: EmailMessageRpc, id: string, payload: EmailPayload): Promise<string> {
  requireId(id);
  try {
    const snapshot = await freezeDelivery(id, payload);
    const bytes = serialize(snapshot.payload);
    if (encoder.encode(bytes).byteLength > 120000) throw new Error("EMAIL_MESSAGE_PAYLOAD_TOO_LARGE");
    const hash = await call(client, "freeze_email_message", { p_message_id: id, p_payload_bytes: bytes });
    if (hash !== snapshot.payloadHash) throw new Error("EMAIL_MESSAGE_HASH_MISMATCH");
    return id;
  } catch (error) {
    // A concurrent claimant may have started after freezing; the RPC refuses to cancel attempted messages.
    // Even a cleanup failure must never cause another reservation or an automatic send.
    await cancelUnattemptedMessage(client, id);
    throw error;
  }
}

export async function claimStoredMessage(client: EmailMessageRpc, messageId: string): Promise<StoredClaim | null> {
  requireId(messageId);
  const result = await call(client, "claim_email_message", { p_message_id: messageId });
  if (result === null) return null; // Busy, terminal, no longer eligible or not yet due.
  if (!result || typeof result !== "object") throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  const row = result as Record<string, unknown>;
  if (row.message_id !== messageId || typeof row.claim_token !== "string" || !uuid.test(row.claim_token)
    || typeof row.payload_bytes !== "string" || encoder.encode(row.payload_bytes).byteLength > 120000
    || typeof row.payload_hash !== "string" || row.idempotency_key !== "edital-certo/" + messageId) {
    throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  }
  if (await hashBytes(row.payload_bytes) !== row.payload_hash) throw new Error("EMAIL_MESSAGE_HASH_MISMATCH");
  let fields: unknown;
  try { fields = JSON.parse(row.payload_bytes); } catch { throw new Error("EMAIL_MESSAGE_PAYLOAD_INVALID"); }
  if (!Array.isArray(fields) || fields.length !== 5 || fields.some((field) => typeof field !== "string")) {
    throw new Error("EMAIL_MESSAGE_PAYLOAD_INVALID");
  }
  const payload: EmailPayload = { from: fields[0], to: fields[1], subject: fields[2], html: fields[3], text: fields[4] };
  const validated = await freezeDelivery(messageId, payload);
  return Object.freeze({
    messageId, token: row.claim_token, payloadBytes: row.payload_bytes, payloadHash: row.payload_hash,
    idempotencyKey: row.idempotency_key, payload: validated.payload,
  });
}

// This records an already-observed result. A failed completion must not invoke the transport again.
export async function finishStoredAttempt(client: EmailMessageRpc, claim: StoredClaim, outcome: StoredOutcome, providerId?: string): Promise<StoredCompletion> {
  requireId(claim.messageId);
  requireId(claim.token);
  if (!["accepted", "retryable", "permanent", "unknown", "conflict"].includes(outcome)
    || outcome === "accepted" && !providerId?.trim()) throw new Error("EMAIL_MESSAGE_OUTCOME_INVALID");
  const result = await call(client, "finish_email_message_attempt", {
    p_message_id: claim.messageId, p_claim_token: claim.token, p_outcome: outcome, p_provider_id: providerId ?? null,
  });
  if (result !== "accepted" && result !== "retry" && result !== "failed" && result !== "uncertain") {
    throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  }
  return result;
}

export async function validateStoredClaim(client: EmailMessageRpc, claim: StoredClaim): Promise<boolean> {
  const result = await call(client, "validate_email_message_claim", {
    p_message_id: claim.messageId, p_claim_token: claim.token,
  });
  if (typeof result !== "boolean") throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  return result;
}
