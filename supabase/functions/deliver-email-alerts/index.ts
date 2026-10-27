import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { stageProviderDigest, deliverProviderMessage, providerReady } from "../../../src/lib/alerts/provider-worker.ts";
import { emailDevelopmentUrl } from "../../../src/lib/alerts/resend-transport.ts";

// Release gate: keep closed until the verified sender and signed callbacks are configured.
const deliveryDeploymentEnabled = false;

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (Deno.env.get("SUPABASE_URL") !== emailDevelopmentUrl) return Response.json({ mode: "disabled", sends_email: false }, { status: 503 });
  const token = request.headers.get("x-ingestion-token");
  if (!token) return new Response(null, { status: 401 });
  const client = createClient(emailDevelopmentUrl,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{ auth:{persistSession:false,autoRefreshToken:false} });
  const valid = await client.rpc("validate_ingestion_job_token", { p_candidate: token });
  if (valid.error || valid.data !== true) return new Response(null, { status: 401 });
  const config = { enabled: deliveryDeploymentEnabled && Deno.env.get("EMAIL_SEND_ENABLED") === "true", projectUrl: emailDevelopmentUrl,
    apiKey: Deno.env.get("RESEND_API_KEY") ?? "", from: Deno.env.get("EMAIL_FROM") ?? "",
    recipients: (Deno.env.get("EMAIL_ALLOWED_RECIPIENTS") ?? "").split(",").map((value) => value.trim()).filter(Boolean),
    webhookSecret: Deno.env.get("RESEND_WEBHOOK_SECRET") ?? "",
  };
  if (!providerReady(config)) return Response.json({ mode:"disabled",sends_email:false });
  try {
    const prepared = await stageProviderDigest(client,config);
    const delivered = await deliverProviderMessage(client,config);
    return Response.json({ mode:"allowlisted_pilot",prepared,delivered });
  } catch { return Response.json({ status:"failed",mode:"allowlisted_pilot" },{ status:502 }); }
});
