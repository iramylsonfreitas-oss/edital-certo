import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { composeDigest, type DigestOpportunity } from "@/lib/alerts/digest";

export const dynamic = "force-dynamic";
type TenderRow = { id: string; title: string; uf: string | null; estimated_value: number | null; proposal_close_at: string; raw_data: { situacaoCompraId?: number }; agencies: { name: string } | { name: string }[] | null };
const fields = "id,title,uf,estimated_value,proposal_close_at,raw_data,agencies(name)";
function opportunity(row: TenderRow, score: number | null, explanation: string[]): DigestOpportunity {
  const agency = Array.isArray(row.agencies) ? row.agencies[0] : row.agencies;
  return { id: row.id, title: row.title, uf: row.uf, agency: agency?.name ?? null, estimatedValue: row.estimated_value, deadline: row.proposal_close_at, score, explanation };
}

export default async function AlertPreviewPage() {
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const now = new Date();
  const queued = await supabase.from("email_alert_queue")
    .select(`score,explanation,tenders!inner(${fields}),alerts!inner(is_enabled,email_enabled),interest_profiles!inner(is_active)`)
    .eq("recipient_user_id", auth.user.id).eq("status", "prepared")
    .eq("alerts.is_enabled", true).eq("alerts.email_enabled", true).eq("interest_profiles.is_active", true)
    .gt("tenders.proposal_close_at", now.toISOString()).order("ready_at").limit(20);
  let failed = Boolean(queued.error);
  let example = false;
  let records: DigestOpportunity[] = [];
  if (!failed) {
    const rows = (queued.data ?? []) as unknown as { score: number; explanation: string[]; tenders: TenderRow | TenderRow[] }[];
    records = rows.flatMap((row) => {
      const tender = Array.isArray(row.tenders) ? row.tenders[0] : row.tenders;
      return tender && String(tender.raw_data.situacaoCompraId) === "1" ? [opportunity(tender, row.score, row.explanation)] : [];
    });
    if (!records.length) {
      example = true;
      const sample = await supabase.from("tenders").select(fields).eq("source_key", "pncp").eq("is_ti", true)
        .eq("raw_data->>situacaoCompraId", "1").gt("proposal_close_at", now.toISOString()).order("proposal_close_at").limit(3);
      failed = Boolean(sample.error);
      records = ((sample.data ?? []) as unknown as TenderRow[]).map((row) => opportunity(row, null, []));
    }
  }
  const content = !failed && records.length ? composeDigest(records, now, example) : null;
  return <main className="mx-auto min-h-screen max-w-4xl px-4 py-8">
    <Link className="text-blue-700 underline" href="/alerts">← Configurações de alerta</Link>
    <h1 className="mt-5 text-3xl font-bold">Prévia do e-mail</h1>
    <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">Nenhum e-mail será enviado ao abrir esta página. {example ? "Como sua fila não tem oportunidades válidas disponíveis para a prévia, mostramos apenas um exemplo de formato com licitações reais do catálogo, sem pontuação de aderência." : "Esta é uma prévia das oportunidades da sua fila. Os critérios e os prazos precisam ser conferidos novamente antes de uma futura entrega."}</p>
    {content ? <>
      <p className="mt-5 text-sm"><strong>Assunto:</strong> {content.subject}</p>
      <iframe className="mt-4 h-[900px] w-full rounded-xl border border-slate-300 bg-white" title="Modelo de e-mail do Edital Certo" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={content.html} />
      <details className="mt-5 rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer font-semibold">Ver versão em texto</summary><pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm">{content.text}</pre></details>
    </> : <p className="mt-6 rounded-xl border border-slate-300 p-5">{failed ? "Não foi possível carregar a prévia agora. Atualize a página para tentar novamente." : "Não há licitações com prazo futuro disponíveis para a prévia agora."}</p>}
  </main>;
}
