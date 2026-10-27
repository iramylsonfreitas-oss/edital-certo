import { describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";
import { createResendTransport, emailAppOrigin, emailDevelopmentUrl } from "./resend-transport";
import { deliverProviderMessage, providerReady, stageProviderDigest } from "./provider-worker";
import { handleProviderWebhook, handleUnsubscribe } from "./provider-http";
import { freezeDelivery } from "./delivery";

const id = "00000000-0000-0000-0000-000000000001";
const tokenId = "00000000-0000-0000-0000-000000000002";
const providerId = "00000000-0000-0000-0000-000000000003";
const token = "a".repeat(64);
const url = emailAppOrigin + "/email/unsubscribe?token=" + token;
const payload = { from:"alertas@editalcerto.com.br",to:"person@editalcerto.com.br",subject:"Resumo",html:'<p><a href="'+url+'">Cancelar</a></p>',text:"Cancelar: "+url };
const secret = "whsec_" + Buffer.alloc(32,7).toString("base64");
const config = { enabled:true,projectUrl:emailDevelopmentUrl,apiKey:"re_fake_test_key",from:payload.from,recipients:[payload.to],webhookSecret:secret };
const ok = (data:unknown) => ({ data,error:null });

describe("Resend transport with no live network", () => {
  it("reuses identical provider bytes, key, tags and unsubscribe headers", async () => {
    const fetcher = vi.fn().mockImplementation(async () => Response.json({ id:providerId }));
    const transport = createResendTransport({ apiKey:config.apiKey,from:payload.from,allowedRecipients:[payload.to],fetcher });
    for (let i=0;i<2;i++) expect(await transport.send(payload,"edital-certo/"+id)).toEqual({ kind:"accepted",id:providerId });
    expect(fetcher.mock.calls[0][1].body).toBe(fetcher.mock.calls[1][1].body);
    expect(fetcher.mock.calls[0][0]).toBe("https://api.resend.com/emails");
    const request = fetcher.mock.calls[0][1];
    expect(request.redirect).toBe("error");
    expect(request.signal).toBeInstanceOf(AbortSignal);
    expect(request.headers["Idempotency-Key"]).toBe("edital-certo/"+id);
    const sent = JSON.parse(request.body);
    expect(sent.to).toEqual([payload.to]);
    expect(sent.headers["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(sent.tags).toEqual([{ name:"edital_message_id",value:id }]);
  });
  it.each([401,403,422,429,500,503])("returns HTTP %i without retries or error bodies",async(status) => {
    const fetcher = vi.fn().mockResolvedValue(new Response("private recipient and credential",{ status }));
    const transport = createResendTransport({ apiKey:config.apiKey,from:payload.from,allowedRecipients:[payload.to],fetcher });
    expect(await transport.send(payload,"edital-certo/"+id)).toEqual({ kind:"rejected",status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves concurrent-idempotency conflicts and rejects other ambiguous successes",async() => {
    for(const [response,expected] of [
      [Response.json({name:"concurrent_idempotent_requests"},{status:409}),{kind:"rejected",status:409,errorCode:"concurrent_idempotent_requests"}],
      [Response.json({}),{kind:"unknown"}], [new Response("not-json"),{kind:"unknown"}],
    ] as const) {
      const transport=createResendTransport({apiKey:config.apiKey,from:payload.from,allowedRecipients:[payload.to],fetcher:vi.fn().mockResolvedValue(response)});
      expect(await transport.send(payload,"edital-certo/"+id)).toEqual(expected);
    }
  });
  it("treats network failures as unknown without an internal second call",async() => {
    const fetcher=vi.fn().mockRejectedValue(new Error("secret"));
    const transport=createResendTransport({apiKey:config.apiKey,from:payload.from,allowedRecipients:[payload.to],fetcher});
    expect(await transport.send(payload,"edital-certo/"+id)).toEqual({kind:"unknown"});
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("blocks recipient changes, preview senders and missing unsubscribe before network",async() => {
    const fetcher=vi.fn();
    const transport=createResendTransport({apiKey:config.apiKey,from:payload.from,allowedRecipients:[payload.to],fetcher});
    for(const bad of [{...payload,to:"other@editalcerto.com.br"},{...payload,from:"preview@edital-certo.invalid"},{...payload,text:"no unsubscribe"}]) {
      await expect(transport.send(bad,"edital-certo/"+id)).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("provider worker activation and durable result",() => {
  it("is disabled before every database access unless all pilot settings are supplied",async() => {
    const rpc=vi.fn();const fetcher=vi.fn();
    for(const disabled of [{...config,enabled:false},{...config,projectUrl:"https://production.invalid"},{...config,recipients:[]},{...config,webhookSecret:""},{...config,from:"preview@edital-certo.invalid"}]) {
      expect(providerReady(disabled)).toBe(false);
      expect(await stageProviderDigest({rpc},disabled)).toBe("disabled");
      expect(await deliverProviderMessage({rpc},disabled,fetcher)).toBe("disabled");
    }
    expect(rpc).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled();
  });
  it("rechecks token and eligibility and records the original attempt",async() => {
    const snapshot=await freezeDelivery(id,payload);
    const rpc=vi.fn(async(name:string) => {
      if(name==="select_email_delivery_candidate")return ok(id);
      if(name==="claim_email_message")return ok({message_id:id,claim_token:tokenId,payload_bytes:JSON.stringify(Object.values(payload)),payload_hash:snapshot.payloadHash,idempotency_key:"edital-certo/"+id});
      if(name==="validate_email_delivery_claim")return ok(true);
      if(name==="finish_email_message_attempt")return ok("accepted");
      throw new Error("Unexpected RPC");
    });
    const fetcher=vi.fn().mockResolvedValue(Response.json({id:providerId}));
    expect(await deliverProviderMessage({rpc},config,fetcher)).toBe("accepted");
    expect(rpc.mock.calls.map(([name])=>name)).toEqual(["select_email_delivery_candidate","claim_email_message","validate_email_delivery_claim","finish_email_message_attempt"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("stops after result recording failure without another send",async() => {
    const snapshot=await freezeDelivery(id,payload);
    const rpc=vi.fn().mockResolvedValueOnce(ok(id)).mockResolvedValueOnce(ok({message_id:id,claim_token:tokenId,payload_bytes:JSON.stringify(Object.values(payload)),payload_hash:snapshot.payloadHash,idempotency_key:"edital-certo/"+id}))
      .mockResolvedValueOnce(ok(true)).mockRejectedValueOnce(new Error("private"));
    const fetcher=vi.fn().mockResolvedValue(Response.json({id:providerId}));
    await expect(deliverProviderMessage({rpc},config,fetcher)).rejects.toThrow("EMAIL_MESSAGE_RPC_FAILED");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("freezes a recipient-bound cancel link before delivery",async() => {
    const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
      if(name==="reserve_next_email_delivery_digest")return ok({message_id:id,to:payload.to,items:[{opportunity:{id:tokenId,title:"Nobreak",agency:null,uf:"AM",estimatedValue:null,deadline:"2027-01-01",score:100,explanation:[]}}]});
      if(name==="create_email_unsubscribe_token")return ok(token);
      if(name==="freeze_email_message") {
        const {createHash}=await import("node:crypto");
        const fields=JSON.parse(args.p_payload_bytes as string);
        expect(fields[3]).toContain(url);expect(fields[4]).toContain(url);
        return ok(createHash("sha256").update(args.p_payload_bytes as string).digest("hex"));
      }
      throw new Error("Unexpected RPC");
    });
    expect(await stageProviderDigest({rpc},config,new Date("2026-10-26"))).toBe("prepared");
    expect(rpc.mock.calls.map(([name])=>name)).not.toContain("claim_email_message");
  });
});

function signedRequest(raw:string, date=new Date()) {
  const eventId="msg_test_event";
  return new Request(emailAppOrigin+"/api/email/events",{method:"POST",body:raw,headers:{
    "svix-id":eventId,"svix-timestamp":String(Math.floor(date.getTime()/1000)),"svix-signature":new Webhook(secret).sign(eventId,date,raw),
  }});
}
const eventBody=()=>JSON.stringify({type:"email.delivered",created_at:new Date().toISOString(),data:{email_id:providerId,from:payload.from,to:[payload.to],subject:"private",tags:{edital_message_id:id}}});
describe("signed provider receipts",()=>{
  it("verifies raw bytes and persists only sanitized event fields",async()=>{
    const rpc=vi.fn().mockResolvedValue(ok("processed"));
    expect((await handleProviderWebhook(signedRequest(eventBody()),{client:{rpc},secret,expectedFrom:payload.from})).status).toBe(204);
    const args=rpc.mock.calls[0][1];
    expect(args.p_message_id).toBe(id);expect(args.p_kind).toBe("delivered");
    expect(JSON.stringify(args)).not.toContain(payload.to);expect(JSON.stringify(args)).not.toContain(payload.from);
    expect(args.p_body_hash).toMatch(/^[a-f0-9]{64}$/);
  });
  it("rejects invalid, altered and expired signatures before writing",async()=>{
    const rpc=vi.fn();
    const altered=signedRequest(eventBody());
    const bad=new Request(altered.url,{method:"POST",headers:altered.headers,body:"{}"});
    for(const request of [bad,new Request(altered.url,{method:"POST",body:eventBody()}),signedRequest(eventBody(),new Date(Date.now()-600_000))]) {
      expect((await handleProviderWebhook(request,{client:{rpc},secret,expectedFrom:payload.from})).status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("acknowledges duplicates but asks the provider to retry pending storage",async()=>{
    for(const [data,status] of [["duplicate",204],["pending",503]] as const) {
      const rpc=vi.fn().mockResolvedValue(ok(data));
      expect((await handleProviderWebhook(signedRequest(eventBody()),{client:{rpc},secret,expectedFrom:payload.from})).status).toBe(status);
    }
  });
  it("ignores other senders without database changes",async()=>{
    const rpc=vi.fn();
    expect((await handleProviderWebhook(signedRequest(eventBody()),{client:{rpc},secret,expectedFrom:"different@editalcerto.com.br"})).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("unsubscribe capability",()=>{
  it("GET shows confirmation without modifying anything",async()=>{
    const rpc=vi.fn();const response=await handleUnsubscribe(new Request(url),{rpc});
    expect(response.status).toBe(200);expect(await response.text()).toContain('method="post"');
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["confirm=yes","List-Unsubscribe=One-Click"])("accepts explicit POST %s",async(body)=>{
    const rpc=vi.fn().mockResolvedValue(ok(true));
    const response=await handleUnsubscribe(new Request(url,{method:"POST",body}),{rpc});
    expect(response.status).toBe(200);expect(rpc).toHaveBeenCalledWith("unsubscribe_email_token",{p_token:token});
    if(body.startsWith("List"))expect(await response.text()).toBe("");
  });
  it("fails closed without database configuration or with invalid tokens",async()=>{
    expect((await handleUnsubscribe(new Request(url,{method:"POST",body:"confirm=yes"}),null)).status).toBe(503);
    const rpc=vi.fn();expect((await handleUnsubscribe(new Request(url.replace(token,"bad")),{rpc})).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
});
