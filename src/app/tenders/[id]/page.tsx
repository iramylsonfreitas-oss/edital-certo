import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toSafeHttpUrl } from "@/lib/security/safe-url";
import { FeedbackControls } from "./feedback-controls";

export const dynamic = "force-dynamic";

export default async function TenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const [{ data: tender, error }, { data: organizations }, { data: feedback }] = await Promise.all([
    supabase
      .from("tenders")
      .select("id,title,object,uf,municipality_name,municipality_code,estimated_value,proposal_open_at,proposal_close_at,published_at,source_updated_at,official_url,modality_name,status,agencies(name,cnpj,sphere)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("organizations").select("id,name").order("created_at"),
    supabase.from("tender_feedback").select("organization_id,state").eq("tender_id", id).eq("user_id", authData.user.id)
  ]);

  if (error || !tender) notFound();

  const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informado";
  const agency = tender.agencies && Array.isArray(tender.agencies) ? tender.agencies[0] : tender.agencies;
  const officialUrl = toSafeHttpUrl(tender.official_url);

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 sm:px-6">
      <Link className="text-sm text-blue-700" href="/dashboard">← Oportunidades</Link>
      <article className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-800 sm:p-8">
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span>{tender.uf ?? "UF não informada"}</span>
          <span aria-hidden="true">·</span>
          <span>{tender.modality_name ?? "Modalidade não informada"}</span>
          <span aria-hidden="true">·</span>
          <span>{tender.status ?? "Situação não informada"}</span>
        </div>
        <h1 className="mt-4 text-3xl font-bold">{tender.title}</h1>
        <p className="mt-5 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{tender.object}</p>
        <dl className="mt-8 grid gap-5 sm:grid-cols-2">
          <div><dt className="text-sm text-slate-500">Órgão</dt><dd className="mt-1 font-medium">{agency?.name ?? "Não informado"}</dd></div>
          <div><dt className="text-sm text-slate-500">CNPJ do órgão</dt><dd className="mt-1 font-medium">{agency?.cnpj ?? "Não informado"}</dd></div>
          <div><dt className="text-sm text-slate-500">Local</dt><dd className="mt-1 font-medium">{[tender.municipality_name, tender.uf].filter(Boolean).join(" / ") || "Não informado"}</dd></div>
          <div><dt className="text-sm text-slate-500">Valor estimado</dt><dd className="mt-1 font-medium">{tender.estimated_value == null ? "Não informado" : tender.estimated_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</dd></div>
          <div><dt className="text-sm text-slate-500">Abertura de propostas</dt><dd className="mt-1 font-medium">{date(tender.proposal_open_at)}</dd></div>
          <div><dt className="text-sm text-slate-500">Encerramento de propostas</dt><dd className="mt-1 font-medium">{date(tender.proposal_close_at)}</dd></div>
          <div><dt className="text-sm text-slate-500">Publicação no PNCP</dt><dd className="mt-1 font-medium">{date(tender.published_at)}</dd></div>
          <div><dt className="text-sm text-slate-500">Última atualização da fonte</dt><dd className="mt-1 font-medium">{date(tender.source_updated_at)}</dd></div>
        </dl>
        {officialUrl ? (
          <a className="mt-8 inline-flex rounded-lg bg-blue-700 px-4 py-3 font-semibold text-white" href={officialUrl} rel="noopener noreferrer" target="_blank">
            Abrir fonte oficial
          </a>
        ) : (
          <p className="mt-8 text-sm text-slate-500">O registro não informou um link direto para a fonte oficial.</p>
        )}
        <FeedbackControls tenderId={tender.id} organizations={organizations ?? []} feedback={(feedback ?? []).filter((item) => item.state === "favorite" || item.state === "discarded")} />
      </article>
    </main>
  );
}

