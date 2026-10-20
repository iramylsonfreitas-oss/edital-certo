import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filterPublicPncpRecords, parsePncpDate, type PublicPncpRecord } from "./public-catalog";

const records: PublicPncpRecord[] = [
  {
    numeroControlePNCP: "123-1-000001/2026",
    objetoCompra: "Aquisição de notebook para laboratório",
    orgaoEntidade: { esferaId: "E" },
    modalidadeId: 6,
    modalidadeNome: "Pregão Eletrônico",
    valorTotalEstimado: 45000,
    dataEncerramentoProposta: "2026-10-20T10:00:00",
    unidadeOrgao: { ufSigla: "SP", municipioNome: "Campinas" }
  },
  {
    numeroControlePNCP: "456-1-000002/2026",
    objetoCompra: "Licenças de software para gestão",
    orgaoEntidade: { esferaId: "M" },
    modalidadeId: 8,
    modalidadeNome: "Dispensa",
    valorTotalEstimado: 80000,
    dataEncerramentoProposta: "2026-10-22T10:00:00",
    unidadeOrgao: { ufSigla: "RJ", municipioNome: "Rio de Janeiro" }
  }
];

const defaultFilters = {
  query: null,
  uf: null,
  modality: null,
  minimumValue: null,
  maximumValue: null,
  closesBefore: null,
  sort: "deadline" as const
};

describe("catálogo público PNCP", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
  });

  afterEach(() => vi.useRealTimers());

  it("oculta encerradas por padrão e permite consultá-las explicitamente", () => {
    vi.setSystemTime(new Date("2026-10-20T13:00:01Z"));
    expect(filterPublicPncpRecords(records, defaultFilters).map((record) => record.numeroControlePNCP))
      .toEqual(["456-1-000002/2026"]);
    expect(filterPublicPncpRecords(records, { ...defaultFilters, showClosed: true }))
      .toHaveLength(2);
  });

  it("filtra por UF, modalidade e faixa de valor", () => {
    const result = filterPublicPncpRecords(records, {
      ...defaultFilters,
      uf: "SP",
      modality: "6",
      minimumValue: 40000,
      maximumValue: 50000
    });

    expect(result.map((record) => record.numeroControlePNCP)).toEqual(["123-1-000001/2026"]);
  });

  it("busca sem diferenciar acentos e maiúsculas", () => {
    const result = filterPublicPncpRecords(records, { ...defaultFilters, query: "LICENÇAS SOFTWARE" });

    expect(result.map((record) => record.numeroControlePNCP)).toEqual(["456-1-000002/2026"]);
  });

  it("filtra pela esfera do órgão quando a captura traz esse campo", () => {
    const result = filterPublicPncpRecords(records, { ...defaultFilters, sphere: "M" });
    expect(result.map((record) => record.numeroControlePNCP)).toEqual(["456-1-000002/2026"]);
  });

  it("interpreta data PNCP sem fuso como horário de Brasília", () => {
    expect(parsePncpDate("2026-10-20T10:00:00")?.toISOString()).toBe("2026-10-20T13:00:00.000Z");
  });
});
