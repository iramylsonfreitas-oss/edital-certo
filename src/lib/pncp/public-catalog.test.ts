import { describe, expect, it } from "vitest";
import { filterPublicPncpRecords, parsePncpDate, type PublicPncpRecord } from "./public-catalog";

const records: PublicPncpRecord[] = [
  {
    numeroControlePNCP: "123-1-000001/2026",
    objetoCompra: "Aquisição de notebook para laboratório",
    modalidadeId: 6,
    modalidadeNome: "Pregão Eletrônico",
    valorTotalEstimado: 45000,
    dataEncerramentoProposta: "2026-10-20T10:00:00",
    unidadeOrgao: { ufSigla: "SP", municipioNome: "Campinas" }
  },
  {
    numeroControlePNCP: "456-1-000002/2026",
    objetoCompra: "Licenças de software para gestão",
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

  it("interpreta data PNCP sem fuso como horário de Brasília", () => {
    expect(parsePncpDate("2026-10-20T10:00:00")?.toISOString()).toBe("2026-10-20T13:00:00.000Z");
  });
});
