import Link from "next/link";
import { redirect } from "next/navigation";
import { z } from "zod";
import { fetchPublicPncpCatalog, filterPublicPncpRecords, parsePncpDate, type PublicPncpRecord } from "@/lib/pncp/public-catalog";
import { toSafeHttpUrl } from "@/lib/security/safe-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const sortSchema = z.enum(["relevance", "deadline", "value"]);
const numericFilterSchema = z.coerce.number().finite().nonnegative();
type TenderSearchRow = { tender_id: string; search_rank: number; total_count: number };
type DatabaseTender = {
  id: string;
  title: string;
  uf: string | null;
  municipality_name: string | null;
  estimated_value: number | null;
  proposal_close_at: string | null;
  modality_name: string | null;
  agencies: { name: string }[] | { name: string } | null;
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
  for (const key of ["q", "uf", "modality", "minimumValue", "maximumValue", "closesBefore", "sort"]) {
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

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) redirect("/login");

  const { data: organizations } = await supabase.from("organizations").select("id").limit(1);
  if (!organizations?.length) redirect("/onboarding");

  const queryValue = parameter(params.q)?.trim().slice(0, 200) || null;
  const ufValue = parameter(params.uf)?.trim().toUpperCase() ?? "";
  const uf = /^[A-Z]{2}$/.test(ufValue) ? ufValue : null;
  const modality = parameter(params.modality)?.trim().slice(0, 20) || null;
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

  const [{ data: rawSearchRows, error: searchError }, { data: latestRun }] = await Promise.all([
    supabase.rpc("search_tenders", {
      p_query: queryValue,
      p_uf: uf,
      p_modality_code: modality,
      p_minimum_value: minimumValue,
      p_maximum_value: maximumValue,
      p_closes_before: closesBefore,
      p_sort: sort,
      p_page: page,
      p_page_size: pageSize
    }),
    supabase
      .from("source_status")
      .select("status,started_at")
      .eq("source_key", "pncp")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const searchRows = (rawSearchRows ?? []) as TenderSearchRow[];
  const searchOrder = new Map<string, number>();
  searchRows.forEach((row, index) => searchOrder.set(row.tender_id, index));
  const tenderIds = [...searchOrder.keys()];
  const { data: rawTenderRows } = tenderIds.length
    ? await supabase
      .from("tenders")
      .select("id,title,uf,municipality_name,estimated_value,proposal_close_at,modality_name,agencies(name)")
      .in("id", tenderIds)
    : { data: [] };
  const databaseTenders = ((rawTenderRows ?? []) as DatabaseTender[])
    .sort((first, second) => (searchOrder.get(first.id) ?? 0) - (searchOrder.get(second.id) ?? 0));

  let catalog = null;
  if (searchError || databaseTenders.length === 0) {
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
      minimumValue,
      maximumValue,
      closesBefore: closesBeforeValue && /^\d{4}-\d{2}-\d{2}$/.test(closesBeforeValue) ? closesBeforeValue : null,
      sort
    })
    : [];
  const usePublicCatalog = databaseTenders.length === 0 && filteredPublicRecords.length > 0;
  const publicPageCount = Math.ceil(filteredPublicRecords.length / pageSize);
  const publicPageRecords = filteredPublicRecords.slice((page - 1) * pageSize, page * pageSize);
  const publicCount = usePublicCatalog ? filteredPublicRecords.length : 0;
  const totalCount = usePublicCatalog ? publicCount : (searchRows[0]?.total_count ?? 0);
  const pageCount = usePublicCatalog ? publicPageCount : Math.ceil(Number(totalCount) / pageSize);

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-8 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-700">
        <div>
          <Link className="text-sm font-semibold text-blue-700" href="/">Edital Certo</Link>
          <h1 className="mt-2 text-2xl font-bold">Oportunidades</h1>
        </div>
        <nav className="flex flex-wrap gap-4 text-sm font-medium">
          <Link href="/profiles">Perfis</Link>
          <Link href="/alerts">Alertas</Link>
          <Link href="/settings/privacy">Privacidade</Link>
        </nav>
      </header>
      <p className="mt-5 text-sm text-slate-600 dark:text-slate-300">Conectado como {authData.user.email ?? "usuário"}.</p>
      <aside aria-label="Status da fonte PNCP" className="mt-5 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-700">
        <strong>Fonte PNCP: </strong>
        {latestRun
          ? `${latestRun.status === "succeeded" ? "Operacional" : latestRun.status === "running" || latestRun.status === "partial" ? "Em execução" : "Com falha"} · última execução ${new Date(latestRun.started_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`
          : catalog?.atualizadoEm
            ? `Catálogo atualizado em ${new Date(catalog.atualizadoEm).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${catalog.registros.length} registros · ${catalog.status === "ok" ? "coleta concluída" : catalog.status === "parcial" ? "coleta parcial" : "última coleta com erro"}`
            : "Catálogo PNCP indisponível no momento"}
      </aside>

      <form action="/dashboard" className="mt-6 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium lg:col-span-2">Palavras ou expressão
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={queryValue ?? ""} maxLength={200} name="q" placeholder="notebook, suporte técnico..." />
        </label>
        <label className="text-sm font-medium">UF
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 uppercase text-slate-900" defaultValue={uf ?? ""} maxLength={2} name="uf" placeholder="SP" />
        </label>
        <label className="text-sm font-medium">Código da modalidade
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={modality ?? ""} name="modality" inputMode="numeric" />
        </label>
        <label className="text-sm font-medium">Valor mínimo (R$)
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={minimumValue ?? ""} min="0" name="minimumValue" type="number" />
        </label>
        <label className="text-sm font-medium">Valor máximo (R$)
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={maximumValue ?? ""} min="0" name="maximumValue" type="number" />
        </label>
        <label className="text-sm font-medium">Encerramento até
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={closesBeforeValue ?? ""} name="closesBefore" type="date" />
        </label>
        <label className="text-sm font-medium">Ordenar por
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={sort} name="sort">
            <option value="relevance">Relevância</option><option value="deadline">Prazo</option><option value="value">Maior valor</option>
          </select>
        </label>
        <div className="flex items-end gap-3">
          <button className="rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white" type="submit">Buscar</button>
          <Link className="rounded-lg border border-slate-300 px-4 py-2 font-semibold" href="/dashboard">Limpar</Link>
        </div>
      </form>

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
            {databaseTenders.map((tender) => (
              <Link className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-400 dark:border-slate-700 dark:bg-slate-800" href={`/tenders/${tender.id}`} key={tender.id}>
                <div className="flex flex-wrap justify-between gap-3">
                  <h2 className="max-w-3xl font-semibold">{tender.title}</h2>
                  <span className="text-sm text-slate-600 dark:text-slate-300">{tender.uf ?? "UF não informada"}</span>
                </div>
                <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{tender.agencies && Array.isArray(tender.agencies) ? tender.agencies.map((agency) => agency.name).join(", ") : tender.agencies?.name ?? ""}</p>
                <p className="mt-3 text-sm">{tender.modality_name ?? "Modalidade não informada"} · {tender.estimated_value == null ? "Valor não informado" : tender.estimated_value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}{tender.proposal_close_at ? ` · Prazo: ${new Date(tender.proposal_close_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}</p>
              </Link>
            ))}
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
    </main>
  );
}
