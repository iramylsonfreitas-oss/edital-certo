// Public-key checks only. No scheduler token, service key, sending or data writes.
const url = process.env.EMAIL_STAGING_VERIFY_URL;
const key = process.env.EMAIL_STAGING_PUBLISHABLE_KEY;
if (url !== "https://afbuozouupuguvkkuvib.supabase.co" || !key?.startsWith("sb_publishable_")) {
  throw new Error("DEVELOPMENT_URL_AND_PUBLISHABLE_KEY_REQUIRED");
}
const results: { check: string; status: number }[] = [];
async function denied(check: string, path: string, init: RequestInit, statuses: number[]) {
  const response = await fetch(url + path, { ...init, signal: AbortSignal.timeout(15_000) });
  await response.text(); // Never log database errors or response bodies.
  if (!statuses.includes(response.status)) throw new Error("PUBLIC_ACCESS_CHECK_FAILED:" + check);
  results.push({ check, status: response.status });
}
const headers = { apikey: key, "Content-Type": "application/json" };
for (const table of ["email_messages", "email_message_items", "email_message_attempts"]) {
  await denied(table, "/rest/v1/" + table + "?select=*&limit=0", { headers }, [401, 403]);
}
await denied("private_rpc", "/rest/v1/rpc/reserve_next_email_digest", { method: "POST", headers, body: "{}" }, [401, 403]);
await denied("maintenance_rpc", "/rest/v1/rpc/maintain_email_message_history", {
  method: "POST", headers, body: '{"p_limit":1}',
}, [401, 403]);
await denied("stage_method", "/functions/v1/stage-email-messages", { headers }, [405]);
await denied("stage_missing_token", "/functions/v1/stage-email-messages", { method: "POST", headers, body: "{}" }, [401]);
await denied("stage_invalid_token", "/functions/v1/stage-email-messages", {
  method: "POST", headers: { ...headers, "x-ingestion-token": "invalid-public-verification" }, body: "{}",
}, [401]);
console.log(JSON.stringify({ environment: "development", sends_email: false, results }));
export {};
