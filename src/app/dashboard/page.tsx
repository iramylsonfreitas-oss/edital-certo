import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fetchPublicPncpCatalog, filterPublicPncpRecords, parsePncpDate, type PublicPncpRecord } from "@/lib/pncp/public-catalog";
import { toSafeHttpUrl } from "@/lib/security/safe-url";
import { AppNavigation } from "@/components/app-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { scoreTender, type InterestProfile } from "@/lib/matching/score";
import { SearchFilters } from "./search-filters";
import { FavoriteCount, TenderOpportunityCard } from "./tender-card-actions";
import { formatSourceStatus } from "@/lib/ingestion/source-status";

export const dynamic = "force-dynamic";

const sortSchema = z.enum(["relevance", "deadline", "value"]);
const numericFilterSchema = z.coerce.number().finite().nonnegative();
type TenderSearchRow = { tender_id: string; search_rank: number; total_count: number };
type DatabaseTender = {
  id: string;
  title: string;
  object: string;
  items_search_text: string | null;
  ti_match_source: string;
  uf: string | null;
  municipality_name: string | null;
  municipality_code: string | null;
  estimated_value: number | null;
  modality_code: string | null;
  proposal_close_at: string | null;
  modality_name: string | null;
  exclusive_me_epp: boolean | null;
  agencies: { name: string; sphere: string | null }[] | { name: string; sphere: string | null } | null;
};
type ProfileRow = {
  required_keywords: string[]; optional_keywords: string[]; excluded_keywords: string[]; ufs: string[];
  municipality_codes: string[]; modality_codes: string[]; agency_terms: string[]; spheres: string[];
  minimum_value: number | null; maximum_value: number | null; exclusive_me_epp: boolean | null; cnae_codes: string[];
};

function parameter(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = numericFilterSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function pageHref(params: Record<string, string | string[] | undefined>, page: number): string {
  const search = new URLSearchParams();
  for (const key of ["q", "uf", "modality", "sphere", "minimumValue", "maximumValue", "closesBefore", "sort", "view", "showClosed"]) {
    const value = parameter(params[key]);
    if (value) search.set(key, value);
  }
  search.set("page", String(page));
  return `/dashboard?${search.toString()}`;
}

function formatDate(value: string | null): string | null {
  const date = parsePncpDate(value);
  return date
    ? date.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    : null;
}

function agencyName(record: PublicPncpRecord): string {
  return record.orgaoEntidade?.razaoSocial ?? "Órgão não informado";
}

function publicRecordUrl(record: PublicPncpRecord): string | null {
  return toSafeHttpUrl(record.linkSistemaOrigem);
}

function profileForScoring(profile: ProfileRow): InterestProfile {
  return {
    requiredKeywords: profile.required_keywords ?? [], optionalKeywords: profile.optional_keywords ?? [], excludedKeywords: profile.excluded_keywords ?? [],
    ufs: profile.ufs ?? [], municipalityCodes: profile.municipality_codes ?? [], modalityCodes: profile.modality_codes ?? [],
    agencyTerms: profile.agency_terms ?? [], spheres: profile.spheres ?? [], minimumValue: profile.minimum_value,
    maximumValue: profile.maximum_value, exclusiveMeEpp: profile.exclusive_me_epp, cnaeCodes: profile.cnae_codes ?? []
  };
}

function scoreForTender(tender: DatabaseTender, profiles: InterestProfile[]) {
  const agency = Array.isArray(tender.agencies) ? tender.agencies[0] : tender.agencies;
  const configuredProfiles = profiles.filter((profile) => profile.requiredKeywords.length + profile.optionalKeywords.length + profile.excludedKeywords.length + profile.ufs.length + profile.municipalityCodes.length + profile.modalityCodes.length + profile.agencyTerms.length + profile.spheres.length + profile.cnaeCodes.length > 0 || profile.minimumValue !== null || profile.maximumValue !== null || profile.exclusiveMeEpp !== null);
  if (!configuredProfiles.length) return null;
  return configuredProfiles.map((profile) => scoreTender(profile, {
    title: tender.title, object: tender.object, itemText: tender.items_search_text ?? "", uf: tender.uf, municipalityCode: tender.municipality_code, modalityCode: tender.modality_code,
    agencyName: agency?.name ?? null, sphere: agency?.sphere ?? null, estimatedValue: tender.estimated_value,
    exclusiveMeEpp: tender.exclusive_me_epp, cnaeCodes: []
  })).sort((first, second) => Number(second.matched) - Number(first.matched) || second.score - first.score)[0] ?? null;
}

function scoreStyle(score: number): string {
  if (score >= 80) return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200";
  if (score >= 50) return "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200";
  return "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200";
}

function deadlineBadge(value: string | null): { text: string; style: string } | null {
  if (!value) return null;
  const remainingDays = Math.ceil((new Date(value).getTime() - new Date().getTime()) / 86_400_000);
  if (remainingDays < 0) return { text: "Encerrada", style: "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200" };
  if (remainingDays === 0) return { text: "Encerra hoje", style: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200" };
  const style = remainingDays <= 3
    ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
    : remainingDays <= 7
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      : "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200";
  return { text: `Faltam ${remainingDays} dias`, style };
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: organizations } = await supabase.from("organizations").select("id").order("created_at", { ascending: true }).limit(1);
  if (!organizations?.length) redirect("/onboarding");
  const organizationId = organizations[0].id;

  const queryValue = parameter(params.q)?.trim().slice(0, 200) || null;
  const ufValue = parameter(params.uf)?.trim().toUpperCase() ?? "";
  const uf = /^[A-Z]{2}$/.test(ufValue) ? ufValue : null;
  const modality = parameter(params.modality)?.trim().slice(0, 20) || null;
  const sphereValue = parameter(params.sphere);
  const sphere = sphereValue === "F" || sphereValue === "E" || sphereValue === "M" ? sphereValue : null;
  const showClosed = parameter(params.showClosed) === "true";
  const requestedView = parameter(params.view);
  const view = requestedView === "favorites" || requestedView === "discarded" ? requestedView : "all";
  const minimumValue = parseOptionalNumber(parameter(params.minimumValue));
  const maximumValue = parseOptionalNumber(parameter(params.maximumValue));
  const closesBeforeValue = parameter(params.closesBefore);
  const closesBefore = closesBeforeValue && /^\d{4}-\d{2}-\d{2}$/.test(closesBeforeValue)
    ? new Date(`${closesBeforeValue}T23:59:59.999-03:00`).toISOString()
    : null;
  const requestedSort = sortSchema.safeParse(parameter(params.sort));
  const sort = requestedSort.success ? requestedSort.data : queryValue ? "relevance" : "deadline";
  const requestedPage = Number(parameter(params.page) ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100_000) : 1;
  const pageSize = 50;

  const [{ data: rawSearchRows, error: searchError }, { data: latestRun }, { count: sampleCount }, { count: favoriteCount }, { data: rawProfiles }] = await Promise.all([
    supabase.rpc("search_tenders_for_list", {
      p_query: queryValue,
      p_uf: uf,
      p_modality_code: modality,
      p_minimum_value: minimumValue,
      p_maximum_value: maximumValue,
      p_closes_before: closesBefore,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize,
      p_organization_id: organizationId,
      p_list_mode: view,
      p_sphere: sphere,
      p_show_closed: showClosed
    }),
    supabase
      .from("source_status")
      .select("status,started_at,finished_at,pages_fetched,records_seen,records_inserted,records_updated")
      .eq("source_key", "pncp")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("tenders").select("id", { count: "exact", head: true }).eq("is_ti", true),
    supabase.from("tender_feedback").select("tender_id", { count: "exact", head: true }).eq("organization_id", organizationId).eq("user_id", authData.user.id).eq("state", "favorite"),
    supabase.from("interest_profiles").select("required_keywords,optional_keywords,excluded_keywords,ufs,municipality_codes,modality_codes,agency_terms,spheres,minimum_value,maximum_value,exclusive_me_epp,cnae_codes").eq("organization_id", organizationId).eq("is_active", true)
  ]);

  const searchRows = (rawSearchRows ?? []) as TenderSearchRow[];
  const urgentLimit = new Date(new Date().getTime() + 3 * 86_400_000).toISOString();
  const { data: urgentRows } = await supabase.rpc("search_tenders_for_list", {
    p_query: queryValue, p_uf: uf, p_modality_code: modality, p_minimum_value: minimumValue, p_maximum_value: maximumValue,
    p_closes_before: urgentLimit, p_sort: "deadline", p_page: 1, p_page_size: 1, p_organization_id: organizationId,
    p_list_mode: view, p_sphere: sphere, p_show_closed: false
  });
  const searchOrder = new Map<string, number>();
  searchRows.forEach((row, index) => searchOrder.set(row.tender_id, index));
  const tenderIds = [...searchOrder.keys()];
  const { data: rawTenderRows } = tenderIds.length
    ? await supabase
      .from("tenders")
      .select("id,title,object,items_search_text,ti_match_source,uf,municipality_name,municipality_code,estimated_value,modality_code,proposal_close_at,modality_name,exclusive_me_epp,agencies(name,sphere)")
      .in("id", tenderIds)
    : { data: [] };
  const databaseTenders = ((rawTenderRows ?? []) as DatabaseTender[])
    .sort((first, second) => (searchOrder.get(first.id) ?? 0) - (searchOrder.get(second.id) ?? 0));
  const scoringProfiles = ((rawProfiles ?? []) as ProfileRow[]).map(profileForScoring);
  const currentTenderIds = databaseTenders.map((tender) => tender.id);
  const [{ data: feedbackRows }, { data: pipelineRows }] = currentTenderIds.length
    ? await Promise.all([
      supabase.from("tender_feedback").select("tender_id,state").eq("organization_id", organizationId).eq("user_id", authData.user.id).in("tender_id", currentTenderIds),
      supabase.from("pipeline_cards").select("tender_id").eq("organization_id", organizationId).in("tender_id", currentTenderIds)
    ])
    : [{ data: [] }, { data: [] }];
  const feedbackByTender = new Map((feedbackRows ?? []).map((item) => [item.tender_id, item.state]));
  const pipelineTenderIds = new Set((pipelineRows ?? []).map((item) => item.tender_id));

  let catalog = null;
  if (view === "all" && (searchError || databaseTenders.length === 0)) {
    try {
      catalog = await fetchPublicPncpCatalog();
    } catch {
      catalog = null;
    }
  }

  const filteredPublicRecords = catalog
    ? filterPublicPncpRecords(catalog.registros, {
      query: queryValue,
      uf,
      modality,
      sphere,
      minimumValue,
      maximumValue,
      closesBefore: closesBeforeValue && /^\d{4}-\d{2}-\d{2}$/.test(closesBeforeValue) ? closesBeforeValue : null,
      sort,
      showClosed
    })
    : [];
  const usePublicCatalog = databaseTenders.length === 0 && filteredPublicRecords.length > 0;
  const publicPageCount = Math.ceil(filteredPublicRecords.length / pageSize);
  const publicPageRecords = filteredPublicRecords.slice((page - 1) * pageSize, page * pageSize);
  const publicCount = usePublicCatalog ? filteredPublicRecords.length : 0;
  const totalCount = usePublicCatalog ? publicCount : (searchRows[0]?.total_count ?? 0);
  const pageCount = usePublicCatalog ? publicPageCount : Math.ceil(Number(totalCount) / pageSize);
  const activeFilterCount = [uf, modality, sphere, minimumValue, maximumValue, closesBefore, view !== "all" ? view : null, showClosed ? "closed" : null].filter((item) => item !== null).length;
  const filterValues = {
    query: queryValue ?? "", uf: uf ?? "", modality: modality ?? "", sphere: sphere ?? "",
    minimumValue: minimumValue == null ? "" : String(minimumValue), maximumValue: maximumValue == null ? "" : String(maximumValue),
    closesBefore: closesBeforeValue ?? "", sort, view, showClosed
  };
  const urgentCount = usePublicCatalog
    ? filteredPublicRecords.filter((record) => {
      const closeDate = parsePncpDate(record.dataEncerramentoProposta);
      return closeDate !== null && closeDate >= new Date() && closeDate <= new Date(urgentLimit);
    }).length
    : (urgentRows?.[0]?.total_count ?? 0);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 pb-28 sm:px-6 md:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700">
        <div>
          <Link className="text-sm font-semibold text-blue-700" href="/">Edital Certo</Link>
          <h1 className="mt-2 text-2xl font-bold">Oportunidades</h1>
        </div>
        <AppNavigation active="/dashboard" />
        <nav className="hidden flex-wrap gap-3 text-sm font-medium md:flex">
          <Link href="/profiles">Perfis</Link>
          <Link href="/alerts">Alertas</Link>
          <Link href="/settings/privacy">Privacidade</Link>
        </nav>
      </header>
      <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">Conectado como {authData.user.email ?? "usuário"}.</p>
      <aside aria-label="Status da fonte PNCP" className="mt-5 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
        <strong>Fonte PNCP: </strong>
        {latestRun
          ? formatSourceStatus(latestRun)
          : catalog?.atualizadoEm
            ? `Catálogo atualizado em ${new Date(catalog.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }).replace(",", " às")} · ${catalog.registros.length} registros · ${catalog.status === "ok" ? "coleta concluída" : catalog.status === "parcial" ? "coleta parcial" : "última coleta com erro"}`
            : (sampleCount ?? 0) > 0
              ? "Catálogo salvo disponível. Não foi possível consultar o status da última coleta agora."
              : "Catálogo PNCP indisponível no momento"}
      </aside>
      {parameter(params.notice) === "saved" ? <p aria-live="polite" className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Alteração salva.</p> : null}
      {parameter(params.notice) === "save-error" || parameter(params.notice) === "invalid-action" ? <p role="alert" className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">Não foi possível concluir essa ação. Atualize a página e tente novamente.</p> : null}

      <section aria-label="Resumo das oportunidades" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Oportunidades de TI no catálogo", value: (sampleCount ?? catalog?.registros.length ?? 0).toLocaleString("pt-BR") },
          { label: "Resultados dos filtros", value: Number(totalCount).toLocaleString("pt-BR") },
          { label: "Encerram em até 3 dias", value: Number(urgentCount).toLocaleString("pt-BR") },
          { label: "Favoritas", value: (favoriteCount ?? 0).toLocaleString("pt-BR") }
        ].map((metric) => <article className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800" key={metric.label}><p className="text-xs text-slate-600 dark:text-slate-300 sm:text-sm">{metric.label}</p><p className="mt-2 text-2xl font-bold">{metric.label === "Favoritas" ? <FavoriteCount key={favoriteCount ?? 0} initialCount={favoriteCount ?? 0} /> : metric.value}</p></article>)}
      </section>

      <div className="mt-6 grid items-start gap-5 md:grid-cols-[260px_minmax(0,1fr)]">
        <aside aria-label="Filtros das oportunidades" className="md:sticky md:top-4"><SearchFilters activeCount={activeFilterCount} values={filterValues} /></aside>
        <div className="min-w-0">

      {usePublicCatalog ? (
        <>
          <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">
            {publicCount.toLocaleString("pt-BR")} oportunidades do catálogo público · página {page} de {Math.max(1, pageCount)} · leitura somente para consulta
          </p>
          <section className="mt-3 grid gap-3" aria-label="Oportunidades do catálogo PNCP">
            {publicPageRecords.map((record) => {
              const sourceUrl = publicRecordUrl(record);
              const closeDate = formatDate(record.dataEncerramentoProposta ?? null);
              const value = typeof record.valorTotalEstimado === "number" && record.valorTotalEstimado > 0
                ? record.valorTotalEstimado.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                : "Valor não informado";
              const details = `${record.modalidadeNome ?? "Modalidade não informada"} · ${value}${closeDate ? ` · Prazo: ${closeDate}` : ""}`;
              return (
                <article className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-700 dark:bg-slate-800" key={record.numeroControlePNCP}>
                  <div className="flex flex-wrap justify-between gap-3">
                    <h2 className="max-w-3xl font-semibold">{record.objetoCompra.slice(0, 512)}</h2>
                    <span className="text-sm text-slate-600 dark:text-slate-300">{record.unidadeOrgao?.ufSigla ?? "UF não informada"}</span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{agencyName(record)}</p>
                  <p className="mt-3 text-sm">{details}</p>
                  {sourceUrl ? (
                    <a className="mt-4 inline-flex rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" href={sourceUrl} rel="noopener noreferrer" target="_blank">
                      Consultar edital no portal oficial
                    </a>
                  ) : (
                    <p className="mt-4 text-sm text-slate-500">O registro não tem link oficial de origem.</p>
                  )}
                </article>
              );
            })}
          </section>
          <nav aria-label="Paginação" className="mt-6 flex justify-between">
            {page > 1 ? <Link className="font-semibold text-blue-700" href={pageHref(params, page - 1)}>← Anterior</Link> : <span />}
            {page < pageCount ? <Link className="font-semibold text-blue-700" href={pageHref(params, page + 1)}>Próxima →</Link> : null}
          </nav>
        </>
      ) : databaseTenders.length ? (
        <>
          <p className="mt-6 text-sm text-slate-600 dark:text-slate-300">{Number(totalCount).toLocaleString("pt-BR")} oportunidade(s) encontradas · página {page} de {Math.max(1, pageCount)}</p>
          <section className="mt-3 grid gap-3">
            {databaseTenders.map((tender) => {
              const bestMatch = scoreForTender(tender, scoringProfiles);
              const deadline = deadlineBadge(tender.proposal_close_at);
              return <TenderOpportunityCard
                key={tender.id}
                tenderId={tender.id}
                organizationId={organizationId}
                userId={authData.user.id}
                initialFeedback={feedbackByTender.get(tender.id) ?? null}
                initiallyInPipeline={pipelineTenderIds.has(tender.id)}
                listMode={view}
              >
                <div className="flex flex-wrap justify-between gap-3">
                  <h2 className="max-w-3xl font-semibold"><Link className="hover:text-blue-700" href={`/tenders/${tender.id}`}>{tender.title}</Link></h2>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{tender.uf ?? "UF não informada"}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{tender.agencies && Array.isArray(tender.agencies) ? tender.agencies.map((agency) => agency.name).join(", ") : tender.agencies?.name ?? ""}</p>
                <p className="mt-3 text-sm">{tender.modality_name ?? "Modalidade não informada"} · {tender.estimated_value == null ? "Valor não informado" : tender.estimated_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{tender.proposal_close_at ? ` · Prazo: ${new Date(tender.proposal_close_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {tender.ti_match_source === "items" ? <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">TI identificada nos itens</span> : null}
                  {bestMatch ? <span className={`rounded-full px-3 py-1 text-xs font-bold ${scoreStyle(bestMatch.score)}`}>{bestMatch.score >= 80 ? "Alta" : bestMatch.score >= 50 ? "Média" : "Baixa"} aderência · {bestMatch.score}/100</span> : null}
                  {deadline ? <span className={`rounded-full px-3 py-1 text-xs font-semibold ${deadline.style}`}>{deadline.text}</span> : null}
                </div>
                {bestMatch?.explanation.length ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{bestMatch.explanation.slice(0, 2).join(" · ")}</p> : null}
              </TenderOpportunityCard>;
            })}
          </section>
          <nav aria-label="Paginação" className="mt-6 flex justify-between">
            {page > 1 ? <Link className="font-semibold text-blue-700" href={pageHref(params, page - 1)}>← Anterior</Link> : <span />}
            {page < pageCount ? <Link className="font-semibold text-blue-700" href={pageHref(params, page + 1)}>Próxima →</Link> : null}
          </nav>
        </>
      ) : (
        <section className="mt-12 rounded-2xl border border-dashed border-slate-300 p-8 text-center">
          <h2 className="text-lg font-semibold">Nenhuma licitação encontrada</h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            {searchError
              ? "O catálogo do PNCP está temporariamente indisponível. Tente novamente mais tarde."
              : "Confira os filtros ou aguarde a próxima atualização do catálogo público do PNCP."}
          </p>
        </section>
        )}
        </div>
      </div>
    </main>
  );
}
