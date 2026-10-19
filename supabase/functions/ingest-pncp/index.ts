import { createClient } from "npm:@supabase/supabase-js@2.118.0";

type JsonObject = Record<string, unknown>;

interface PncpPage {
  data: JsonObject[];
  totalPaginas: number;
  numeroPagina: number;
  paginasRestantes: number;
}

interface Checkpoint {
  fromDate: string;
  toDate: string;
  modalityIndex: number;
  page: number;
}

const sourceKey = "pncp";
const pageSize = 50;
// O PNCP limitou a consulta depois de cerca de doze páginas em teste real.
// Rodadas menores e pausas maiores reduzem novos HTTP 429; o checkpoint
// permite continuar na próxima execução agendada.
const maximumPagesPerRun = 10;
const minimumPauseBetweenRequestsMs = 6_000;
const requestTimeoutMs = 30_000;
const maximumRequestAttempts = 3;
const verifiedModalityCodes = new Set([4, 6, 8]);
let lastRequestStartedAt = 0;

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  return value;
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10).replaceAll("-", "");
}

function parseCheckpoint(value: unknown): Checkpoint | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (
    typeof row.fromDate !== "string" ||
    typeof row.toDate !== "string" ||
    typeof row.modalityIndex !== "number" ||
    typeof row.page !== "number"
  ) return null;
  return {
    fromDate: row.fromDate,
    toDate: row.toDate,
    modalityIndex: row.modalityIndex,
    page: row.page
  };
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parsePage(value: unknown): PncpPage {
  if (!isObject(value) || !Array.isArray(value.data)) {
    throw new Error("Envelope de resposta PNCP não reconhecido; compare com o Swagger atual.");
  }
  const { totalPaginas, numeroPagina, paginasRestantes } = value;
  if (
    typeof totalPaginas !== "number" ||
    typeof numeroPagina !== "number" ||
    typeof paginasRestantes !== "number"
  ) {
    throw new Error("Campos de paginação PNCP ausentes; compare com o Swagger atual.");
  }
  const records = value.data.filter(isObject);
  if (records.length !== value.data.length) {
    throw new Error("A página PNCP contém registros que não são objetos JSON.");
  }
  return { data: records, totalPaginas, numeroPagina, paginasRestantes };
}

function asNullableString(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  return null;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function asBrazilianTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  if (/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value)) {
    const instant = new Date(value);
    return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour = "00", minute = "00", second = "00", fraction = "0"] = match;
  const wallClock = Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second), Math.trunc(Number(`0.${fraction}`) * 1000));
  const getOffset = (instant: Date) => {
    const offset = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      timeZoneName: "longOffset",
      hour: "2-digit"
    }).formatToParts(instant).find((part) => part.type === "timeZoneName")?.value;
    const offsetMatch = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset ?? "");
    if (!offsetMatch) throw new Error("Não foi possível interpretar o fuso horário de Brasília.");
    const sign = offsetMatch[1] === "+" ? 1 : -1;
    return sign * (Number(offsetMatch[2]) * 60 + Number(offsetMatch[3]));
  };
  let offsetMinutes = getOffset(new Date(wallClock));
  let instant = wallClock - offsetMinutes * 60_000;
  offsetMinutes = getOffset(new Date(instant));
  instant = wallClock - offsetMinutes * 60_000;
  return new Date(instant).toISOString();
}

function mapTender(raw: JsonObject) {
  const controlNumber = asNullableString(raw.numeroControlePNCP);
  const objectText = asNullableString(raw.objetoCompra);
  if (!controlNumber || !objectText) {
    throw new Error("Campos numeroControlePNCP ou objetoCompra ausentes na resposta PNCP.");
  }

  const agency = isObject(raw.orgaoEntidade) ? raw.orgaoEntidade : null;
  const unit = isObject(raw.unidadeOrgao) ? raw.unidadeOrgao : null;
  const agencyName = asNullableString(agency?.razaoSocial);
  const agencyCnpj = asNullableString(agency?.cnpj);

  return {
    source_key: sourceKey,
    source_id: controlNumber,
    control_number: controlNumber,
    title: objectText.trim().slice(0, 512) || controlNumber,
    object: objectText,
    modality_code: asNullableString(raw.modalidadeId),
    modality_name: asNullableString(raw.modalidadeNome),
    status: asNullableString(raw.situacaoCompraNome),
    uf: asNullableString(unit?.ufSigla)?.toUpperCase(),
    municipality_code: asNullableString(unit?.codigoIbge ?? unit?.municipioId),
    municipality_name: asNullableString(unit?.municipioNome),
    estimated_value: asNullableNumber(raw.valorTotalEstimado),
    published_at: asBrazilianTimestamp(raw.dataPublicacaoPncp),
    proposal_open_at: asBrazilianTimestamp(raw.dataAberturaProposta),
    proposal_close_at: asBrazilianTimestamp(raw.dataEncerramentoProposta),
    source_updated_at: asBrazilianTimestamp(raw.dataAtualizacao),
    official_url: asNullableString(raw.linkSistemaOrigem),
    raw_data: raw,
    agency: agencyName
      ? {
          source_key: sourceKey,
          source_agency_id: agencyCnpj ?? agencyName,
          cnpj: agencyCnpj,
          name: agencyName,
          sphere: asNullableString(agency?.esferaId),
          uf: asNullableString(unit?.ufSigla)?.toUpperCase(),
          municipality_code: asNullableString(unit?.codigoIbge ?? unit?.municipioId),
          municipality_name: asNullableString(unit?.municipioNome)
        }
      : null
  };
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url: URL): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maximumRequestAttempts; attempt += 1) {
    try {
      const pauseRemaining = minimumPauseBetweenRequestsMs - (Date.now() - lastRequestStartedAt);
      if (lastRequestStartedAt > 0 && pauseRemaining > 0) await delay(pauseRemaining);
      lastRequestStartedAt = Date.now();
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: AbortSignal.timeout(requestTimeoutMs)
      });
      if (response.ok) return response;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`PNCP respondeu HTTP ${response.status}.`);
      }
      lastError = new Error(`PNCP respondeu HTTP ${response.status}.`);
      if (attempt === maximumRequestAttempts - 1) break;

      const retryAfter = response.headers.get("retry-after");
      const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
      const retryAfterDate = retryAfter && !Number.isFinite(retryAfterSeconds)
        ? Date.parse(retryAfter)
        : Number.NaN;
      const serverDelayMs = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : Number.isFinite(retryAfterDate)
        ? Math.max(0, retryAfterDate - Date.now())
        : 0;
      const exponentialDelayMs = response.status === 429
        ? Math.min(15_000 * (2 ** attempt), 60_000)
        : Math.min(2_000 * (2 ** attempt), 10_000);
      await delay(Math.max(serverDelayMs, exponentialDelayMs));
    } catch (error) {
      lastError = error;
      if (error instanceof Error && error.message.startsWith("PNCP respondeu HTTP 4")) throw error;
      if (attempt < maximumRequestAttempts - 1) {
        await delay(Math.min(2_000 * (2 ** attempt), 10_000));
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Falha de rede no PNCP após novas tentativas.");
}

function makePageUrl(baseUrl: string, fromDate: string, toDate: string, modalityCode: number, page: number): URL {
  const url = new URL("v1/contratacoes/publicacao", `${baseUrl.replace(/\/$/, "")}/`);
  url.searchParams.set("dataInicial", fromDate);
  url.searchParams.set("dataFinal", toDate);
  url.searchParams.set("codigoModalidadeContratacao", String(modalityCode));
  url.searchParams.set("pagina", String(page));
  url.searchParams.set("tamanhoPagina", String(pageSize));
  return url;
}

async function savePage(supabase: ReturnType<typeof createClient>, rawRecords: JsonObject[]) {
  const tenders = rawRecords.map(mapTender);
  const agenciesBySourceId = new Map<string, NonNullable<(typeof tenders)[number]["agency"]>>();
  for (const tender of tenders) {
    if (tender.agency) agenciesBySourceId.set(tender.agency.source_agency_id, tender.agency);
  }

  const agencyIds = new Map<string, string>();
  if (agenciesBySourceId.size) {
    const { data: agencies, error: agencyError } = await supabase
      .from("agencies")
      .upsert([...agenciesBySourceId.values()], { onConflict: "source_key,source_agency_id" })
      .select("id,source_agency_id");
    if (agencyError) throw agencyError;
    for (const agency of agencies ?? []) agencyIds.set(agency.source_agency_id, agency.id);
  }

  const tenderRows = tenders.map((tender) => {
    const { agency, ...row } = tender;
    return {
      ...row,
      agency_id: agency ? agencyIds.get(agency.source_agency_id) ?? null : null
    };
  });
  const sourceIds = [...new Set(tenderRows.map((tender) => tender.source_id))];
  if (sourceIds.length === 0) return { seen: rawRecords.length, inserted: 0, updated: 0 };
  const { data: existingRows, error: lookupError } = await supabase
    .from("tenders")
    .select("source_id")
    .eq("source_key", sourceKey)
    .in("source_id", sourceIds);
  if (lookupError) throw lookupError;

  const existingIds = new Set((existingRows ?? []).map((row) => row.source_id));
  const { error: tenderError } = await supabase
    .from("tenders")
    .upsert(tenderRows, { onConflict: "source_key,source_id" });
  if (tenderError) throw tenderError;

  return {
    seen: rawRecords.length,
    inserted: sourceIds.filter((id) => !existingIds.has(id)).length,
    updated: sourceIds.filter((id) => existingIds.has(id)).length
  };
}

function buildInitialCheckpoint(lookbackDays: number): Checkpoint {
  const end = new Date();
  const start = new Date(end.getTime() - lookbackDays * 24 * 60 * 60 * 1000);
  return {
    fromDate: formatDate(start),
    toDate: formatDate(end),
    modalityIndex: 0,
    page: 1
  };
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Método não permitido.", { status: 405 });
  }

  const modalitySetting = Deno.env.get("PNCP_MODALITY_CODES") ?? "4,6,8";
  const modalityCodes = modalitySetting
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number);
  if (
    modalityCodes.length === 0 ||
    modalityCodes.some((value) => !Number.isInteger(value) || !verifiedModalityCodes.has(value))
  ) {
    return new Response("Use somente os códigos de modalidade PNCP já confirmados: 4, 6 e 8.", { status: 500 });
  }

  const supabaseUrl = requiredEnvironment("SUPABASE_URL");
  const serviceRoleKey = requiredEnvironment("SUPABASE_SERVICE_ROLE_KEY");
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const presentedToken = request.headers.get("x-ingestion-token") ?? "";
  if (!presentedToken) return new Response("Não autorizado.", { status: 401 });
  const { data: tokenIsValid, error: tokenError } = await supabase.rpc("validate_ingestion_job_token", {
    p_candidate: presentedToken
  });
  if (tokenError || tokenIsValid !== true) return new Response("Não autorizado.", { status: 401 });

  const pncpBaseUrl = Deno.env.get("PNCP_BASE_URL") ?? "https://pncp.gov.br/api/consulta";
  const lookbackDays = parsePositiveInteger(Deno.env.get("PNCP_LOOKBACK_DAYS"), 3);
  const maxPages = parsePositiveInteger(Deno.env.get("PNCP_MAX_PAGES_PER_RUN"), maximumPagesPerRun);

  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  await supabase
    .from("ingestion_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: "Execução interrompida antes de finalizar; checkpoint será retomado."
    })
    .eq("source_key", sourceKey)
    .eq("status", "running")
    .lt("started_at", staleBefore);

  const { data: previousRuns } = await supabase
    .from("ingestion_runs")
    .select("status,checkpoint")
    .eq("source_key", sourceKey)
    .in("status", ["partial", "failed"])
    .order("started_at", { ascending: false })
    .limit(1);
  const checkpoint = parseCheckpoint(previousRuns?.[0]?.checkpoint) ?? buildInitialCheckpoint(lookbackDays);

  const { data: run, error: runError } = await supabase
    .from("ingestion_runs")
    .insert({
      source_key: sourceKey,
      status: "running",
      checkpoint: checkpoint as unknown as JsonObject
    })
    .select("id")
    .single();
  if (runError) return new Response(runError.message, { status: 500 });

  let current = { ...checkpoint };
  let pagesFetched = 0;
  let recordsSeen = 0;
  let recordsInserted = 0;
  let recordsUpdated = 0;

  try {
    while (current.modalityIndex < modalityCodes.length && pagesFetched < maxPages) {
      const modalityCode = modalityCodes[current.modalityIndex];
      if (modalityCode === undefined) break;

      const pageUrl = makePageUrl(pncpBaseUrl, current.fromDate, current.toDate, modalityCode, current.page);
      const response = await fetchWithRetry(pageUrl);
      const page = parsePage(await response.json());

      const saved = await savePage(supabase, page.data);
      recordsSeen += saved.seen;
      recordsInserted += saved.inserted;
      recordsUpdated += saved.updated;
      pagesFetched += 1;

      if (current.page < page.totalPaginas) {
        current.page += 1;
      } else {
        current.modalityIndex += 1;
        current.page = 1;
      }
    }

    const complete = current.modalityIndex >= modalityCodes.length;
    const finalStatus = complete ? "succeeded" : "partial";
    const { error: updateError } = await supabase
      .from("ingestion_runs")
      .update({
        status: finalStatus,
        finished_at: new Date().toISOString(),
        pages_fetched: pagesFetched,
        records_seen: recordsSeen,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        checkpoint: current as unknown as JsonObject
      })
      .eq("id", run.id);
    if (updateError) throw updateError;

    return Response.json({
      runId: run.id,
      status: finalStatus,
      pagesFetched,
      recordsSeen,
      recordsInserted,
      recordsUpdated,
      checkpoint: current
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("ingestion_runs")
      .update({
        status: "failed",
        finished_at: new Date().toISOString(),
        pages_fetched: pagesFetched,
        records_seen: recordsSeen,
        records_inserted: recordsInserted,
        records_updated: recordsUpdated,
        checkpoint: current as unknown as JsonObject,
        error_message: message.slice(0, 2000)
      })
      .eq("id", run.id);

    console.error(JSON.stringify({ event: "pncp_ingestion_failed", runId: run.id, message }));
    return Response.json({ runId: run.id, status: "failed", error: message }, { status: 502 });
  }
});

