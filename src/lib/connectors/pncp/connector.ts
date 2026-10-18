import { z } from "zod";
import type { NormalizedTender, ProcurementConnector, SourcePage, SourceQuery } from "@/lib/connectors/types";
import { pncpPageSchema, pncpTenderSchema } from "./schema";
import { normalizePncpDateTime } from "./date-time";

const pncpBaseUrl = process.env.PNCP_BASE_URL ?? "https://pncp.gov.br/api/consulta";
const pageSizeMaximum = 500;

function assertDate(value: string): void {
  if (!/^\d{8}$/.test(value)) {
    throw new Error("A data PNCP deve usar o formato AAAAMMDD.");
  }
}

function requireObject(value: unknown): Record<string, unknown> {
  const result = z.record(z.string(), z.unknown()).safeParse(value);
  if (!result.success) {
    throw new Error("A resposta do PNCP não contém um objeto de contratação reconhecido.");
  }
  return result.data;
}

export class PncpConnector implements ProcurementConnector {
  readonly sourceKey = "pncp";

  constructor(
    private readonly request: typeof fetch = fetch,
    private readonly baseUrl: string = pncpBaseUrl
  ) {}

  async fetchNew(query: SourceQuery): Promise<SourcePage<NormalizedTender>> {
    assertDate(query.fromDate);
    assertDate(query.toDate);
    if (!Number.isInteger(query.modalityCode) || query.modalityCode < 0) {
      throw new Error("O código de modalidade precisa ser confirmado na tabela oficial do PNCP.");
    }
    if (!Number.isInteger(query.page) || query.page < 1) {
      throw new Error("A página deve ser um inteiro maior ou igual a 1.");
    }
    if (!Number.isInteger(query.pageSize) || query.pageSize < 1 || query.pageSize > pageSizeMaximum) {
      throw new Error("O tamanho da página deve estar entre 1 e 500.");
    }

    const url = new URL("v1/contratacoes/publicacao", `${this.baseUrl.replace(/\/$/, "")}/`);
    url.searchParams.set("dataInicial", query.fromDate);
    url.searchParams.set("dataFinal", query.toDate);
    url.searchParams.set("codigoModalidadeContratacao", String(query.modalityCode));
    url.searchParams.set("pagina", String(query.page));
    url.searchParams.set("tamanhoPagina", String(query.pageSize));

    const response = await this.request(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(20_000)
    });
    if (!response.ok) {
      throw new Error(`PNCP respondeu HTTP ${response.status}.`);
    }

    const pageResult = pncpPageSchema.safeParse(await response.json());
    if (!pageResult.success) {
      throw new Error("Formato de paginação PNCP não corresponde ao schema documentado. Confirme o Swagger e atualize o parser.");
    }

    return {
      records: pageResult.data.data.map((record) => this.normalize(record)),
      currentPage: pageResult.data.numeroPagina,
      totalPages: pageResult.data.totalPaginas,
      remainingPages: pageResult.data.paginasRestantes
    };
  }

  async fetchById(sourceId: string): Promise<NormalizedTender> {
    if (!sourceId.trim()) {
      throw new Error("Informe o número de controle PNCP.");
    }
    throw new Error(
      "A rota oficial de detalhe por número de controle precisa ser confirmada no Swagger atual do PNCP antes de habilitar esta consulta."
    );
  }

  normalize(raw: unknown): NormalizedTender {
    const record = pncpTenderSchema.parse(requireObject(raw));
    const agency = record.orgaoEntidade ?? null;
    const unit = record.unidadeOrgao ?? null;
    const agencyName = agency?.razaoSocial?.trim() ?? "";
    const agencyCnpj = agency?.cnpj ?? null;
    const municipalityCode = unit?.codigoIbge ?? unit?.municipioId ?? null;

    return {
      sourceKey: this.sourceKey,
      sourceId: record.numeroControlePNCP,
      controlNumber: record.numeroControlePNCP,
      agency: agencyName
        ? {
            sourceAgencyId: agencyCnpj ?? agencyName,
            cnpj: agencyCnpj,
            name: agencyName,
            sphere: agency?.esferaId ?? null,
            uf: unit?.ufSigla ?? null,
            municipalityCode: municipalityCode == null ? null : String(municipalityCode),
            municipalityName: unit?.municipioNome ?? null
          }
        : null,
      title: record.objetoCompra.trim().slice(0, 512) || record.numeroControlePNCP,
      object: record.objetoCompra,
      modalityCode: record.modalidadeId == null ? null : String(record.modalidadeId),
      modalityName: record.modalidadeNome ?? null,
      status: record.situacaoCompraNome ?? null,
      uf: unit?.ufSigla ?? null,
      municipalityCode: municipalityCode == null ? null : String(municipalityCode),
      municipalityName: unit?.municipioNome ?? null,
      estimatedValue: record.valorTotalEstimado ?? null,
      publishedAt: normalizePncpDateTime(record.dataPublicacaoPncp),
      proposalOpenAt: normalizePncpDateTime(record.dataAberturaProposta),
      proposalCloseAt: normalizePncpDateTime(record.dataEncerramentoProposta),
      sourceUpdatedAt: normalizePncpDateTime(record.dataAtualizacao),
      officialUrl: record.linkSistemaOrigem ?? null,
      rawData: record
    };
  }
}

