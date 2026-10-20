import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { fetchTenderFiles, fetchTenderItems, parseTenderFiles, parseTenderItems, tenderReference } from "./attachments";

const sourceId = "10806496000149-1-000134/2026";
const items: unknown = JSON.parse(readFileSync("fixtures/pncp/attachments/items-10806496000149-2026-134.json", "utf8"));
const files: unknown = JSON.parse(readFileSync("fixtures/pncp/attachments/files-10806496000149-2026-134.json", "utf8"));

describe("PNCP items and documents", () => {
  it("normalizes a real procurement item with quantity and values", () => {
    expect(parseTenderItems(items)).toMatchObject([{ number: 1, quantity: 3000, unitValue: 190.26, totalValue: 570780, budgetIsSecret: false, catalogCode: "27502" }]);
  });

  it("normalizes the four real documents and Brasília publication times", () => {
    const parsed = parseTenderFiles(files);
    expect(parsed).toHaveLength(4);
    expect(parsed[2]).toMatchObject({ number: 3, type: "Edital", publishedAt: "2026-10-13T10:08:05.000Z" });
    expect(parsed[2].url).toBe("https://pncp.gov.br/pncp-api/v1/orgaos/10806496000149/compras/2026/134/arquivos/3");
  });

  it("builds only the fixed official API path, preserving leading CNPJ zeros", () => {
    expect(tenderReference("00394502000144-1-013746/2026")?.apiUrl).toBe("https://pncp.gov.br/api/pncp/v1/orgaos/00394502000144/compras/2026/13746");
    expect(tenderReference("https://example.com/")).toBeNull();
    expect(tenderReference("10806496000149-1-0/2026")).toBeNull();
    expect(tenderReference("10806496000149-2-134/2026")).toBeNull();
  });

  it("hides estimates when the budget is secret, including source zeros", () => {
    expect(parseTenderItems([{ numeroItem: 1, descricao: "Item de teste", orcamentoSigiloso: true, valorUnitarioEstimado: 0, valorTotal: 0 }])[0]).toMatchObject({ budgetIsSecret: true, unitValue: null, totalValue: null });
    expect(() => parseTenderItems([{ numeroItem: 1, descricao: "Item", orcamentoSigiloso: "true" }])).toThrow();
  });

  it("retains legitimate zero estimates, skips inactive files and blocks script URLs", () => {
    expect(parseTenderItems([{ numeroItem: 1, descricao: "Item", valorUnitarioEstimado: 0 }])[0].unitValue).toBe(0);
    expect(parseTenderFiles([{ sequencialDocumento: 1, statusAtivo: false }, { sequencialDocumento: 2, url: "javascript:alert(1)" }])).toMatchObject([{ number: 2, url: null }]);
  });

  it("does not silently omit malformed or duplicate records", () => {
    expect(() => parseTenderItems([{ numeroItem: 1 }])).toThrow();
    expect(() => parseTenderItems([{ numeroItem: 1, descricao: "A" }, { numeroItem: 1, descricao: "B" }])).toThrow();
    expect(() => parseTenderFiles([{ sequencialDocumento: 1 }, { sequencialDocumento: 1 }])).toThrow();
  });

  it("distinguishes a confirmed empty list from a source error", async () => {
    expect((await fetchTenderItems(sourceId, 1, vi.fn(async () => Response.json([])))).status).toBe("empty");
    expect((await fetchTenderFiles(sourceId, vi.fn(async () => new Response(null, { status: 204 })))).status).toBe("empty");
    for (const status of [404, 429, 500]) {
      expect((await fetchTenderFiles(sourceId, vi.fn(async () => new Response(null, { status })))).status).toBe("unavailable");
    }
    expect((await fetchTenderFiles(sourceId, vi.fn(async () => { throw new Error("Timeout"); }))).status).toBe("unavailable");
    expect((await fetchTenderFiles(sourceId, vi.fn(async () => Response.json({ unexpected: [] })))).status).toBe("unavailable");
  });

  it("paginates items at the source and exposes a possibly incomplete page", async () => {
    const page = Array.from({ length: 50 }, (_, index) => ({ numeroItem: index + 51, descricao: `Item de teste ${index + 51}` }));
    const request = vi.fn<typeof fetch>(async () => Response.json(page));
    const result = await fetchTenderItems(sourceId, 2, request);
    expect(request.mock.calls[0]?.[0]).toBe("https://pncp.gov.br/api/pncp/v1/orgaos/10806496000149/compras/2026/134/itens?pagina=2&tamanhoPagina=50");
    expect(result.hasMore).toBe(true);
    expect(result.records[0].number).toBe(51);
  });

  it("does not call the source for invalid references or page numbers", async () => {
    const request = vi.fn(async () => Response.json([]));
    await fetchTenderItems("../secret", 1, request);
    await fetchTenderItems(sourceId, 0, request);
    await fetchTenderItems(sourceId, 1001, request);
    await fetchTenderFiles("invalid", request);
    expect(request).not.toHaveBeenCalled();
  });
});
