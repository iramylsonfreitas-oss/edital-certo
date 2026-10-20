import { normalizePncpDateTime } from "./date-time";
import { toSafeHttpUrl } from "../../security/safe-url";

export const itemPageSize = 50;
const apiBase = "https://pncp.gov.br/api/pncp/v1";

export interface TenderItem {
  number: number;
  description: string;
  unit: string | null;
  quantity: number | null;
  unitValue: number | null;
  totalValue: number | null;
  budgetIsSecret: boolean;
  status: string | null;
  catalogCode: string | null;
}

export interface TenderFile {
  number: number;
  title: string;
  type: string | null;
  url: string | null;
  publishedAt: string | null;
}

export type AttachmentResult<T> = {
  status: "ready" | "empty" | "unavailable";
  records: T[];
  hasMore: boolean;
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Formato PNCP inválido.");
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function positiveInteger(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error("Identificador PNCP inválido.");
  return value;
}

function amount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Valor PNCP inválido.");
  return value;
}

export function tenderReference(sourceId: string) {
  const match = /^(\d{14})-1-(\d{1,10})\/(20\d{2})$/.exec(sourceId);
  if (!match || Number(match[2]) < 1) return null;
  const [, cnpj, sequence, year] = match;
  const sequentialNumber = String(Number(sequence));
  return {
    apiUrl: `${apiBase}/orgaos/${cnpj}/compras/${year}/${sequentialNumber}`,
    portalUrl: `https://pncp.gov.br/app/editais/${cnpj}/${year}/${sequentialNumber}`
  };
}

function list(payload: unknown, field: string): unknown[] {
  const rows = Array.isArray(payload) ? payload : object(payload)[field];
  if (!Array.isArray(rows)) throw new Error("Lista PNCP não reconhecida.");
  return rows;
}

export function parseTenderItems(payload: unknown): TenderItem[] {
  const seen = new Set<number>();
  return list(payload, "itens").map((value) => {
    const row = object(value);
    const number = positiveInteger(row.numeroItem);
    const description = text(row.descricao);
    if (!description || seen.has(number)) throw new Error("Item PNCP incompleto ou duplicado.");
    seen.add(number);
    if (row.orcamentoSigiloso != null && typeof row.orcamentoSigiloso !== "boolean") throw new Error("Sigilo do orçamento não reconhecido.");
    const budgetIsSecret = row.orcamentoSigiloso === true;
    return {
      number, description,
      unit: text(row.unidadeMedida), quantity: amount(row.quantidade),
      unitValue: budgetIsSecret ? null : amount(row.valorUnitarioEstimado),
      totalValue: budgetIsSecret ? null : amount(row.valorTotal),
      budgetIsSecret, status: text(row.situacaoCompraItemNome),
      catalogCode: text(row.catalogoCodigoItem)
    };
  });
}

export function parseTenderFiles(payload: unknown): TenderFile[] {
  const seen = new Set<number>();
  const files: TenderFile[] = [];
  for (const value of list(payload, "documentos")) {
    const row = object(value);
    if (row.statusAtivo === false) continue;
    const number = positiveInteger(row.sequencialDocumento);
    if (seen.has(number)) throw new Error("Documento PNCP duplicado.");
    seen.add(number);
    files.push({
      number,
      title: text(row.titulo) ?? `Documento ${number}`,
      type: text(row.tipoDocumentoNome),
      url: toSafeHttpUrl(text(row.url) ?? text(row.uri)),
      publishedAt: normalizePncpDateTime(text(row.dataPublicacaoPncp))
    });
  }
  return files;
}

async function fetchRecords<T>(url: string, parse: (payload: unknown) => T[], request: typeof fetch): Promise<AttachmentResult<T>> {
  try {
    const response = await request(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 300 }
    });
    if (response.status === 204) return { status: "empty", records: [], hasMore: false };
    if (!response.ok) throw new Error(`PNCP HTTP ${response.status}`);
    const records = parse(await response.json());
    return { status: records.length ? "ready" : "empty", records, hasMore: false };
  } catch {
    return { status: "unavailable", records: [], hasMore: false };
  }
}

export async function fetchTenderItems(sourceId: string, page = 1, request: typeof fetch = fetch): Promise<AttachmentResult<TenderItem>> {
  const reference = tenderReference(sourceId);
  if (!reference || !Number.isSafeInteger(page) || page < 1 || page > 1000) {
    return { status: "unavailable", records: [], hasMore: false };
  }
  const result = await fetchRecords(`${reference.apiUrl}/itens?pagina=${page}&tamanhoPagina=${itemPageSize}`, parseTenderItems, request);
  return { ...result, hasMore: result.records.length === itemPageSize };
}

export async function fetchTenderFiles(sourceId: string, request: typeof fetch = fetch): Promise<AttachmentResult<TenderFile>> {
  const reference = tenderReference(sourceId);
  if (!reference) return { status: "unavailable", records: [], hasMore: false };
  return fetchRecords(`${reference.apiUrl}/arquivos`, parseTenderFiles, request);
}
