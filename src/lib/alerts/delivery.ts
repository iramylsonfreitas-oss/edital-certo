export interface EmailPayload { from: string; to: string; subject: string; html: string; text: string }
export type DeliveryStatus = "pending" | "retry" | "accepted" | "failed" | "uncertain" | "canceled";
export interface DeliveryState {
  id: string; payload: Readonly<EmailPayload>; payloadHash: string; status: DeliveryStatus;
  attempts: number; firstAttemptAt: string | null; nextAttemptAt: string | null;
  hadUnknownOutcome: boolean; providerId: string | null;
}
export type ProviderOutcome = { kind: "accepted"; id: string } | { kind: "rejected"; status: number; errorCode?: string } | { kind: "unknown" };
export interface EmailTransport { send(payload: Readonly<EmailPayload>, idempotencyKey: string): Promise<ProviderOutcome> }

async function hash(payload: Readonly<EmailPayload>): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([payload.from, payload.to, payload.subject, payload.html, payload.text]));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
export async function freezeDelivery(id: string, payload: EmailPayload): Promise<DeliveryState> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || /[\r\n]/.test(payload.from + payload.to + payload.subject) || !payload.from.includes("@") || !payload.to.includes("@")) throw new Error("Mensagem inválida.");
  const frozen = Object.freeze({ ...payload });
  return { id, payload: frozen, payloadHash: await hash(frozen), status: "pending", attempts: 0, firstAttemptAt: null, nextAttemptAt: null, hadUnknownOutcome: false, providerId: null };
}

// Transport is injected. This module contains no HTTP calls, credentials or live adapter.
// The caller must persist state atomically and reserve an exclusive lease before use.
export async function attemptDelivery(state: DeliveryState, transport: EmailTransport, eligible: boolean, now: Date): Promise<DeliveryState> {
  if (["accepted", "failed", "uncertain", "canceled"].includes(state.status)) return state;
  if (!Number.isFinite(now.getTime())) throw new Error("Horário inválido.");
  if (!Number.isInteger(state.attempts) || state.attempts < 0 || state.attempts > 0 && !state.firstAttemptAt) throw new Error("Histórico de tentativas inválido.");
  if (!eligible) return { ...state, status: "canceled", nextAttemptAt: null };
  if (await hash(state.payload) !== state.payloadHash) return { ...state, status: state.hadUnknownOutcome ? "uncertain" : "failed", nextAttemptAt: null };
  if (state.nextAttemptAt && Date.parse(state.nextAttemptAt) > now.getTime()) return state;
  const first = state.firstAttemptAt ? Date.parse(state.firstAttemptAt) : now.getTime();
  if (!Number.isFinite(first) || first > now.getTime()) throw new Error("Histórico de tentativas inválido.");
  // Stop before the provider's 24-hour idempotency retention can expire.
  if (now.getTime() - first >= 23 * 60 * 60 * 1000 || state.attempts >= 5) return { ...state, status: state.hadUnknownOutcome ? "uncertain" : "failed", nextAttemptAt: null };
  let outcome: ProviderOutcome;
  try { outcome = await transport.send(state.payload, `edital-certo/${state.id}`); } catch { outcome = { kind: "unknown" }; }
  const updated = { ...state, attempts: state.attempts + 1, firstAttemptAt: state.firstAttemptAt ?? now.toISOString() };
  if (outcome.kind === "accepted" && outcome.id) return { ...updated, status: "accepted", providerId: outcome.id, nextAttemptAt: null };
  const unknown = outcome.kind === "unknown" || outcome.kind === "accepted";
  const conflict = outcome.kind === "rejected" && outcome.status === 409 && outcome.errorCode !== "concurrent_idempotent_requests";
  const hadUnknownOutcome = state.hadUnknownOutcome || unknown || conflict;
  const retryable = unknown || outcome.kind === "rejected" && (outcome.status === 429 || outcome.status >= 500 || outcome.status === 409 && outcome.errorCode === "concurrent_idempotent_requests");
  if (!retryable || updated.attempts >= 5) return { ...updated, hadUnknownOutcome, status: hadUnknownOutcome ? "uncertain" : "failed", nextAttemptAt: null };
  const next = now.getTime() + 60_000 * 2 ** (updated.attempts - 1);
  return { ...updated, hadUnknownOutcome, status: "retry", nextAttemptAt: new Date(next).toISOString() };
}
