// Runtime-independent parser shared by Next.js and the Deno batch worker.
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

export function tenderReference(sourceId: string) {
  const match = /^(\d{14})-1-(\d{1,10})\/(20\d{2})$/.exec(sourceId);
  if (!match || Number(match[2]) < 1) return null;
  const [, cnpj, sequence, year] = match;
  const sequentialNumber = String(Number(sequence));
  return {
    apiUrl: `https://pncp.gov.br/api/pncp/v1/orgaos/${cnpj}/compras/${year}/${sequentialNumber}`,
    portalUrl: `https://pncp.gov.br/app/editais/${cnpj}/${year}/${sequentialNumber}`
  };
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function amount(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Valor PNCP inválido.");
  return value;
}

export function parseTenderItems(payload: unknown): TenderItem[] {
  const rows = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? (payload as Record<string, unknown>).itens : null;
  if (!Array.isArray(rows)) throw new Error("Lista PNCP não reconhecida.");
  const seen = new Set<number>();
  return rows.map((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Formato PNCP inválido.");
    const row = value as Record<string, unknown>;
    const number = row.numeroItem;
    const description = text(row.descricao);
    if (typeof number !== "number" || !Number.isSafeInteger(number) || number < 1 || !description || seen.has(number)) throw new Error("Item PNCP incompleto ou duplicado.");
    seen.add(number);
    if (row.orcamentoSigiloso != null && typeof row.orcamentoSigiloso !== "boolean") throw new Error("Sigilo do orçamento não reconhecido.");
    const budgetIsSecret = row.orcamentoSigiloso === true;
    return {
      number, description, unit: text(row.unidadeMedida), quantity: amount(row.quantidade),
      unitValue: budgetIsSecret ? null : amount(row.valorUnitarioEstimado),
      totalValue: budgetIsSecret ? null : amount(row.valorTotal), budgetIsSecret,
      status: text(row.situacaoCompraItemNome), catalogCode: text(row.catalogoCodigoItem)
    };
  });
}

export function parseStoredTenderItems(rows: Array<Record<string, unknown>>): TenderItem[] {
  return parseTenderItems(rows.map((row) => {
    const raw = row.raw_data && typeof row.raw_data === "object" ? row.raw_data as Record<string, unknown> : {};
    return {
      numeroItem: row.item_number, descricao: row.description, unidadeMedida: row.unit, quantidade: row.quantity,
      valorUnitarioEstimado: row.estimated_unit_value, valorTotal: row.estimated_total_value,
      orcamentoSigiloso: raw.orcamentoSigiloso, situacaoCompraItemNome: raw.situacaoCompraItemNome,
      catalogoCodigoItem: raw.catalogoCodigoItem
    };
  }));
}
