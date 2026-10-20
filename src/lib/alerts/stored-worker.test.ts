import { describe, expect, it, vi } from "vitest";
import { stageStoredDigest, storedProviderOutcome, simulateStoredAttempt } from "./stored-worker";
import { freezeDelivery } from "./delivery";
const id = "00000000-0000-0000-0000-000000000001";
const token = "00000000-0000-0000-0000-000000000002";
const payload = { from: "sender@example.invalid", to: "recipient@example.invalid", subject: "Resumo", html: "<p>Teste</p>", text: "Teste" };
const ok = (data: unknown) => ({ data, error: null });
async function row() {
  return { message_id: id, claim_token: token, payload_bytes: JSON.stringify(Object.values(payload)),
    payload_hash: (await freezeDelivery(id, payload)).payloadHash, idempotency_key: "edital-certo/" + id };
}
describe("stored worker simulation without email transport", () => {
  it("maps provider outcomes including terminal idempotency conflicts", () => {
    expect(storedProviderOutcome({ kind: "rejected", status: 409 })).toEqual({ outcome: "conflict" });
    for (const status of [429, 500, 503]) expect(storedProviderOutcome({ kind: "rejected", status })).toEqual({ outcome: "retryable" });
    expect(storedProviderOutcome({ kind: "rejected", status: 409, errorCode: "concurrent_idempotent_requests" })).toEqual({ outcome: "retryable" });
    expect(storedProviderOutcome({ kind: "rejected", status: 422 })).toEqual({ outcome: "permanent" });
    expect(storedProviderOutcome({ kind: "accepted", id: " " })).toEqual({ outcome: "unknown" });
    expect(storedProviderOutcome({ kind: "rejected", status: 200 })).toEqual({ outcome: "unknown" });
  });
  it("does nothing for an unavailable message", async () => {
    const rpc = vi.fn().mockResolvedValue(ok(null));
    expect(await simulateStoredAttempt({ rpc }, id, { kind: "unknown" })).toBe("idle");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("revalidates authorization before recording a simulated result", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(ok(await row())).mockResolvedValueOnce(ok(true)).mockResolvedValueOnce(ok("accepted"));
    expect(await simulateStoredAttempt({ rpc }, id, { kind: "accepted", id: "simulated" })).toBe("accepted");
    expect(rpc.mock.calls[1]).toEqual(["validate_email_message_claim", { p_message_id: id, p_claim_token: token }]);
    expect(rpc.mock.calls[2][1].p_provider_id).toBe("simulated");
  });
  it("does not accept simulation after eligibility is revoked", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(ok(await row())).mockResolvedValueOnce(ok(false)).mockResolvedValueOnce(ok("failed"));
    expect(await simulateStoredAttempt({ rpc }, id, { kind: "accepted", id: "simulated" })).toBe("ineligible");
    expect(rpc.mock.calls[2][1].p_outcome).toBe("permanent");
  });
  it("stops on revalidation or completion failure without another claim", async () => {
    for (const validationFails of [true, false]) {
      const rpc = vi.fn().mockResolvedValueOnce(ok(await row()));
      if (!validationFails) rpc.mockResolvedValueOnce(ok(true));
      rpc.mockRejectedValueOnce(new Error("private@example.invalid"));
      await expect(simulateStoredAttempt({ rpc }, id, { kind: "unknown" })).rejects.toThrow("EMAIL_MESSAGE_RPC_FAILED");
      expect(rpc).toHaveBeenCalledTimes(validationFails ? 2 : 3);
    }
  });
  it("rejects empty, duplicate or expired digest input before reservation", async () => {
    const rpc = vi.fn();
    const item = { queueId: id, opportunity: { id, title: "Nobreak", agency: null, uf: null, estimatedValue: null, deadline: "2020-01-01", score: 100, explanation: [] } };
    for (const items of [[], [item, item], [item]]) {
      await expect(stageStoredDigest({ rpc }, items, payload, new Date("2026-10-20"))).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
});
