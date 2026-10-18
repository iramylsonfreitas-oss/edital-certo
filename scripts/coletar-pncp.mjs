import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const PROJECT_DIRECTORY = resolve(SCRIPT_DIRECTORY, '..');
const DATA_FILE = resolve(PROJECT_DIRECTORY, 'data/dados.json');
const API_URL = 'https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao';
const PAGE_SIZE = 50;
const REQUEST_TIMEOUT_MS = 30_000;
const MINIMUM_PAUSE_MS = 2_000;
const MAX_ATTEMPTS = 3;
const MAX_CONSECUTIVE_FAILED_PAGES = 3;
const MODALITY_IDS = new Set([4, 6, 8]);

// Lista editável: o texto do objeto é analisado sem diferenciar acentos ou caixa.
const TI_KEYWORDS = [
  'notebook', 'computador', 'desktop', 'servidor', 'software', 'licença',
  'tecnologia da informação', 'tecnologia da informacao', 'tecnologia da informação e comunicação',
  'tecnologia da informacao e comunicacao', 'solução de tecnologia da informação',
  'solucao de tecnologia da informacao', 'informática', 'informática e comunicação',
  'equipamento de informática', 'equipamento de informatica', 'equipamentos de informática',
  'equipamentos de informatica', 'infraestrutura de rede', 'rede de computadores',
  'rede de dados', 'rede corporativa', 'rede wi-fi', 'rede wifi', 'rede', 'sistema',
  'switch', 'firewall', 'nobreak', 'impressora', 'outsourcing de impressão', 'suporte técnico de informática',
  'suporte técnico de informatica', 'suporte técnico de TI', 'desenvolvimento de software',
  'desenvolvimento de sistema', 'sistema informatizado', 'sistema de informação',
  'sistema de informacao', 'sistema web', 'sistema acadêmico', 'sistema academico',
  'licenciamento de software', 'hospedagem', 'nuvem', 'dados', 'data center',
  'link de internet', 'telefonia', 'monitor', 'monitor de vídeo', 'monitor de video', 'tablet'
];
const WEAK_TI_KEYWORDS = ['sistema', 'rede', 'hospedagem', 'monitor', 'impressora'];
const STRONG_TI_KEYWORDS = [
  'informática', 'informática e comunicação', 'software', 'licença', 'notebook',
  'computador', 'desktop', 'servidor', 'TI', 'tecnologia da informação',
  'tecnologia da informação e comunicação', 'nuvem', 'dados', 'data center',
  'equipamento de informática', 'equipamentos de informática', 'switch', 'firewall',
  'nobreak', 'outsourcing de impressão', 'suporte técnico de informática',
  'suporte técnico de TI', 'desenvolvimento de software', 'licenciamento de software',
  'rede de computadores', 'rede de dados',
  'telefonia', 'link de internet', 'tablet'
];
const EXCLUDED_TERMS = [
  'cirurg', 'raio-x', 'raio x', 'raios-x', 'raios x', 'radiologia',
  'transporte vertical', 'elevador', 'viagem', 'viagens', 'alimentac',
  'paciente', 'termodesinfectora', 'veículo', 'veiculo', 'obra',
  'servidor público', 'servidores públicos'
];
const PLURAL_SUFFIXES = new Map([
  ['notebook', 's?'],
  ['computador', '(?:es)?'],
  ['servidor', '(?:es)?'],
  ['licenca', 's?'],
  ['sistema', 's?'],
  ['rede', 's?'],
  ['switch', '(?:es)?'],
  ['firewall', 's?'],
  ['nobreak', 's?'],
  ['impressora', 's?'],
  ['monitor', '(?:es)?'],
  ['tablet', 's?'],
  ['dado', 's?'],
  ['nuvem', 's?']
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

function keywordMatchesText(text, keyword, allowSuffix = false) {
  const normalizedKeyword = normalizeText(keyword);
  const phrasePattern = normalizedKeyword
    .split(/\s+/)
    .map(escapeRegExp)
    .join('\\s+');
  const suffix = allowSuffix ? '[a-z0-9]*' : PLURAL_SUFFIXES.get(normalizedKeyword) || '';
  const pattern = new RegExp(`(^|[^a-z0-9])${phrasePattern}${suffix}(?=$|[^a-z0-9])`);
  return pattern.test(text);
}

function hasExcludedTerm(text) {
  return EXCLUDED_TERMS.some((term) => keywordMatchesText(text, term, true));
}

function hasTiKeyword(record) {
  const text = normalizeText(record?.objetoCompra);
  if (hasExcludedTerm(text)) return false;
  const hasAnyTiKeyword = TI_KEYWORDS.some((keyword) => keywordMatchesText(text, keyword));
  if (!hasAnyTiKeyword) return false;
  const hasWeakKeyword = WEAK_TI_KEYWORDS.some((keyword) => keywordMatchesText(text, keyword));
  if (!hasWeakKeyword) return true;
  return STRONG_TI_KEYWORDS.some((keyword) => keywordMatchesText(text, keyword));
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
  return new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let retryDelayMs = 0;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { accept: 'application/json' },
        signal: controller.signal
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
      retryDelayMs = Number(error?.retryDelayMs) || 0;
    } finally {
      clearTimeout(timeoutId);
    }
    if (retryDelayMs > 0) await sleep(retryDelayMs);
  }
  return null;
}

function createPageReference(modalityId, page, dataInicial, dataFinal) {
  return { modalidadeId: modalityId, pagina: page, dataInicial, dataFinal };
}

async function collectModality(modalityId, dataInicial, dataFinal) {
  const collected = [];
  const failedPages = [];
  const firstPage = await requestPage(1, modalityId, dataInicial, dataFinal);
  if (!firstPage) {
    failedPages.push(createPageReference(modalityId, 1, dataInicial, dataFinal));
    return { records: collected, pages: 1, failedPages };
  }

  const totalPagesValue = Number(firstPage.totalPaginas ?? 1);
  const totalPages = Number.isFinite(totalPagesValue) ? Math.max(1, totalPagesValue) : 1;
  collected.push(...firstPage.data);
  let consecutiveFailedPages = 0;

  for (let page = 2; page <= totalPages; page += 1) {
    const result = await requestPage(page, modalityId, dataInicial, dataFinal);
    if (!result) {
      failedPages.push(createPageReference(modalityId, page, dataInicial, dataFinal));
      consecutiveFailedPages += 1;
      if (consecutiveFailedPages >= MAX_CONSECUTIVE_FAILED_PAGES) {
        console.error(`Interrompida a modalidade ${modalityId} após ${consecutiveFailedPages} páginas consecutivas sem resposta.`);
        for (let deferredPage = page + 1; deferredPage <= totalPages; deferredPage += 1) {
          failedPages.push(createPageReference(modalityId, deferredPage, dataInicial, dataFinal));
        }
        break;
      }
      continue;
    }
    collected.push(...result.data);
    consecutiveFailedPages = 0;
  }

  return { records: collected, pages: totalPages, failedPages };
}

function normalizePendingPages(value) {
  if (!Array.isArray(value)) return [];
  const pendingPages = value.filter((page) => {
    return page && MODALITY_IDS.has(Number(page.modalidadeId))
      && Number.isInteger(Number(page.pagina)) && Number(page.pagina) > 0
      && /^\d{8}$/.test(String(page.dataInicial))
      && /^\d{8}$/.test(String(page.dataFinal));
  }).map((page) => createPageReference(
    Number(page.modalidadeId),
    Number(page.pagina),
    String(page.dataInicial),
    String(page.dataFinal)
  ));
  return uniquePendingPages(pendingPages);
}

function uniquePendingPages(pages) {
  const unique = new Map();
  for (const page of pages) {
    const key = `${page.modalidadeId}:${page.pagina}:${page.dataInicial}:${page.dataFinal}`;
    unique.set(key, page);
  }
  return [...unique.values()];
}

async function retryPendingPages(pendingPages) {
  const records = [];
  const stillPending = [];
  for (const pendingPage of pendingPages) {
    const result = await requestPage(
      pendingPage.pagina,
      pendingPage.modalidadeId,
      pendingPage.dataInicial,
      pendingPage.dataFinal
    );
    if (!result) {
      stillPending.push(pendingPage);
      continue;
    }
    records.push(...result.data);
  }
  return { records, stillPending };
}

function previousRecordsExpiredByDeadline(records, cutoff) {
  return uniqueByControlNumber(records).filter((record) => {
    const closesAt = parsePncpDate(record.dataEncerramentoProposta);
    return closesAt !== null && closesAt < cutoff;
  });
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
  const retentionCutoff = addDays(now, -7);
  const previousData = await readPreviousData();
  const previousUniqueRecords = uniqueByControlNumber(previousData.registros);
  const pendingFromPreviousRun = normalizePendingPages(previousData.parametros?.paginasPendentesRetentativa);
  const retriedPages = await retryPendingPages(pendingFromPreviousRun);
  const collectedByModality = [...retriedPages.records];
  const failedPages = [...retriedPages.stillPending];
  const modalityPages = {};

  for (const modalityId of MODALITY_IDS) {
    const result = await collectModality(modalityId, dataInicial, dataFinalPublicacao);
    collectedByModality.push(...result.records);
    modalityPages[modalityId] = result.pages;
    failedPages.push(...result.failedPages);
  }

  const pendingForNextRun = uniquePendingPages(failedPages);
  const parameters = {
    endpoint: API_URL,
    criterio: 'Contratações publicadas nos últimos 3 dias, com prazo de proposta ainda aberto e modalidade entre os códigos 4, 6 e 8.',
    dataInicial,
    dataFinal: dataFinalPublicacao,
    tamanhoPagina: PAGE_SIZE,
    modalidades: [...MODALITY_IDS],
    paginasPorModalidade: modalityPages,
    tentativasPorChamada: MAX_ATTEMPTS,
    timeoutSegundos: REQUEST_TIMEOUT_MS / 1000,
    pausaMinimaEntreChamadasMs: MINIMUM_PAUSE_MS,
    limitePaginasFalhasConsecutivas: MAX_CONSECUTIVE_FAILED_PAGES,
    paginasPendentesRetentativa: pendingForNextRun
  };

  const successfulCalls = metrics.successfulCalls;
  if (successfulCalls === 0) {
    const failureData = {
      ...previousData,
      atualizadoEm: now.toISOString(),
      status: 'erro',
      mensagem: `O PNCP não respondeu com sucesso em nenhuma chamada. Os registros anteriores foram preservados. ${pendingForNextRun.length} página(s) ficaram registradas para nova tentativa. Erros: ${metrics.errors.length}.`,
      parametros: { ...parameters, contagens: previousData.parametros?.contagens ?? null },
      total: previousData.registros.length
    };
    await writeData(failureData);
    console.error(`Coleta encerrada: 0 chamadas bem-sucedidas; ${metrics.calls} chamadas; ${previousData.registros.length} registros anteriores preservados; ${pendingForNextRun.length} páginas pendentes; ${metrics.errors.length} erros.`);
    process.exitCode = 1;
    return;
  }

  const collectedUniqueRecords = uniqueByControlNumber(collectedByModality);
  const inWindowWithOpenProposal = collectedUniqueRecords
    .filter((record) => MODALITY_IDS.has(Number(record.modalidadeId)))
    .filter((record) => isInRecentPublicationWindow(record, publicationStart, now))
    .filter((record) => {
      const deadline = parsePncpDate(record.dataEncerramentoProposta);
      return deadline !== null && deadline >= now;
    });
  const tiRecords = inWindowWithOpenProposal.filter((record) => hasTiKeyword(record));
  const tiRecordIds = new Set(tiRecords.map((record) => String(record.numeroControlePNCP)));

  const previousRecordsWithinRetention = previousUniqueRecords
    .filter((record) => {
      const closesAt = parsePncpDate(record.dataEncerramentoProposta);
      return closesAt === null || closesAt >= retentionCutoff;
    });
  const retainedPreviousRecords = previousRecordsWithinRetention
    .filter((record) => MODALITY_IDS.has(Number(record.modalidadeId)))
    .filter((record) => hasTiKeyword(record));
  const retainedPreviousIds = new Set(retainedPreviousRecords.map((record) => String(record.numeroControlePNCP)));
  const mergedRecords = sortByDeadline(uniqueByControlNumber([...retainedPreviousRecords, ...tiRecords]));
  const maintainedCount = mergedRecords.filter((record) => retainedPreviousIds.has(String(record.numeroControlePNCP))).length;
  const mergedIds = new Set(mergedRecords.map((record) => String(record.numeroControlePNCP)));
  const newCount = mergedRecords.length - maintainedCount;
  const ignoredByTiFilterIds = new Set();
  for (const record of inWindowWithOpenProposal) {
    const id = String(record.numeroControlePNCP ?? '').trim();
    if (id && !tiRecordIds.has(id)) ignoredByTiFilterIds.add(id);
  }
  for (const record of previousRecordsWithinRetention) {
    const id = String(record.numeroControlePNCP ?? '').trim();
    if (id && (!MODALITY_IDS.has(Number(record.modalidadeId)) || !hasTiKeyword(record))) {
      ignoredByTiFilterIds.add(id);
    }
  }
  const ignoredByTiFilterCount = ignoredByTiFilterIds.size;
  const removedByDeadlineCount = previousRecordsExpiredByDeadline(previousUniqueRecords, retentionCutoff)
    .filter((record) => !mergedIds.has(String(record.numeroControlePNCP))).length;
  const hasPartialErrors = pendingForNextRun.length > 0;
  const status = hasPartialErrors ? 'parcial' : 'ok';
  const counts = {
    novas: newCount,
    mantidas: maintainedCount,
    removidasPorPrazoEncerrado: removedByDeadlineCount,
    ignoradasPeloFiltro: ignoredByTiFilterCount,
    totalFinal: mergedRecords.length,
    paginasPendentesRetentativa: pendingForNextRun.length
  };
  const countText = `${counts.novas} novas, ${counts.mantidas} mantidas (${counts.totalFinal} no total), ${counts.removidasPorPrazoEncerrado} removidas por prazo encerrado e ${counts.ignoradasPeloFiltro} ignoradas pelo filtro de TI.`;
  const message = hasPartialErrors
    ? `Coleta parcial: ${countText} ${counts.paginasPendentesRetentativa} página(s) foram registradas para nova tentativa na próxima execução.`
    : `Coleta concluída: ${countText}`;

  await writeData({
    atualizadoEm: now.toISOString(),
    status,
    mensagem: message,
    parametros: { ...parameters, contagens: counts },
    total: mergedRecords.length,
    registros: mergedRecords
  });

  console.log(`Resumo PNCP: chamadas=${metrics.calls}; bem-sucedidas=${metrics.successfulCalls}; páginas pendentes=${pendingForNextRun.length}; registros brutos=${collectedByModality.length}; novos=${counts.novas}; mantidos=${counts.mantidas}; removidos por prazo=${counts.removidasPorPrazoEncerrado}; ignorados pelo filtro=${counts.ignoradasPeloFiltro}; total=${counts.totalFinal}; erros=${metrics.errors.length}; status=${status}.`);
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
