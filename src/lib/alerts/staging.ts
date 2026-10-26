import type { EmailMessageRpc } from "./persisted.ts";
import { prepareStoredDigestBatch } from "./stored-worker.ts";

export const stagingProjectUrl = "https://afbuozouupuguvkkuvib.supabase.co";
export const stagingSender = "preview@edital-certo.invalid";

// Persist previews only. No claims, simulated acceptances, provider calls or send credentials.
export async function runStagingBatch(client: EmailMessageRpc, clock: () => number = Date.now) {
  const started = clock();
  if (!Number.isFinite(started)) throw new Error("EMAIL_STAGING_CLOCK_INVALID");
  let staged = 0;
  while (staged < 5) {
    const now = clock();
    if (!Number.isFinite(now) || now < started) throw new Error("EMAIL_STAGING_CLOCK_INVALID");
    if (now - started >= 45_000) break;
    const result = await prepareStoredDigestBatch(client, { from: stagingSender, limit: 1, now: new Date(now) });
    if (result.stopped === "error") throw new Error("EMAIL_STAGING_PREPARATION_FAILED");
    if (result.stopped === "empty") return { staged, exhausted: true };
    staged += result.prepared;
  }
  return { staged, exhausted: false };
}
