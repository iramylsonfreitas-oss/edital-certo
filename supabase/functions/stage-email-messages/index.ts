import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { runStagingBatch, stagingProjectUrl } from "../../../src/lib/alerts/staging.ts";

// Development-only persistence. This function cannot send or simulate accepting emails.
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  if (Deno.env.get("SUPABASE_URL") !== stagingProjectUrl) {
    return Response.json({ status: "disabled", sends_email: false }, { status: 503 });
  }
  const token = request.headers.get("x-ingestion-token");
  if (!token) return new Response("Não autorizado.", { status: 401 });
  const supabase = createClient(stagingProjectUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const valid = await supabase.rpc("validate_ingestion_job_token", { p_candidate: token });
  if (valid.error || valid.data !== true) return new Response("Não autorizado.", { status: 401 });
  const metadata = { mode: "stage_only", sends_email: false, message_budget: 5, time_budget_ms: 45000 };
  const run = await supabase.from("ingestion_runs").insert({
    source_key: "email-message-staging", status: "running", metadata
  }).select("id").single();
  if (run.error) return Response.json({ status: "failed", sends_email: false }, { status: 500 });
  try {
    const result = await runStagingBatch(supabase);
    const status = result.exhausted ? "succeeded" : "partial";
    const updated = await supabase.from("ingestion_runs").update({
      status, finished_at: new Date().toISOString(), records_seen: result.staged,
      metadata: { ...metadata, ...result }
    }).eq("id", run.data.id);
    if (updated.error) throw new Error("EMAIL_STAGING_RUN_UPDATE_FAILED");
    return Response.json({ status, ...metadata, ...result });
  } catch {
    await supabase.from("ingestion_runs").update({
      status: "failed", finished_at: new Date().toISOString(),
      error_message: "Falha na persistência de prévias; não há envio nesta rotina.", metadata
    }).eq("id", run.data.id);
    console.error(JSON.stringify({ event: "email_message_staging_failed", runId: run.data.id }));
    return Response.json({ status: "failed", mode: "stage_only", sends_email: false }, { status: 502 });
  }
});
