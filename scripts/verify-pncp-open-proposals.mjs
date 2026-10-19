const allowedModalities = new Set([4, 6, 8]);
const rawModalities = (process.env.PNCP_MODALITY_CODES ?? "4,6,8")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const configuredModalities = rawModalities.map(Number);
if (
  configuredModalities.length === 0 ||
  configuredModalities.some((code) => !Number.isInteger(code) || !allowedModalities.has(code))
) {
  throw new Error("PNCP_MODALITY_CODES deve conter apenas os códigos validados 4, 6 e 8.");
}

const pageSize = 50;
const maximumPagesPerModality = 10;
const minimumPauseBetweenRequestsMs = 6_000;
const requestTimeoutMs = 30_000;
const maximumAttempts = 3;
let lastRequestStartedAt = 0;
let requests = 0;
let pagesFetched = 0;
let recordsSeen = 0;
const identifiers = new Set();
let duplicates = 0;
const errors = [];

function getBrasiliaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchPage(url, modalityCode, pageNumber) {
  let lastError;
  for (let attempt = 1; attempt <= maximumAttempts; attempt += 1) {
    const pauseRemaining = minimumPauseBetweenRequestsMs - (Date.now() - lastRequestStartedAt);
    if (lastRequestStartedAt > 0 && pauseRemaining > 0) await delay(pauseRemaining);

    lastRequestStartedAt = Date.now();
    requests += 1;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (response.status === 204) return { data: [], totalPaginas: 0, numeroPagina: pageNumber };

      const bodyText = await response.text();
      if (response.ok) {
        const body = JSON.parse(bodyText);
        if (
          !body ||
          !Array.isArray(body.data) ||
          !Number.isInteger(body.totalPaginas) ||
          !Number.isInteger(body.numeroPagina) ||
          !Number.isInteger(body.paginasRestantes)
        ) {
          throw new Error("Envelope de paginação diferente do documentado pelo PNCP.");
        }
        return body;
      }

      lastError = new Error(`PNCP respondeu HTTP ${response.status}: ${bodyText.slice(0, 300)}`);
      if (response.status !== 429 && response.status < 500) throw lastError;

      if (attempt < maximumAttempts) {
        const retryAfter = response.headers.get("retry-after");
        const retrySeconds = retryAfter ? Number(retryAfter) : Number.NaN;
        const serverDelay = Number.isFinite(retrySeconds) && retrySeconds > 0 ? retrySeconds * 1000 : 0;
        const exponentialDelay = Math.min(15_000 * (2 ** (attempt - 1)), 60_000);
        await delay(Math.max(serverDelay, exponentialDelay));
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (lastError.message.startsWith("PNCP respondeu HTTP 4")) throw lastError;
      if (attempt < maximumAttempts) await delay(Math.min(2_000 * (2 ** (attempt - 1)), 10_000));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  errors.push({ modalityCode, pageNumber, message: lastError?.message ?? "Erro desconhecido." });
  throw lastError ?? new Error("Falha desconhecida na consulta ao PNCP.");
}

async function main() {
  const dateFinal = getBrasiliaDate();

  for (const modalityCode of configuredModalities) {
    let pageNumber = 1;
    let totalPages = 1;
    while (pageNumber <= totalPages) {
      if (pageNumber > maximumPagesPerModality) {
        throw new Error(`Modalidade ${modalityCode} ultrapassou o limite de verificação de ${maximumPagesPerModality} páginas.`);
      }

      const url = new URL("v1/contratacoes/proposta", "https://pncp.gov.br/api/consulta/");
      url.searchParams.set("dataFinal", dateFinal);
      url.searchParams.set("codigoModalidadeContratacao", String(modalityCode));
      url.searchParams.set("pagina", String(pageNumber));
      url.searchParams.set("tamanhoPagina", String(pageSize));

      const response = await fetchPage(url, modalityCode, pageNumber);
      if (response.totalPaginas === 0) {
        totalPages = 0;
        break;
      }
      if (response.numeroPagina !== pageNumber) {
        throw new Error(`PNCP retornou página ${response.numeroPagina} ao solicitar ${pageNumber}.`);
      }

      totalPages = response.totalPaginas;
      pagesFetched += 1;
      recordsSeen += response.data.length;
      for (const record of response.data) {
        if (typeof record.numeroControlePNCP !== "string" || !record.numeroControlePNCP) {
          throw new Error(`Registro sem numeroControlePNCP na modalidade ${modalityCode}, página ${pageNumber}.`);
        }
        if (identifiers.has(record.numeroControlePNCP)) duplicates += 1;
        identifiers.add(record.numeroControlePNCP);
      }
      pageNumber += 1;
    }
  }

  console.log(JSON.stringify({
    endpoint: "/v1/contratacoes/proposta",
    dateFinal,
    modalities: configuredModalities,
    pageSize,
    requests,
    pagesFetched,
    recordsSeen,
    uniqueRecords: identifiers.size,
    duplicates,
    errors
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
