import { describe, expect, it, vi } from "vitest";
import { attemptDelivery, freezeDelivery, type EmailPayload, type ProviderOutcome } from "./delivery";
const id = "00000000-0000-0000-0000-000000000001";
const payload: EmailPayload = { from: "sender@example.invalid", to: "recipient@example.invalid", subject: "Resumo", html: "<p>Resumo</p>", text: "Resumo" };
const now = new Date("2026-10-20T15:00:00Z");
describe("delivery core with simulated transport only", () => {
  it("reuses the exact payload/key after an unknown outcome and serialized restart", async () => {
    const send = vi.fn<() => Promise<ProviderOutcome>>().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue({ kind: "accepted", id: "provider-1" });
    let state = await attemptDelivery(await freezeDelivery(id, payload), { send }, true, now);
    expect(state.status).toBe("retry");
    state = JSON.parse(JSON.stringify(state));
    state = await attemptDelivery(state, { send }, true, new Date(state.nextAttemptAt!));
    expect(state.status).toBe("accepted");
    expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
    expect(send.mock.calls[0]).toEqual([payload, `edital-certo/${id}`]);
    await attemptDelivery(state, { send }, true, now);
    expect(send).toHaveBeenCalledTimes(2);
  });
  it("waits for backoff and retries rate limits, server errors and concurrent requests", async () => {
    for (const result of [{ kind: "rejected", status: 429 }, { kind: "rejected", status: 503 }, { kind: "rejected", status: 409, errorCode: "concurrent_idempotent_requests" }] as ProviderOutcome[]) {
      const send = vi.fn(async () => result);
      const state = await attemptDelivery(await freezeDelivery(id, payload), { send }, true, now);
      expect(state.status).toBe("retry");
      await attemptDelivery(state, { send }, true, now);
      expect(send).toHaveBeenCalledTimes(1);
    }
  });
  it("stops permanent rejections and uncertain idempotency conflicts", async () => {
    const state = await freezeDelivery(id, payload);
    expect((await attemptDelivery(state, { send: async () => ({ kind: "rejected", status: 422 }) }, true, now)).status).toBe("failed");
    expect((await attemptDelivery(state, { send: async () => ({ kind: "rejected", status: 409, errorCode: "invalid_idempotent_request" }) }, true, now)).status).toBe("uncertain");
  });
  it("cancels withdrawn eligibility and refuses payload changes", async () => {
    const send = vi.fn(async (): Promise<ProviderOutcome> => ({ kind: "accepted", id: "x" }));
    const state = await freezeDelivery(id, payload);
    expect((await attemptDelivery(state, { send }, false, now)).status).toBe("canceled");
    expect((await attemptDelivery({ ...state, payload: { ...payload, subject: "Changed" } }, { send }, true, now)).status).toBe("failed");
    expect(send).not.toHaveBeenCalled();
  });
  it("stops before the idempotency window expires", async () => {
    const send = vi.fn(async (): Promise<ProviderOutcome> => ({ kind: "unknown" }));
    const state = await attemptDelivery(await freezeDelivery(id, payload), { send }, true, now);
    expect((await attemptDelivery(state, { send }, true, new Date(now.getTime() + 23 * 3600_000))).status).toBe("uncertain");
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("caps repeated uncertain attempts", async () => {
    let state = await freezeDelivery(id, payload);
    const send = vi.fn(async (): Promise<ProviderOutcome> => ({ kind: "unknown" }));
    for (let i = 0; i < 5; i++) state = await attemptDelivery(state, { send }, true, i ? new Date(state.nextAttemptAt!) : now);
    expect(state.status).toBe("uncertain");
    await attemptDelivery(state, { send }, true, now);
    expect(send).toHaveBeenCalledTimes(5);
  });
  it("rejects header injection and broken retry history", async () => {
    await expect(freezeDelivery(id, { ...payload, subject: "Hi\r\nBcc: other@example.invalid" })).rejects.toThrow();
    const state = await freezeDelivery(id, payload);
    await expect(attemptDelivery({ ...state, attempts: 1 }, { send: async () => ({ kind: "unknown" }) }, true, now)).rejects.toThrow();
  });
});
