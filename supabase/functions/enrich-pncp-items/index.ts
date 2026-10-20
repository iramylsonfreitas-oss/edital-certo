import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { parseTenderItems, tenderReference } from "../../../src/lib/connectors/pncp/item-schema.ts";

interface Job { tender_id: string; source_id: string; page: number; claim_token: string }
class SourceError extends Error {
  constructor(message: string, readonly rateLimited = false) { super(message); }
}
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const created = await supabase.from("ingestion_runs").insert({ source_key: "pncp-items", status: "running" }).select("id").single();
  if (created.error) return new Response("Não foi possível registrar a execução.", { status: 500 });
  let pages = 0, items = 0, completed = 0, failed = 0, lastRequestAt = 0;
  let exhausted = false;
  try {
    while (pages < 8 && Date.now() - startedAt < 75_000) {
      const claimed = await supabase.rpc("claim_pncp_item_job");
      if (claimed.error) throw claimed.error;
      const job = (claimed.data as Job[] | null)?.[0];
      if (!job) { exhausted = true; break; }
      let rateLimited = false;
      try {
        const reference = tenderReference(job.source_id);
        if (!reference) throw new SourceError("Identificador PNCP inválido.");
        const wait = 6_000 - (Date.now() - lastRequestAt);
        if (lastRequestAt && wait > 0) await pause(wait);
        lastRequestAt = Date.now();
        pages += 1;
        const response = await fetch(`${reference.apiUrl}/itens?pagina=${job.page}&tamanhoPagina=50`, {
          headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000)
        });
        if (!response.ok && response.status !== 204) throw new SourceError(`PNCP HTTP ${response.status}.`, response.status === 429);
        const records = response.status === 204 ? [] : parseTenderItems(await response.json());
        if (records.length > 50) throw new SourceError("PNCP excedeu o tamanho de página solicitado.");
        const saved = await supabase.rpc("save_pncp_item_page", {
          p_tender_id: job.tender_id, p_claim_token: job.claim_token, p_page: job.page,
          p_has_more: records.length === 50,
          p_items: records.map((item) => ({
            item_number: item.number, description: item.description, unit: item.unit, quantity: item.quantity,
            unit_value: item.unitValue, total_value: item.totalValue, budget_is_secret: item.budgetIsSecret,
            status: item.status, catalog_code: item.catalogCode
          }))
        });
        if (saved.error) throw saved.error;
        items += records.length;
        if (saved.data?.status === "succeeded") completed += 1;
      } catch (error) {
        failed += 1;
        rateLimited = error instanceof SourceError && error.rateLimited;
        const message = error instanceof Error ? error.message : "Falha ao salvar a página de itens.";
        const released = await supabase.rpc("fail_pncp_item_job", {
          p_tender_id: job.tender_id, p_claim_token: job.claim_token, p_error: message, p_rate_limited: rateLimited
        });
        if (released.error) throw released.error;
        console.warn(JSON.stringify({ event: "pncp_items_page_failed", tenderId: job.tender_id, page: job.page, rateLimited, message }));
        if (rateLimited) break;
      }
    }
    const status = exhausted && failed === 0 ? "succeeded" : "partial";
    const updated = await supabase.from("ingestion_runs").update({
      status, finished_at: new Date().toISOString(), pages_fetched: pages, records_seen: items,
      metadata: { completed_tenders: completed, failed_pages: failed, page_budget: 8 }
    }).eq("id", created.data.id);
    if (updated.error) throw updated.error;
    return Response.json({ status, pages, items, completed, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Falha na rotina de itens.";
    await supabase.from("ingestion_runs").update({ status: "failed", finished_at: new Date().toISOString(), pages_fetched: pages, records_seen: items, error_message: message.slice(0, 500) }).eq("id", created.data.id);
    console.error(JSON.stringify({ event: "pncp_items_failed", message }));
    return Response.json({ status: "failed" }, { status: 502 });
  }
});
