import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Browser fixtures must never run against a hosted project or inherited service credentials.
const url = process.env.PIPELINE_TEST_API_URL;
const db = process.env.PIPELINE_TEST_DB_URL;
if (url !== "http://127.0.0.1:54321" || db !== "postgresql://postgres:postgres@127.0.0.1:54322/postgres"
 || process.env.PIPELINE_TEST_DISPOSABLE !== "true" || process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("DISPOSABLE_LOCAL_DATABASE_REQUIRED");
const status = JSON.parse(execFileSync("supabase",["status","-o","json","--workdir",process.env.PIPELINE_TEST_WORKDIR!],{encoding:"utf8"}));
const admin = createClient(url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const password = "local-comments-test-only-7439";
const actors:Record<string,string> = {};
for (const name of ["admin","analyst","reader","outsider"]) {
 const result = await admin.auth.admin.createUser({email:`comments-${name}@example.invalid`,password,email_confirm:true,user_metadata:{full_name:name === "analyst" ? "Analista de teste" : "Admin de teste"}});
 assert.ifError(result.error); actors[name] = result.data.user!.id;
 assert.match(actors[name],/^[a-f0-9-]{36}$/);
}
const org = crypto.randomUUID(), otherOrg = crypto.randomUUID(), tender = crypto.randomUUID(), card = crypto.randomUUID();
execFileSync("psql",[db,"-X","-qAt","-v","ON_ERROR_STOP=1","-c",`
 begin;
 select set_config('request.jwt.claim.sub','${actors.admin}',true);
 insert into public.organizations(id,name,slug,created_by) values('${org}','Equipe de comentários','comments-ci-${org}','${actors.admin}');
 update public.subscriptions set plan_id=(select id from public.plans where plan_key='pro') where organization_id='${org}';
 insert into public.memberships(organization_id,user_id,role) values('${org}','${actors.analyst}','analyst'),('${org}','${actors.reader}','reader');
 select set_config('request.jwt.claim.sub','${actors.outsider}',true);
 insert into public.organizations(id,name,slug,created_by) values('${otherOrg}','Outra equipe','comments-ci-${otherOrg}','${actors.outsider}');
 insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at) values('${tender}','comments-ci','${tender}','Oportunidade para comentários CI','Fixture de comentários',now()+interval '10 days');
 insert into public.pipeline_cards(id,organization_id,tender_id,created_by) values('${card}','${org}','${tender}','${actors.admin}');
 commit;`],{encoding:"utf8"});
async function signed(name:string) {
 const client = createClient(url!,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 assert.ifError((await client.auth.signInWithPassword({email:`comments-${name}@example.invalid`,password})).error);
 return client;
}
const analyst = await signed("analyst"), reader = await signed("reader"), outsider = await signed("outsider");
const rows = Array.from({length:23},(_,index)=>({id:crypto.randomUUID(),organization_id:org,pipeline_card_id:card,
 author_user_id:actors.analyst,body:`Comentário inicial ${index+1}`,author_name:"Nome forjado",created_at:"2026-01-01T12:00:00.123456Z"}));
assert.ifError((await analyst.from("comments").insert(rows)).error);
const visible = await reader.from("comments").select("id,author_name").eq("pipeline_card_id",card);
assert.ifError(visible.error); assert.equal(visible.data.length,23); assert.equal(visible.data[0].author_name,"Analista de teste");
assert.ok((await reader.from("comments").insert({...rows[0],id:crypto.randomUUID(),author_user_id:actors.reader})).error);
assert.equal((await reader.from("comments").delete().eq("id",rows[0].id).select("id")).data?.length,0);
assert.equal((await outsider.from("comments").select("id").eq("pipeline_card_id",card)).data?.length,0);
assert.equal((await outsider.from("comments").delete().eq("id",rows[0].id).select("id")).data?.length,0);
const fixture = {card,org,password,rows:rows.map(row=>row.id)};
writeFileSync(process.env.PIPELINE_TEST_FIXTURE!,JSON.stringify(fixture));
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV,`NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`);
console.log(JSON.stringify({mode:"disposable_local_only",fixture_comments:23,reader_write_denied:true,outsider_access_denied:true,author_snapshot_verified:true,emails_sent:0}));
