import { refineTiObject } from "@/lib/segments/ti-refinements";

export interface PublicPncpRecord {
  numeroControlePNCP: string;
  objetoCompra: string;
  numeroCompra?: string | number | null;
  anoCompra?: number | null;
  modalidadeId?: string | number | null;
  modalidadeNome?: string | null;
  situacaoCompraNome?: string | null;
  valorTotalEstimado?: number | null;
  dataPublicacaoPncp?: string | null;
  dataAberturaProposta?: string | null;
  dataEncerramentoProposta?: string | null;
  dataAtualizacao?: string | null;
  linkSistemaOrigem?: string | null;
  orgaoEntidade?: {
    cnpj?: string | null;
    razaoSocial?: string | null;
    esferaId?: string | null;
  } | null;
  unidadeOrgao?: {
    ufSigla?: string | null;
    municipioNome?: string | null;
    codigoIbge?: string | number | null;
  } | null;
}

export interface PublicPncpCatalog {
  atualizadoEm: string | null;
  status: "ok" | "parcial" | "erro";
  mensagem: string | null;
  registros: PublicPncpRecord[];
}

export interface PublicTenderFilters {
  query: string | null;
  uf: string | null;
  modality: string | null;
  sphere?: string | null;
  minimumValue: number | null;
  maximumValue: number | null;
  closesBefore: string | null;
  sort: "relevance" | "deadline" | "value";
  showClosed?: boolean;
}

const catalogUrl = "https://raw.githubusercontent.com/iramylsonfreitas-oss/edital-certo/main/data/dados.json";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPncpRecord(value: unknown): value is PublicPncpRecord {
  return isRecord(value)
    && typeof value.numeroControlePNCP === "string"
    && typeof value.objetoCompra === "string";
}

export async function fetchPublicPncpCatalog(): Promise<PublicPncpCatalog> {
  const response = await fetch(catalogUrl, {
    headers: { accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) throw new Error(`O catálogo público respondeu HTTP ${response.status}.`);

  const payload: unknown = await response.json();
  if (!isRecord(payload) || !Array.isArray(payload.registros)) {
    throw new Error("O catálogo público do PNCP tem um formato inesperado.");
  }

  const status = payload.status === "ok" || payload.status === "parcial" || payload.status === "erro"
    ? payload.status
    : "erro";

  return {
    atualizadoEm: typeof payload.atualizadoEm === "string" ? payload.atualizadoEm : null,
    status,
    mensagem: typeof payload.mensagem === "string" ? payload.mensagem : null,
    registros: payload.registros.filter(isPncpRecord).map(compactPublicRecord)
  };
}

// Drop unused upstream fields before the framework caches the result. The raw response exceeds 2 MB.
function compactPublicRecord(record: PublicPncpRecord): PublicPncpRecord {
  return {
    numeroControlePNCP: record.numeroControlePNCP, objetoCompra: record.objetoCompra,
    modalidadeId: record.modalidadeId, modalidadeNome: record.modalidadeNome,
    valorTotalEstimado: record.valorTotalEstimado, dataEncerramentoProposta: record.dataEncerramentoProposta,
    linkSistemaOrigem: record.linkSistemaOrigem,
    orgaoEntidade: record.orgaoEntidade ? { razaoSocial: record.orgaoEntidade.razaoSocial, esferaId: record.orgaoEntidade.esferaId } : null,
    unidadeOrgao: record.unidadeOrgao ? { ufSigla: record.unidadeOrgao.ufSigla, municipioNome: record.unidadeOrgao.municipioNome } : null
  };
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

export function parsePncpDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value);
  const localDateTime = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? `${value}T00:00:00`
    : value;
  const parsed = new Date(hasTimezone ? localDateTime : `${localDateTime}-03:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function relevance(record: PublicPncpRecord, query: string): number {
  const objectText = normalizeText(record.objetoCompra);
  const titleText = normalizeText(record.objetoCompra.slice(0, 512));
  return query.split(/\s+/).filter(Boolean).reduce((score, term) => {
    if (titleText.includes(term)) return score + 2;
    return objectText.includes(term) ? score + 1 : score;
  }, 0);
}

export function filterPublicPncpRecords(
  records: PublicPncpRecord[],
  filters: PublicTenderFilters
): PublicPncpRecord[] {
  const normalizedQuery = filters.query ? normalizeText(filters.query.trim()) : "";
  const closeLimit = filters.closesBefore ? new Date(`${filters.closesBefore}T23:59:59.999-03:00`) : null;

  const filtered = records.filter((record) => {
    if (refineTiObject(record.objetoCompra) === null) return false;
    const objectText = normalizeText(record.objetoCompra);
    const unit = isRecord(record.unidadeOrgao) ? record.unidadeOrgao : null;
    const uf = typeof unit?.ufSigla === "string" ? unit.ufSigla.toUpperCase() : null;
    const modalityCode = record.modalidadeId == null ? null : String(record.modalidadeId);
    const value = typeof record.valorTotalEstimado === "number" && record.valorTotalEstimado > 0 ? record.valorTotalEstimado : null;
    const closeDate = parsePncpDate(record.dataEncerramentoProposta);
    const sphere = typeof record.orgaoEntidade?.esferaId === "string" ? record.orgaoEntidade.esferaId : null;

    return (!normalizedQuery || normalizedQuery.split(/\s+/).every((term) => objectText.includes(term)))
      && (!filters.uf || uf === filters.uf)
      && (!filters.modality || modalityCode === filters.modality)
      && (!filters.sphere || sphere === filters.sphere)
      && (filters.minimumValue == null || (value != null && value >= filters.minimumValue))
      && (filters.maximumValue == null || (value != null && value <= filters.maximumValue))
      && (filters.showClosed === true || !closeDate || closeDate >= new Date())
      && (!closeLimit || (closeDate != null && closeDate <= closeLimit));
  });

  if (filters.sort === "value") {
    return filtered.sort((first, second) => (second.valorTotalEstimado ?? -1) - (first.valorTotalEstimado ?? -1));
  }
  if (filters.sort === "relevance" && normalizedQuery) {
    return filtered.sort((first, second) => relevance(second, normalizedQuery) - relevance(first, normalizedQuery));
  }
  return filtered.sort((first, second) => {
    const firstDate = parsePncpDate(first.dataEncerramentoProposta)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const secondDate = parsePncpDate(second.dataEncerramentoProposta)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return firstDate - secondDate;
  });
}
