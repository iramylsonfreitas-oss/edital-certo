import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toSafeHttpUrl } from "@/lib/security/safe-url";
import { FeedbackControls } from "./feedback-controls";
import { AppNavigation } from "@/components/app-navigation";
import { tenderReference } from "@/lib/connectors/pncp/attachments";
import { TenderFiles, TenderItems } from "./attachments";

export const dynamic = "force-dynamic";

export default async function TenderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const query = await searchParams;
  const requestedPage = typeof query.itemsPage === "string" ? Number(query.itemsPage) : 1;
  const itemsPage = Number.isSafeInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 1000 ? requestedPage : 1;
  const [{ data: tender, error }, { data: organizations }, { data: feedback }] = await Promise.all([
    supabase
      .from("tenders")
      .select("id,source_key,source_id,title,object,uf,municipality_name,municipality_code,estimated_value,proposal_open_at,proposal_close_at,published_at,source_updated_at,official_url,modality_name,status,agencies(name,cnpj,sphere)")
      .eq("id", id)
      .maybeSingle(),
    supabase.from("organizations").select("id,name").order("created_at"),
    supabase.from("tender_feedback").select("organization_id,state").eq("tender_id", id).eq("user_id", authData.user.id)
  ]);

  if (error || !tender) notFound();

  const date = (value: string | null) => value ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informado";
  const agency = tender.agencies && Array.isArray(tender.agencies) ? tender.agencies[0] : tender.agencies;
  const sourceId = tender.source_key === "pncp" ? tender.source_id : "";
  const officialUrl = toSafeHttpUrl(tender.official_url) ?? tenderReference(sourceId)?.portalUrl;

  return (
    <main className="mx-auto min-h-screen max-w-4xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
      <header className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-700">
        <Link className="text-sm text-blue-700" href="/dashboard">← Oportunidades</Link>
        <AppNavigation active="/dashboard" />
      </header>
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
        <section className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700" id="itens">
          <h2 className="text-xl font-bold">Itens da licitação</h2>
          <Suspense key={`${sourceId}:${itemsPage}`} fallback={<p role="status" className="mt-3 text-sm text-slate-500">Consultando itens no PNCP…</p>}>
            <TenderItems sourceId={sourceId} tenderId={tender.id} page={itemsPage} />
          </Suspense>
        </section>
        <section className="mt-8 border-t border-slate-200 pt-6 dark:border-slate-700">
          <h2 className="text-xl font-bold">Arquivos e documentos</h2>
          <Suspense key={sourceId} fallback={<p role="status" className="mt-3 text-sm text-slate-500">Consultando documentos no PNCP…</p>}>
            <TenderFiles sourceId={sourceId} />
          </Suspense>
        </section>
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

