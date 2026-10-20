import { describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { freezeDelivery, type EmailPayload } from "./delivery";
import { cancelUnattemptedMessage, claimStoredMessage, finishStoredAttempt, stageEmailMessage, type EmailMessageRpc } from "./persisted";
const id = "00000000-0000-0000-0000-000000000001";
const token = "00000000-0000-0000-0000-000000000002";
const payload: EmailPayload = { from: "sender@example.invalid", to: "recipient@example.invalid", subject: "Resumo", html: "<p>Resumo</p>", text: "Resumo" };
const bytes = JSON.stringify([payload.from, payload.to, payload.subject, payload.html, payload.text]);
const ok = (data: unknown) => ({ data, error: null });
async function claimRow(payloadBytes = bytes) {
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payloadBytes)))]
    .map((value) => value.toString(16).padStart(2, "0")).join("");
  return { message_id: id, claim_token: token, payload_bytes: payloadBytes, payload_hash: hash, idempotency_key: "edital-certo/" + id };
}
describe("persisted email RPC bridge, no transport", () => {
  it("accepts the actual Supabase client type without making requests", () => {
    const client: EmailMessageRpc = createClient("https://example.invalid", "not-a-real-key");
    expect(typeof client.rpc).toBe("function");
  });
  it("reserves once and freezes exactly the delivery format and hash", async () => {
    const frozen = await freezeDelivery(id, payload);
    const rpc = vi.fn().mockResolvedValueOnce(ok(id)).mockResolvedValueOnce(ok(frozen.payloadHash));
    expect(await stageEmailMessage({ rpc }, [id], payload)).toBe(id);
    expect(rpc.mock.calls).toEqual([
      ["reserve_email_message", { p_queue_ids: [id] }],
      ["freeze_email_message", { p_message_id: id, p_payload_bytes: bytes }],
    ]);
  });
  it("snapshots mutable input before any database wait", async () => {
    const mutable = { ...payload };
    const hash = (await freezeDelivery(id, payload)).payloadHash;
    const rpc = vi.fn().mockImplementationOnce(async () => { mutable.subject = "changed"; return ok(id); }).mockResolvedValueOnce(ok(hash));
    await stageEmailMessage({ rpc }, [id], mutable);
    expect(rpc.mock.calls[1][1].p_payload_bytes).toBe(bytes);
  });
  it("rejects invalid or oversized input before reserving", async () => {
    const rpc = vi.fn();
    for (const queue of [[], [id, id], ["bad-id"], Array.from({ length: 21 }, () => id)]) {
      await expect(stageEmailMessage({ rpc }, queue, payload)).rejects.toThrow();
    }
    await expect(stageEmailMessage({ rpc }, [id], { ...payload, subject: "Hi\r\nBcc: other@example.invalid" })).rejects.toThrow();
    await expect(stageEmailMessage({ rpc }, [id], { ...payload, text: "é".repeat(60001) })).rejects.toThrow("TOO_LARGE");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("does not retry an ambiguous reservation or expose database content", async () => {
    const rpc = vi.fn().mockRejectedValue(new Error("secret@example.invalid"));
    await expect(stageEmailMessage({ rpc }, [id], payload)).rejects.toThrow("EMAIL_MESSAGE_RPC_FAILED:reserve_email_message");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("releases only unattempted messages after a freeze error or hash mismatch", async () => {
    for (const reply of [{ data: null, error: { message: "recipient@example.invalid" } }, ok("bad-hash")]) {
      const rpc = vi.fn().mockResolvedValueOnce(ok(id)).mockResolvedValueOnce(reply).mockResolvedValueOnce(ok(true));
      await expect(stageEmailMessage({ rpc }, [id], payload)).rejects.toThrow();
      expect(rpc.mock.calls[2]).toEqual(["cancel_unattempted_email_message", { p_message_id: id }]);
      expect(rpc).toHaveBeenCalledTimes(3);
    }
  });
  it("never creates a second message when cleanup fails", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(ok(id)).mockResolvedValueOnce(ok("bad")).mockResolvedValueOnce({ data: null, error: { message: "secret" } });
    await expect(stageEmailMessage({ rpc }, [id], payload)).rejects.toThrow("cancel_unattempted_email_message");
    expect(rpc).toHaveBeenCalledTimes(3);
  });
  it("treats a null claim as no work and preserves immutable verified bytes", async () => {
    const row = await claimRow();
    const rpc = vi.fn().mockResolvedValueOnce(ok(null)).mockResolvedValueOnce(ok(row));
    expect(await claimStoredMessage({ rpc }, id)).toBeNull();
    const claimed = await claimStoredMessage({ rpc }, id);
    expect(claimed?.payload).toEqual(payload);
    expect(claimed?.payloadBytes).toBe(bytes);
    expect(Object.isFrozen(claimed)).toBe(true);
    expect(Object.isFrozen(claimed?.payload)).toBe(true);
  });
  it("hashes original UTF-8 bytes, including insignificant JSON whitespace", async () => {
    const spaced = JSON.stringify(JSON.parse(bytes), null, 2);
    const rpc = vi.fn().mockResolvedValue(ok(await claimRow(spaced)));
    expect((await claimStoredMessage({ rpc }, id))?.payloadBytes).toBe(spaced);
  });
  it("rejects tampering, redirected keys, invalid leases and malformed payloads", async () => {
    const row = await claimRow();
    const invalid = [
      { ...row, payload_bytes: bytes + " " }, { ...row, idempotency_key: "different" },
      { ...row, message_id: token }, { ...row, claim_token: "bad" },
      await claimRow('["only-one"]'), await claimRow("null"), await claimRow("not-json"),
    ];
    for (const value of invalid) {
      const rpc = vi.fn().mockResolvedValue(ok(value));
      await expect(claimStoredMessage({ rpc }, id)).rejects.toThrow();
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });
  it("records completion with the original token, without another claim", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(ok(await claimRow())).mockResolvedValueOnce(ok("accepted"));
    const claim = (await claimStoredMessage({ rpc }, id))!;
    expect(await finishStoredAttempt({ rpc }, claim, "accepted", "simulated-only")).toBe("accepted");
    expect(rpc.mock.calls[1]).toEqual(["finish_email_message_attempt", {
      p_message_id: id, p_claim_token: token, p_outcome: "accepted", p_provider_id: "simulated-only",
    }]);
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("propagates lost leases and rejects missing acceptance IDs", async () => {
    const rpc = vi.fn().mockResolvedValueOnce(ok(await claimRow())).mockResolvedValueOnce({ data: null, error: { code: "40001" } });
    const claim = (await claimStoredMessage({ rpc }, id))!;
    await expect(finishStoredAttempt({ rpc }, claim, "accepted", " ")).rejects.toThrow("OUTCOME_INVALID");
    await expect(finishStoredAttempt({ rpc }, claim, "accepted", "simulated-only")).rejects.toThrow("finish_email_message_attempt");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("reports refusal to release an attempted message", async () => {
    const rpc = vi.fn().mockResolvedValue(ok(false));
    expect(await cancelUnattemptedMessage({ rpc }, id)).toBe(false);
  });
});
