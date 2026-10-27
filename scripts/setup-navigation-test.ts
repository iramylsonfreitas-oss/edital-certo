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
for(const name of ["admin","outsider","evaluator"]) {
 const {data,error}=await client.auth.admin.createUser({email:`navigation-${name}@example.invalid`,password:"local-navigation-only-6419",email_confirm:true,app_metadata:{evaluation_account:name==="evaluator"}});
 assert.ifError(error);actors[name]=data.user!.id;assert.match(actors[name],/^[a-f0-9-]{36}$/);
}
const duplicate=crypto.randomUUID(),groupAgency=crypto.randomUUID();
const org=crypto.randomUUID(),otherOrg=crypto.randomUUID(),evaluationOrg=crypto.randomUUID(),tender=crypto.randomUUID(),second=crypto.randomUUID();
execFileSync("psql",[db,"-X","-qAt","-v","ON_ERROR_STOP=1","-c",`
 begin;
 select set_config('request.jwt.claim.sub','${actors.admin}',true);
 insert into public.organizations(id,name,slug,created_by) values('${org}','Navigation fixture','navigation-${org}','${actors.admin}');
 select set_config('request.jwt.claim.sub','${actors.outsider}',true);
 insert into public.organizations(id,name,slug,created_by) values('${otherOrg}','Other navigation fixture','navigation-${otherOrg}','${actors.outsider}');
 insert into private.evaluation_access(user_id,manager_id,label) values('${actors.evaluator}','${actors.admin}','Avaliador sintético');
 select set_config('request.jwt.claim.sub','${actors.evaluator}',true);
 insert into public.organizations(id,name,slug,created_by) values('${evaluationOrg}','Evaluation navigation fixture','navigation-${evaluationOrg}','${actors.evaluator}');
 insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data) values
 ('${tender}','navigation-ci','${tender}','Nobreak de teste de navegação','Aquisição de nobreak',now()+interval '10 days','{"situacaoCompraId":1}'),
 ('${second}','navigation-ci','${second}','Software de teste de navegação','Licença de software',now()+interval '12 days','{"situacaoCompraId":1}');
 insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data)
 select gen_random_uuid(),'navigation-ci','pagination-'||n,'Notebook de paginação '||n,'Aquisição de notebook',now()+interval '15 days'+n*interval '1 minute','{"situacaoCompraId":1}'::jsonb
 from generate_series(1,51) n;
 insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data) values
 (gen_random_uuid(),'navigation-ci','health-drug','Medicamentos de teste de navegação','Aquisição de medicamentos - paracetamol',now()+interval '9 days','{"situacaoCompraId":1}'),
 (gen_random_uuid(),'navigation-ci','health-supply','Seringas de teste de navegação','Aquisição de seringas',now()+interval '10 days','{"situacaoCompraId":1}'),
 (gen_random_uuid(),'navigation-ci','health-equipment','Equipamentos médicos de teste de navegação','Aquisição de equipamentos médicos',now()+interval '11 days','{"situacaoCompraId":1}');
 insert into public.tenders(id,source_key,source_id,title,object,proposal_close_at,raw_data)
 select gen_random_uuid(),'navigation-ci','health-pagination-'||n,'Medicamentos de paginação '||n,'Aquisição de medicamentos',now()+interval '16 days'+n*interval '1 minute','{"situacaoCompraId":1}'::jsonb
 from generate_series(1,51) n;
 insert into public.pipeline_cards(organization_id,tender_id,created_by,notes) values
 ('${org}','${tender}','${actors.admin}','Anotação exclusiva da conta de teste'),
 ('${otherOrg}','${second}','${actors.outsider}','Anotação de outra organização');
 insert into public.agencies(id,source_key,source_agency_id,name) values('${groupAgency}','navigation-ci','${groupAgency}','Synthetic grouping agency');
 update public.tenders set source_key='pncp',agency_id='${groupAgency}',modality_code='6',municipality_code='4306130',estimated_value=3000,official_url='https://example.com/navigation-fixture',raw_data='{"situacaoCompraId":1,"numeroCompra":"37","anoCompra":2090,"unidadeOrgao":{"codigoUnidade":"01"},"srp":false,"amparoLegal":{"codigo":1}}'
 where source_id='pagination-1';
 insert into public.tenders(id,source_key,source_id,agency_id,title,object,modality_code,municipality_code,estimated_value,proposal_close_at,raw_data)
 select '${duplicate}','pncp','pagination-1-copy',agency_id,'Notebook de paginação 1 - publicação alternativa','[Portal de Compras Públicas] - '||object,modality_code,municipality_code,estimated_value,proposal_close_at,jsonb_set(raw_data,'{unidadeOrgao,codigoUnidade}','"1"') from public.tenders where source_id='pagination-1';
 insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value)
 select id,'1',1,'Notebook de navegação','UN',1,2000,2000 from public.tenders where source_id in ('pagination-1','pagination-1-copy');
 insert into public.tender_items(tender_id,source_item_id,item_number,description,unit,quantity,estimated_unit_value,estimated_total_value)
 select id,'2',2,'Mesa de navegação','UN',1,1000,1000 from public.tenders where source_id in ('pagination-1','pagination-1-copy');
 update public.tenders set items_complete=true,items_object_hash=md5(object) where source_id in ('pagination-1','pagination-1-copy');
 insert into public.tender_feedback(organization_id,user_id,tender_id,state) values('${org}','${actors.admin}','${duplicate}','favorite');
 insert into public.pipeline_cards(organization_id,tender_id,created_by,status,notes) values('${org}','${duplicate}','${actors.admin}','documentation','Anotação de publicação secundária');
 commit;`],{encoding:"utf8"});
if(process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV,`NEXT_PUBLIC_SUPABASE_URL=${url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${status.ANON_KEY}\n`);
console.log(JSON.stringify({mode:"disposable_local_only",synthetic_accounts:3,real_emails_sent:0}));
