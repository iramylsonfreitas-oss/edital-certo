import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = resolve(SCRIPT_DIRECTORY, '..');
const DATA_FILE = resolve(PROJECT_DIRECTORY, 'data/dados.json');
const API_URL = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';
const PAGE_SIZE = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const MINIMUM_PAUSE_MS = 1_000;
const MAX_ATTEMPTS = 3;
const MAX_CONSECUTIVE_FAILED_PAGES = 3;
const OPEN_DEADLINE_HORIZON_DAYS = 365;
const MODALITY_IDS = new Set([4, 6, 8]);

// Lista editável: o texto do objeto é analisado sem diferenciar acentos ou caixa.
const TI_KEYWORDS = [
  'notebook', 'computador', 'desktop', 'servidor', 'software', 'licença',
  'sistema', 'tecnologia da informação', 'ti', 'rede', 'switch', 'firewall',
  'nobreak', 'impressora', 'outsourcing de impressão', 'suporte técnico',
  'desenvolvimento', 'hospedagem', 'nuvem', 'data center', 'link de internet',
  'telefonia', 'monitor', 'tablet'
];
const PLURAL_KEYWORDS = new Set([
  'notebook', 'computador', 'servidor', 'licença', 'sistema', 'rede',
  'switch', 'firewall', 'nobreak', 'impressora', 'monitor', 'tablet'
]);

const metrics = { calls: 0, successfulCalls: 0, errors: [] };
let lastRequestStartedAt = 0;

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function keywordMatchesText(text, keyword) {
  const normalizedKeyword = normalizeText(keyword);
  const phrasePattern = normalizedKeyword
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
  const pluralSuffix = PLURAL_KEYWORDS.has(keyword) ? 's?' : '';
  const pattern = new RegExp(`(^|[^a-z0-9])${phrasePattern}${pluralSuffix}(?=$|[^a-z0-9])`);
  return pattern.test(text);
}

function hasTiKeyword(record) {
  const text = normalizeText(record?.objetoCompra);
  return TI_KEYWORDS.some((keyword) => keywordMatchesText(text, keyword));
}

function parsePncpDate(value) {
  if (!value) return null;
  const text = String(value);
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(text);
  const parsed = new Date(hasTimezone ? text : `${text}-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateInBrazil(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function startOfRollingWindow(now) {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

async function readPreviousData() {
  try {
    const text = await readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(text);
    return {
      ...parsed,
      registros: Array.isArray(parsed.registros) ? parsed.registros : []
    };
  } catch {
    return {
      atualizadoEm: null,
      status: 'erro',
      mensagem: 'Não foi possível ler o arquivo anterior; a coleta tentará obter registros novos.',
      parametros: {},
      total: 0,
      registros: []
    };
  }
}

async function waitBeforeRequest() {
  const elapsed = Date.now() - lastRequestStartedAt;
  if (lastRequestStartedAt > 0 && elapsed < MINIMUM_PAUSE_MS) {
    await sleep(MINIMUM_PAUSE_MS - elapsed);
  }
}

function getRetryDelay(response, attempt) {
  const retryAfter = response.headers.get('retry-after');
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) return Math.max(0, retryAt - Date.now());
  }
  return 1_000 * 2 ** attempt;
}

async function requestPage(page, modalityId, dataInicial, dataFinal) {
  const url = new URL(API_URL);
  url.searchParams.set('dataInicial', dataInicial);
  url.searchParams.set('dataFinal', dataFinal);
  url.searchParams.set('codigoModalidadeContratacao', String(modalityId));
  url.searchParams.set('pagina', String(page));
  url.searchParams.set('tamanhoPagina', String(PAGE_SIZE));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    await waitBeforeRequest();
    lastRequestStartedAt = Date.now();
    metrics.calls += 1;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
      });
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`);
        error.retryDelayMs = response.status === 429 || response.status >= 500
          ? getRetryDelay(response, attempt)
          : 0;
        throw error;
      }
      const body = await response.json();
      if (!body || !Array.isArray(body.data)) {
        throw new Error('Resposta sem a lista esperada em "data". Confira o formato atual no Swagger do PNCP.');
      }
      metrics.successfulCalls += 1;
      return body;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      metrics.errors.push({ page, modalityId, attempt, message });
      console.error(`Falha na modalidade ${modalityId}, página ${page}, tentativa ${attempt}/${MAX_ATTEMPTS}: ${message}`);
      if (attempt === MAX_ATTEMPTS) return null;
      const retryDelayMs = Number(error?.retryDelayMs) || 0;
      if (retryDelayMs > 0) await sleep(retryDelayMs);
    }
  }
  return null;
}

async function collectModality(modalityId, dataInicial, dataFinal) {
  const collected = [];
  const firstPage = await requestPage(1, modalityId, dataInicial, dataFinal);
  if (!firstPage) return { records: collected, pages: 0, failedPages: [1] };

  const totalPagesValue = Number(firstPage.totalPaginas ?? 1);
  const totalPages = Number.isFinite(totalPagesValue) ? Math.max(1, totalPagesValue) : 1;
  collected.push(...firstPage.data);
  const failedPages = [];
  let consecutiveFailedPages = 0;

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await requestPage(page, modalityId, dataInicial, dataFinal);
    if (!result) {
      failedPages.push(page);
      consecutiveFailedPages += 1;
      if (consecutiveFailedPages >= MAX_CONSECUTIVE_FAILED_PAGES) {
        console.error(`Interrompida a modalidade ${modalityId} após ${consecutiveFailedPages} páginas consecutivas sem resposta.`);
        break;
      }
      continue;
    }
    collected.push(...result.data);
    consecutiveFailedPages = 0;
  }

  return { records: collected, pages: totalPages, failedPages };
}

function isInRecentPublicationWindow(record, start, now) {
  const publishedAt = parsePncpDate(record.dataPublicacaoPncp);
  return publishedAt !== null && publishedAt >= start && publishedAt <= now;
}

function isOpenWithinRetentionWindow(record, cutoff) {
  const closesAt = parsePncpDate(record.dataEncerramentoProposta);
  return closesAt !== null && closesAt >= cutoff;
}

function uniqueByControlNumber(records) {
  const unique = new Map();
  for (const record of records) {
    const id = String(record?.numeroControlePNCP ?? '').trim();
    if (id) unique.set(id, record);
  }
  return [...unique.values()];
}

function sortByDeadline(records) {
  return [...records].sort((first, second) => {
    const firstDate = parsePncpDate(first.dataEncerramentoProposta)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const secondDate = parsePncpDate(second.dataEncerramentoProposta)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return firstDate - secondDate;
  });
}

async function writeData(data) {
  await writeFile(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function main() {
  const now = new Date();
  const publicationStart = startOfRollingWindow(now);
  const dataInicial = formatDateInBrazil(publicationStart);
  const dataFinalPublicacao = formatDateInBrazil(now);
  const dataFinal = formatDateInBrazil(addDays(now, OPEN_DEADLINE_HORIZON_DAYS));
  const previousData = await readPreviousData();
  const collectedByModality = [];
  const failedModalities = [];
  const modalityPages = {};

  for (const modalityId of MODALITY_IDS) {
    const result = await collectModality(modalityId, dataInicial, dataFinalPublicacao);
    collectedByModality.push(...result.records);
    modalityPages[modalityId] = result.pages;
    if (result.failedPages.length > 0) {
      failedModalities.push({ modalityId, pages: result.failedPages });
    }
  }

  const successfulCalls = metrics.successfulCalls;
  const allCallsFailed = successfulCalls === 0;
  const parameters = {
    endpoint: API_URL,
    criterio: 'Contratações publicadas nos últimos 7 dias, com prazo de proposta ainda aberto e modalidade entre os códigos 4, 6 e 8.',
    dataInicial,
    dataFinal: dataFinalPublicacao,
    tamanhoPagina: PAGE_SIZE,
    modalidades: [4, 6, 8],
    paginasPorModalidade: modalityPages,
    tentativasPorChamada: MAX_ATTEMPTS,
    timeoutSegundos: REQUEST_TIMEOUT_MS / 1000,
    pausaMinimaEntreChamadasMs: MINIMUM_PAUSE_MS,
    limitePaginasFalhasConsecutivas: MAX_CONSECUTIVE_FAILED_PAGES
  };

  if (allCallsFailed) {
    const failureData = {
      ...previousData,
      atualizadoEm: now.toISOString(),
      status: 'erro',
      mensagem: `O PNCP não respondeu com sucesso em nenhuma chamada. Os registros anteriores foram preservados. Erros: ${metrics.errors.length}.`,
      parametros: parameters,
      total: previousData.registros.length
    };
    await writeData(failureData);
    console.error(`Coleta encerrada: 0 chamadas bem-sucedidas; ${metrics.calls} chamadas; ${previousData.registros.length} registros anteriores preservados; ${metrics.errors.length} erros.`);
    process.exitCode = 1;
    return;
  }

  const newRecords = collectedByModality
    .filter((record) => MODALITY_IDS.has(Number(record.modalidadeId)))
    .filter((record) => hasTiKeyword(record))
    .filter((record) => isInRecentPublicationWindow(record, publicationStart, now))
    .filter((record) => {
      const deadline = parsePncpDate(record.dataEncerramentoProposta);
      return deadline !== null && deadline >= now;
    });

  const retainedPreviousRecords = previousData.registros
    .filter((record) => MODALITY_IDS.has(Number(record.modalidadeId)))
    .filter((record) => hasTiKeyword(record))
    .filter((record) => isOpenWithinRetentionWindow(record, addDays(now, -7)));

  const mergedRecords = sortByDeadline(uniqueByControlNumber([...retainedPreviousRecords, ...newRecords]));
  const hasPartialErrors = failedModalities.length > 0;
  const status = hasPartialErrors ? 'parcial' : 'ok';
  const message = hasPartialErrors
    ? `Coleta parcial: ${newRecords.length} oportunidades novas de TI e ${retainedPreviousRecords.length} registros anteriores ainda válidos. ${failedModalities.length} modalidade(s) tiveram páginas sem resposta; consulte o log da execução.`
    : `Coleta concluída: ${newRecords.length} oportunidades novas de TI. Registros anteriores de TI ainda válidos foram mantidos quando a API não os retornou.`;

  await writeData({
    atualizadoEm: now.toISOString(),
    status,
    mensagem: message,
    parametros: parameters,
    total: mergedRecords.length,
    registros: mergedRecords
  });

  console.log(`Resumo PNCP: chamadas=${metrics.calls}; bem-sucedidas=${metrics.successfulCalls}; registros brutos=${collectedByModality.length}; registros novos de TI=${newRecords.length}; registros mesclados=${mergedRecords.length}; erros=${metrics.errors.length}; status=${status}.`);
  if (hasPartialErrors) process.exitCode = 1;
}

main().catch(async (error) => {
  const now = new Date();
  const previousData = await readPreviousData();
  const message = error instanceof Error ? error.message : String(error);
  await writeData({
    ...previousData,
    atualizadoEm: now.toISOString(),
    status: 'erro',
    mensagem: `Falha inesperada na coleta; registros anteriores preservados. ${message}`,
    total: previousData.registros.length
  });
  console.error(`Erro fatal na coleta PNCP: ${message}`);
  process.exitCode = 1;
});
