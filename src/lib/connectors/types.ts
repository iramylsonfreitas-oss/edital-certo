export type JsonObject = Record<string, unknown>;

export interface SourceQuery {
  fromDate: string;
  toDate: string;
  modalityCode: number;
  page: number;
  pageSize: number;
}

export interface NormalizedAgency {
  sourceAgencyId: string;
  cnpj: string | null;
  name: string;
  sphere: string | null;
  uf: string | null;
  municipalityCode: string | null;
  municipalityName: string | null;
}

export interface NormalizedTender {
  sourceKey: string;
  sourceId: string;
  controlNumber: string | null;
  agency: NormalizedAgency | null;
  title: string;
  object: string;
  modalityCode: string | null;
  modalityName: string | null;
  status: string | null;
  uf: string | null;
  municipalityCode: string | null;
  municipalityName: string | null;
  estimatedValue: number | null;
  publishedAt: string | null;
  proposalOpenAt: string | null;
  proposalCloseAt: string | null;
  sourceUpdatedAt: string | null;
  officialUrl: string | null;
  rawData: JsonObject;
}

export interface SourcePage<T> {
  records: T[];
  currentPage: number;
  totalPages: number;
  remainingPages: number;
}

export interface ProcurementConnector {
  readonly sourceKey: string;
  fetchNew(query: SourceQuery): Promise<SourcePage<NormalizedTender>>;
  fetchById(sourceId: string): Promise<NormalizedTender>;
  normalize(raw: unknown): NormalizedTender;
}

