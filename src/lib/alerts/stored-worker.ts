import { composeDigest, type DigestOpportunity } from "./digest";
import type { EmailPayload, ProviderOutcome } from "./delivery";
import { claimStoredMessage, finishStoredAttempt, stageEmailMessage, validateStoredClaim,
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
