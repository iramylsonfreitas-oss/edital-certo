import { composeDigest, type DigestOpportunity } from "./digest";
import type { EmailPayload, ProviderOutcome } from "./delivery";
import { claimStoredMessage, finishStoredAttempt, stageEmailMessage, validateStoredClaim, freezeReservedMessage, cancelUnattemptedMessage,
  type EmailMessageRpc, type StoredCompletion, type StoredOutcome } from "./persisted";

export interface DigestQueueItem { queueId: string; opportunity: DigestOpportunity }

// Selection is server-owned. SQL rechecks all queue IDs, recipient and versions at reservation/freeze.
export async function stageStoredDigest(client: EmailMessageRpc, items: readonly DigestQueueItem[],
  addresses: Pick<EmailPayload, "from" | "to">, now: Date): Promise<string> {
  if (items.length < 1 || items.length > 20 || new Set(items.map((item) => item.opportunity.id)).size !== items.length) {
    throw new Error("EMAIL_DIGEST_ITEMS_INVALID");
  }
  const content = composeDigest(items.map((item) => item.opportunity), now);
  // composeDigest omits stale/invalid rows: never reserve queue IDs omitted from the actual digest.
  if (content.count !== items.length) throw new Error("EMAIL_DIGEST_ITEMS_INVALID");
  return stageEmailMessage(client, items.map((item) => item.queueId), { ...addresses, ...content });
}

export function storedProviderOutcome(outcome: ProviderOutcome): { outcome: StoredOutcome; providerId?: string } {
  if (outcome.kind === "accepted") return outcome.id?.trim()
    ? { outcome: "accepted", providerId: outcome.id } : { outcome: "unknown" };
  if (outcome.kind === "unknown") return { outcome: "unknown" };
  if (!Number.isInteger(outcome.status) || outcome.status < 400 || outcome.status > 599) return { outcome: "unknown" };
  if (outcome.status === 409 && outcome.errorCode !== "concurrent_idempotent_requests") return { outcome: "conflict" };
  return { outcome: outcome.status === 429 || outcome.status >= 500 || outcome.status === 409 ? "retryable" : "permanent" };
}

// Simulation only: no callback, HTTP adapter, provider credential, environment switch or live sender.
// Acceptance marks the queue sent, so the entrypoint is restricted to disposable local DB tests.
export async function simulateStoredAttempt(client: EmailMessageRpc, messageId: string,
  observed: ProviderOutcome): Promise<StoredCompletion | "idle" | "ineligible"> {
  const claim = await claimStoredMessage(client, messageId);
  if (!claim) return "idle";
  if (!await validateStoredClaim(client, claim)) {
    await finishStoredAttempt(client, claim, "permanent");
    return "ineligible";
  }
  const result = storedProviderOutcome(observed);
  // Completion failure propagates. No new claim, reservation or simulated attempt is made.
  return finishStoredAttempt(client, claim, result.outcome, result.providerId);
}

async function workerRpc(client: EmailMessageRpc, name: string): Promise<unknown> {
  try {
    const result = await client.rpc(name, {});
    if (result.error) throw new Error("RPC");
    return result.data;
  } catch { throw new Error("EMAIL_MESSAGE_RPC_FAILED:" + name); }
}

// Recover expired unattempted drafts, then select/reserve current queue items in one SQL transaction.
export async function stageNextStoredDigest(client: EmailMessageRpc, from: string, now: Date): Promise<string | null> {
  if (!Number.isFinite(now.getTime()) || /[\r\n]/.test(from) || !from.includes("@")) throw new Error("EMAIL_DIGEST_INPUT_INVALID");
  const recovered = await workerRpc(client, "recover_email_message_drafts");
  if (!Number.isInteger(recovered) || (recovered as number) < 0 || (recovered as number) > 20) throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  const selected = await workerRpc(client, "reserve_next_email_digest");
  if (selected === null) return null;
  if (!selected || typeof selected !== "object") throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  const row = selected as { message_id?: unknown; to?: unknown; items?: unknown };
  if (typeof row.message_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.message_id)) {
    throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
  }
  try {
    if (typeof row.to !== "string" || !Array.isArray(row.items) || row.items.length < 1 || row.items.length > 20) throw new Error("EMAIL_MESSAGE_RESPONSE_INVALID");
    const items = row.items as DigestQueueItem[];
    if (new Set(items.map((item) => item.opportunity.id)).size !== items.length) throw new Error("EMAIL_DIGEST_ITEMS_INVALID");
    const content = composeDigest(items.map((item) => item.opportunity), now);
    if (content.count !== items.length) throw new Error("EMAIL_DIGEST_ITEMS_INVALID");
    return await freezeReservedMessage(client, row.message_id, { from, to: row.to, ...content });
  } catch {
    // Safe only before a first attempt; SQL refuses to release an attempted message.
    await cancelUnattemptedMessage(client, row.message_id);
    throw new Error("EMAIL_DIGEST_STAGE_FAILED");
  }
}

export interface DigestPreparationReport {
  prepared: number;
  stopped: "limit" | "empty" | "error";
}

// Preparation only. Never claims attempts, simulates acceptance or calls a provider.
// Stop at the first ambiguous failure; the next execution uses database recovery.
// Counters deliberately exclude message IDs, addresses and exception details.
export async function prepareStoredDigestBatch(client: EmailMessageRpc,
  options: { from: string; limit: number; now: Date }): Promise<DigestPreparationReport> {
  if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 5
    || !Number.isFinite(options.now.getTime()) || /[\r\n]/.test(options.from) || !options.from.includes("@")) {
    throw new Error("EMAIL_DIGEST_BATCH_INPUT_INVALID");
  }
  let prepared = 0;
  while (prepared < options.limit) {
    try {
      if (await stageNextStoredDigest(client, options.from, options.now) === null) {
        return { prepared, stopped: "empty" };
      }
      prepared++;
    } catch {
      return { prepared, stopped: "error" };
    }
  }
  return { prepared, stopped: "limit" };
}
