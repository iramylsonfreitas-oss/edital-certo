import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const url=process.env.NAVIGATION_TEST_API_URL;
const db=process.env.NAVIGATION_TEST_DB_URL;
if(url!=="http://127.0.0.1:54321" || db!=="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
 || process.env.NAVIGATION_TEST_DISPOSABLE!=="true" || process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("DISPOSABLE_LOCAL_DATABASE_REQUIRED");
const status=JSON.parse(execFileSync("supabase",["status","-o","json","--workdir",process.env.NAVIGATION_TEST_WORKDIR!],{encoding:"utf8"}));
const client=createClient(url,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
const actors:Record<string,string>={};
for(const name of ["admin","outsider"]) {
 const {data,error}=await client.auth.admin.createUser({email:`navigation-${name}@example.invalid`,password:"local-navigation-only-6419",email_confirm:true});
 assert.ifError(error);actors[name]=data.user!.id;assert.match(actors[name],/^[a-f0-9-]{36}$/);
}
const org=crypto.randomUUID(),otherOrg=crypto.randomUUID(),tender=crypto.randomUUID(),second=crypto.randomUUID();
execFileSync("psql",[db,"-X","-qAt","-v","ON_ERROR_STOP=1","-c",`
 begin;
 select set_config('request.jwt.claim.sub','${actors.admin}',true);
 insert into public.organizations(id,name,slug,created_by) values('${org}','Navigation fixture','navigation-${org}','${actors.admin}');
 select set_config('request.jwt.claim.sub','${actors.outsider}',true);
 insert into public.organizations(id,name,slug,created_by) values('${otherOrg}','Other navigation fixture','navigation-${otherOrg}','${actors.outsider}');
 insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data) values
 ('${tender}','navigation-ci','${tender}','Nobreak de teste de navegação','Aquisição de nobreak',now()+interval '10 days','{"situacaoCompraId":1}'),
 ('${second}','navigation-ci','${second}','Software de teste de navegação','Licença de software',now()+interval '12 days','{"situacaoCompraId":1}');
 insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data)
 select gen_random_uuid(),'navigation-ci','pagination-'||n,'Notebook de paginação '||n,'Aquisição de notebook',now()+interval '15 days'+n*interval '1 minute','{"situacaoCompraId":1}'::jsonb
 from generate_series(1,51) n;
 insert into public.pipeline_cards(organization_id,tender_id,created_by,notes) values
 ('${org}','${tender}','${actors.admin}','Anotação exclusiva da conta de teste'),
 ('${otherOrg}','${second}','${actors.outsider}','Anotação de outra organização');
 commit;`],{encoding:"utf8"});
if(process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV,`NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`);
console.log(JSON.stringify({mode:"disposable_local_only",synthetic_accounts:2,real_emails_sent:0}));
