import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { Webhook } from "svix";
import { deliverProviderMessage, stageProviderDigest } from "../src/lib/alerts/provider-worker.ts";
import { handleProviderWebhook, handleUnsubscribe } from "../src/lib/alerts/provider-http.ts";
import { emailAppOrigin, emailDevelopmentUrl } from "../src/lib/alerts/resend-transport.ts";

const url = process.env.EMAIL_TEST_API_URL;
const db = process.env.EMAIL_TEST_DB_URL;
if (url !== "http://127.0.0.1:54321" || db !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
 || process.env.EMAIL_TEST_DISPOSABLE !== "true" || process.env.RESEND_API_KEY) throw new Error("DISPOSABLE_LOCAL_DATABASE_REQUIRED");
const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json", "--workdir", process.env.EMAIL_TEST_WORKDIR!], {encoding:"utf8"}));
const admin = createClient(url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const anon = createClient(url,status.ANON_KEY,{auth:{persistSession:false}});
function sql(query:string) {
 return execFileSync("psql",[db!,"-X","-qAt","-v","ON_ERROR_STOP=1","-c",query],{encoding:"utf8"}).trim();
}
// Commit fixtures only inside the guarded disposable local stack.
const setup = readFileSync(new URL("../supabase/tests/email-message-installed.sql",import.meta.url),"utf8").split("set local role service_role;")[0];
const fixture = JSON.parse(sql(setup + `
 update auth.users set email='pilot-'||id||'@delivery-unit.fixture-mail.dev' where id=current_setting('test.installed.actor')::uuid;
 select json_build_object('actor',current_setting('test.installed.actor'),'queue',current_setting('test.installed.queue'),
 'email',(select email from auth.users where id=current_setting('test.installed.actor')::uuid));
 commit;`));
const from = "alerts@delivery-unit.fixture-mail.dev";
const secret = "whsec_"+Buffer.alloc(32,9).toString("base64");
const config = {enabled:true,projectUrl:emailDevelopmentUrl,apiKey:"re_mock_no_live_credentials",from,recipients:[fixture.email],webhookSecret:secret};
assert.ok((await anon.rpc("record_email_provider_event",{})).error);
assert.ok((await anon.from("email_unsubscribe_tokens").select("token_hash")).error);
assert.equal(await stageProviderDigest(admin,config),"prepared");
let sends = 0;
let sent: {tags:{name:string;value:string}[];text:string;to:string[]} | undefined;
// Mandatory injected provider; this runner never performs a provider network call.
const mockedFetch:typeof fetch = async (input,options) => {
 assert.equal(input,"https://api.resend.com/emails");
 sent=JSON.parse(options!.body as string); sends++;
 throw new Error("SIMULATED_RESPONSE_LOST_AFTER_PROVIDER_ACCEPTED");
};
const results = await Promise.all(Array.from({length:8},()=>deliverProviderMessage(admin,config,mockedFetch)));
assert.equal(sends,1); assert.equal(results.filter(r=>r==="retry").length,1);
const msg = sent!.tags.find(tag=>tag.name==="edital_message_id")!.value;
assert.match(msg,/^[a-f0-9-]{36}$/);
const provider = crypto.randomUUID();
async function event(kind:string,eventId:string) {
 const date=new Date();
 const raw=JSON.stringify({type:"email."+kind,created_at:date.toISOString(),data:{email_id:provider,from,to:sent!.to,tags:{edital_message_id:msg}}});
 return handleProviderWebhook(new Request(emailAppOrigin+"/api/email/events",{method:"POST",body:raw,headers:{
  "svix-id":eventId,"svix-timestamp":String(Math.floor(date.getTime()/1000)),"svix-signature":new Webhook(secret).sign(eventId,date,raw),
 }}),{client:admin,secret,expectedFrom:from});
}
assert.equal((await event("delivered","msg_local_delivered")).status,204);
const receipt=await admin.from("email_messages").select("status,delivery_state,had_unknown_outcome").eq("id",msg).single();
assert.ifError(receipt.error); assert.equal(receipt.data.status,"accepted"); assert.equal(receipt.data.delivery_state,"delivered");
assert.equal(receipt.data.had_unknown_outcome,true);
assert.equal(await deliverProviderMessage(admin,config,mockedFetch),"idle"); assert.equal(sends,1);
assert.equal(sql(`select status from public.email_alert_queue where id='${fixture.queue}'`),"sent");
const cancelUrl = sent!.text.match(/https:\/\/[^\s]+\/email\/unsubscribe\?token=[a-f0-9]{64}/)![0];
assert.equal((await handleUnsubscribe(new Request(cancelUrl),admin)).status,200);
assert.equal(sql(`select count(*) from public.email_delivery_blocks where recipient_user_id='${fixture.actor}'`),"0");
for(let i=0;i<2;i++) assert.equal((await handleUnsubscribe(new Request(cancelUrl,{method:"POST",body:"List-Unsubscribe=One-Click"}),admin)).status,200);
assert.equal(sql(`select reason from public.email_delivery_blocks where recipient_user_id='${fixture.actor}'`),"unsubscribe");
assert.equal((await event("complained","msg_local_complaint")).status,204);
assert.equal((await event("sent","msg_local_out_of_order")).status,204);
assert.equal(sql(`select reason from public.email_delivery_blocks where recipient_user_id='${fixture.actor}'`),"complained");
assert.equal(await stageProviderDigest(admin,config),"idle");
console.log(JSON.stringify({mode:"disposable_local_mock_provider",real_emails_sent:0,concurrent_workers:8,
 provider_calls:1,lost_response_reconciled:true,queue_sent:true,unsubscribe_idempotent:true,complaint_blocks:true,out_of_order_preserved:true}));
