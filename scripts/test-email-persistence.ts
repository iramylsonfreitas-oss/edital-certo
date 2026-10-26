import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { cancelUnattemptedMessage, claimStoredMessage, finishStoredAttempt, stageEmailMessage } from "../src/lib/alerts/persisted.ts";
import { stageStoredDigest, simulateStoredAttempt, stageNextStoredDigest } from "../src/lib/alerts/stored-worker.ts";

// Never accept hosted URLs or inherited app credentials. No provider API calls exist in this runner.
const url = process.env.EMAIL_TEST_API_URL;
const db = process.env.EMAIL_TEST_DB_URL;
if (url !== "http://127.0.0.1:54321" || db !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
  || process.env.EMAIL_TEST_DISPOSABLE !== "true" || process.env.RESEND_API_KEY) {
  throw new Error("DISPOSABLE_LOCAL_DATABASE_REQUIRED");
}
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json", "--workdir", process.env.EMAIL_TEST_WORKDIR!], { encoding: "utf8" }));
const admin = createClient(url, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const anon = createClient(url, status.ANON_KEY, { auth: { persistSession: false } });
function sql(query: string) {
  return execFileSync("psql", [db!, "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", query], { encoding: "utf8" }).trim();
}
const fixture = JSON.parse(sql(`select json_build_object('email',u.email,'rows',
 (select json_agg(json_build_object('queueId',q.id,'opportunity',json_build_object(
  'id',t.id,'title',t.title,'agency',null,'uf',t.uf,'estimatedValue',t.estimated_value,
  'deadline',t.proposal_close_at,'score',q.score,'explanation',q.explanation)) order by q.id)
 from public.email_alert_queue q join public.tenders t on t.id=q.tender_id where q.recipient_user_id=u.id))
 from auth.users u where u.email like 'queue-%@example.invalid' and exists
 (select 1 from public.email_alert_queue where recipient_user_id=u.id) limit 1`));
assert.ok(fixture.rows.length >= 5);
const payload = { from: "sender@example.invalid", to: fixture.email, subject: "REST test", html: "<p>á &amp; teste</p>", text: "á & teste" };
assert.ok((await anon.from("email_messages").select("id")).error);
assert.ok((await anon.rpc("reserve_email_message", { p_queue_ids: [fixture.rows[0].queueId] })).error);

// Authenticated users must also be denied, tested via a local-only signed session.
const account = await admin.auth.admin.createUser({ email: "rest-access@example.invalid", password: "local-test-password-only-9321", email_confirm: true });
assert.ifError(account.error);
const member = createClient(url, status.ANON_KEY, { auth: { persistSession: false } });
assert.ifError((await member.auth.signInWithPassword({ email: "rest-access@example.invalid", password: "local-test-password-only-9321" })).error);
assert.ok((await member.from("email_messages").select("id")).error);
assert.ok((await member.rpc("claim_email_message", { p_message_id: crypto.randomUUID() })).error);

// Concurrent reservations: same real queue item, independent HTTP transactions, one durable owner.
const reservations = await Promise.all(Array.from({ length: 8 }, () =>
 admin.rpc("reserve_email_message", { p_queue_ids: [fixture.rows[0].queueId] })));
const owners = reservations.filter((result) => !result.error);
assert.equal(owners.length, 1);
assert.equal(await cancelUnattemptedMessage(admin, owners[0].data), true);

const id = await stageStoredDigest(admin, [fixture.rows[0]], payload, new Date());
const claims = await Promise.all(Array.from({ length: 12 }, () => claimStoredMessage(admin, id)));
const granted = claims.filter((claim) => claim !== null);
assert.equal(granted.length, 1);
const first = granted[0]!;
assert.equal(sql(`select count(*) from public.email_message_attempts where message_id='${id}'`), "1");
// Restart/lease loss: recover from SQL, preserving exact UTF-8 bytes and identity.
sql(`update public.email_messages set lease_until=clock_timestamp()-interval '1 second' where id='${id}'`);
const recovered = (await claimStoredMessage(admin, id))!;
assert.notEqual(recovered.token, first.token);
assert.equal(recovered.payloadBytes, first.payloadBytes);
assert.equal(recovered.idempotencyKey, first.idempotencyKey);
await assert.rejects(finishStoredAttempt(admin, first, "accepted", "stale-simulation"));
assert.equal(await finishStoredAttempt(admin, recovered, "retryable"), "retry");
assert.equal(await claimStoredMessage(admin, id), null);
sql(`update public.email_messages set next_attempt_at=clock_timestamp()-interval '1 second' where id='${id}'`);
assert.equal(await simulateStoredAttempt(admin, id, { kind: "accepted", id: "simulated-local-only" }), "accepted");
assert.equal(await claimStoredMessage(admin, id), null);
assert.equal(sql(`select status from public.email_alert_queue where id='${fixture.rows[0].queueId}'`), "sent");

// A 409 identity conflict terminates uncertain immediately, preserving item ownership.
const conflictId = await stageEmailMessage(admin, [fixture.rows[1].queueId], payload);
assert.equal(await simulateStoredAttempt(admin, conflictId, { kind: "rejected", status: 409 }), "uncertain");
assert.equal(await claimStoredMessage(admin, conflictId), null);
assert.ok((await admin.rpc("reserve_email_message", { p_queue_ids: [fixture.rows[1].queueId] })).error);

// Hash errors from persisted data cannot reach simulated completion.
const corruptedId = await stageEmailMessage(admin, [fixture.rows[2].queueId], payload);
sql("alter table public.email_messages disable trigger email_message_frozen");
try { sql(`update public.email_messages set payload_hash=repeat('0',64) where id='${corruptedId}'`); }
finally { sql("alter table public.email_messages enable trigger email_message_frozen"); }
await assert.rejects(simulateStoredAttempt(admin, corruptedId, { kind: "accepted", id: "never-recorded" }), /HASH_MISMATCH/);
assert.equal(sql(`select provider_message_id is null from public.email_messages where id='${corruptedId}'`), "t");

// Revalidation detects a pause after acquiring the lease.
sql(`update public.email_messages set lease_until=clock_timestamp()-interval '1 second' where id='${corruptedId}'`);
const rows = await admin.from("email_messages").select("payload_bytes").eq("id", corruptedId).single();
assert.ifError(rows.error);
sql("alter table public.email_messages disable trigger email_message_frozen");
try { sql(`update public.email_messages set payload_hash=encode(extensions.digest(convert_to(payload_bytes,'UTF8'),'sha256'),'hex') where id='${corruptedId}'`); }
finally { sql("alter table public.email_messages enable trigger email_message_frozen"); }
const pausedClaim = (await claimStoredMessage(admin, corruptedId))!;
sql("update public.alerts set is_enabled=false");
assert.equal((await admin.rpc("validate_email_message_claim", { p_message_id: corruptedId, p_claim_token: pausedClaim.token })).data, false);
assert.equal(await finishStoredAttempt(admin, pausedClaim, "permanent"), "uncertain");
// Orphaned reservation recovery releases only an old unattempted draft.
sql("update public.alerts set is_enabled=true");
sql("update public.email_alert_scans set next_scan_at=now(),config_key=''");
const refreshedPage = await admin.rpc("claim_email_alert_page");
assert.ifError(refreshedPage.error);
const refreshed = await admin.rpc("save_email_alert_page", {
  p_alert_id: refreshedPage.data.alert_id, p_profile_id: refreshedPage.data.profile_id,
  p_claim_token: refreshedPage.data.claim_token,
  p_results: fixture.rows.map((item: { opportunity: { id: string } }) => ({ tender_id: item.opportunity.id, score: 100, explanation: ["nobreak"] })),
});
assert.ifError(refreshed.error);
const orphan = await admin.rpc("reserve_email_message", { p_queue_ids: [fixture.rows[3].queueId] });
assert.ifError(orphan.error);
sql(`update public.email_messages set created_at=clock_timestamp()-interval '16 minutes' where id='${orphan.data}'`);
assert.equal((await admin.rpc("recover_email_message_drafts")).data, 1);
assert.equal(sql(`select count(*) from public.email_message_items where message_id='${orphan.data}'`), "0");
// Full queue selection/reservation/composition/freeze through worker and REST.
const staged = await Promise.all(Array.from({ length: 4 }, () => stageNextStoredDigest(admin, payload.from, new Date())));
const nextIds = staged.filter((value) => value !== null);
assert.equal(nextIds.length, 1);
assert.equal(await simulateStoredAttempt(admin, nextIds[0]!, { kind: "accepted", id: "simulated-batch" }), "accepted");
// SKIP LOCKED can leave rows locked by losing selectors out of the winning digest.
// They must be handled by later batches, rather than assumed to disappear.
let remainingBatches = 0;
for (; remainingBatches < fixture.rows.length; remainingBatches++) {
  const next = await stageNextStoredDigest(admin, payload.from, new Date());
  if (next === null) break;
  assert.equal(await simulateStoredAttempt(admin, next, { kind: "accepted", id: "simulated-remainder-" + remainingBatches }), "accepted");
}
assert.ok(remainingBatches < fixture.rows.length, "queue did not drain within fixture budget");
assert.equal(await stageNextStoredDigest(admin, payload.from, new Date()), null);
assert.equal(sql(`select count(*) from public.email_alert_queue q where q.recipient_user_id=(select recipient_user_id from public.email_messages where id='${id}')
 and q.status='prepared' and not exists(select 1 from public.email_message_items i where i.queue_id=q.id)`), "0");
console.log(JSON.stringify({ mode: "disposable_local_only", real_emails_sent: 0, concurrent_reservations: 8,
 concurrent_claims: 12, exclusive_owner: true, rest_access: "anon_and_authenticated_denied",
 restart_recovery: true, stale_token_rejected: true, hash_verified: true, worker_simulation: "passed",
 conflict_terminal: true, authorization_revalidated: true }));
