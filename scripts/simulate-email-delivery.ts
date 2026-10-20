import { attemptDelivery, freezeDelivery, type ProviderOutcome } from "../src/lib/alerts/delivery.ts";
const state = await freezeDelivery("00000000-0000-0000-0000-000000000001", {
  from: "sender@example.invalid", to: "recipient@example.invalid", subject: "Simulação local", html: "<p>Simulação local</p>", text: "Simulação local"
});
const keys: string[] = [];
const transport = { send: async (_payload: unknown, key: string): Promise<ProviderOutcome> => {
  keys.push(key);
  return keys.length === 1 ? { kind: "unknown" } : { kind: "accepted", id: "simulated-provider-id" };
} };
const retry = await attemptDelivery(state, transport, true, new Date("2026-10-20T15:00:00Z"));
const restored = JSON.parse(JSON.stringify(retry));
const accepted = await attemptDelivery(restored, transport, true, new Date(retry.nextAttemptAt!));
if (accepted.status !== "accepted" || keys.length !== 2 || keys[0] !== keys[1]) throw new Error("Falha na simulação.");
console.log(JSON.stringify({ mode: "local_simulation", real_emails_sent: 0, initial_outcome: "unknown", final_state: accepted.status, attempts: accepted.attempts, same_key_reused: keys[0] === keys[1] }));
