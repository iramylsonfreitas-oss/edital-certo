import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { prepareAlertPage, type AlertPage } from "../../../src/lib/alerts/prepare.ts";

// This worker can prepare records only. It has no email API calls or send switch.
Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response("Método não permitido.", { status: 405 });
  const token = request.headers.get("x-ingestion-token");
  if (!token) return new Response("Não autorizado.", { status: 401 });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const valid = await supabase.rpc("validate_ingestion_job_token", { p_candidate: token });
  if (valid.error || valid.data !== true) return new Response("Não autorizado.", { status: 401 });
  const startedAt = Date.now();
  const run = await supabase.from("ingestion_runs").insert({ source_key: "email-alert-preparation", status: "running", metadata: { mode: "prepare_only", sends_email: false } }).select("id").single();
  if (run.error) return Response.json({ status: "failed", sends_email: false }, { status: 500 });
  let pages = 0, checked = 0, prepared = 0, invalidated = 0;
  let current: AlertPage | null = null;
  try {
    const cleaned = await supabase.rpc("cancel_ineligible_email_alerts");
    if (cleaned.error) throw cleaned.error;
    let exhausted = false;
    while (pages < 6 && Date.now() - startedAt < 50_000) {
      const claimed = await supabase.rpc("claim_email_alert_page");
      if (claimed.error) throw claimed.error;
      current = claimed.data as AlertPage | null;
      if (!current) { exhausted = true; break; }
      const results = prepareAlertPage(current);
      const saved = await supabase.rpc("save_email_alert_page", {
        p_alert_id: current.alert_id, p_profile_id: current.profile_id,
        p_claim_token: current.claim_token, p_results: results
      });
      if (saved.error) throw saved.error;
      pages += 1;
      checked += saved.data?.checked ?? 0;
      prepared += saved.data?.prepared ?? 0;
      if (saved.data?.status === "invalidated") invalidated += 1;
      current = null;
    }
    const status = exhausted ? "succeeded" : "partial";
    const updated = await supabase.from("ingestion_runs").update({
      status, finished_at: new Date().toISOString(), pages_fetched: pages, records_seen: checked,
      metadata: { mode: "prepare_only", sends_email: false, prepared, invalidated, canceled: cleaned.data, page_budget: 6 }
    }).eq("id", run.data.id);
    if (updated.error) throw updated.error;
    return Response.json({ status, mode: "prepare_only", sends_email: false, pages, checked, prepared, invalidated });
  } catch {
    if (current) await supabase.rpc("fail_email_alert_page", {
      p_alert_id: current.alert_id, p_profile_id: current.profile_id, p_claim_token: current.claim_token
    });
    // Do not log profiles, addresses, payloads or secrets in failure messages.
    await supabase.from("ingestion_runs").update({
      status: "failed", finished_at: new Date().toISOString(), pages_fetched: pages, records_seen: checked,
      error_message: "Falha na preparação de alertas; nenhuma chamada de envio é feita por esta rotina."
    }).eq("id", run.data.id);
    console.error(JSON.stringify({ event: "email_alert_preparation_failed", runId: run.data.id }));
    return Response.json({ status: "failed", sends_email: false }, { status: 502 });
  }
});
