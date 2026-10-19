import { describe, expect, it, vi } from "vitest";
import realFixture from "../../../../fixtures/pncp/real-response.json";
import { PncpConnector } from "./connector";

const record = {
  numeroControlePNCP: "00394460000141-1-000001/2021-000001",
  numeroCompra: "1/2021",
  anoCompra: 2021,
  modalidadeId: 6,
  modalidadeNome: "Pregão - Eletrônico",
  situacaoCompraNome: "Divulgada no PNCP",
  objetoCompra: "Aquisição de equipamentos de informática",
  valorTotalEstimado: 125000,
  dataPublicacaoPncp: "2021-07-27T19:45:57.969+00:00",
  orgaoEntidade: { cnpj: "00394460000141", razaoSocial: "Ministério da Economia", esferaId: "F" },
  unidadeOrgao: { ufSigla: "DF", municipioId: 5570, municipioNome: "Brasília" }
};

describe("PncpConnector", () => {
  it("monta consulta paginada usando parâmetros publicados pelo manual", async () => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({
      data: [record],
      totalRegistros: 1,
      totalPaginas: 1,
      numeroPagina: 1,
      paginasRestantes: 0
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const connector = new PncpConnector(request, "https://pncp.gov.br/api/consulta");
    const page = await connector.fetchNew({
      fromDate: "20261017",
      toDate: "20261018",
      modalityCode: 6,
      page: 1,
      pageSize: 50
    });

    expect(new URL(String(request.mock.calls[0]?.[0])).searchParams.get("tamanhoPagina")).toBe("50");
    expect(page.records[0]?.sourceId).toBe(record.numeroControlePNCP);
    expect(page.totalPages).toBe(1);
  });

  it("normaliza agência e localização a partir do contrato de campos documentado", () => {
    const connector = new PncpConnector(async () => new Response(null));
    const result = connector.normalize(record);
    expect(result.agency?.cnpj).toBe("00394460000141");
    expect(result.uf).toBe("DF");
    expect(result.object).toContain("informática");
  });

  it("normaliza a amostra real capturada do PNCP", () => {
    const connector = new PncpConnector(async () => new Response(null));
    const rawTender = realFixture.response.data[0];
    const result = connector.normalize(rawTender);
    expect(result.sourceId).toMatch(/^\d{14}-1-\d+\/2026$/);
    expect(result.modalityCode).toBe("6");
    expect(result.municipalityCode).toBe("2407203");
    expect(result.proposalOpenAt).toBe("2026-10-19T12:00:00.000Z");
  });

  it("falha com erro claro se a resposta de rede divergir do schema esperado", async () => {
    const connector = new PncpConnector(async () => new Response(JSON.stringify({ unexpected: true })));
    await expect(connector.fetchNew({
      fromDate: "20261017", toDate: "20261018", modalityCode: 6, page: 1, pageSize: 50
    })).rejects.toThrow("schema documentado");
  });
});

