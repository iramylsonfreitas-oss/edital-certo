import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TenderFiles, TenderItems } from "./attachments";

const props = { sourceId: "10806496000149-1-000134/2026", tenderId: "test-tender", page: 1 };
const items = JSON.parse(readFileSync("fixtures/pncp/attachments/items-10806496000149-2026-134.json", "utf8"));
const files = JSON.parse(readFileSync("fixtures/pncp/attachments/files-10806496000149-2026-134.json", "utf8"));
afterEach(() => vi.unstubAllGlobals());

describe("tender detail attachment sections", () => {
  it("renders quantity, estimate and catalog code from the real item", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(items)));
    const html = renderToStaticMarkup(await TenderItems(props));
    expect(html).toContain("3.000 UNIDADE");
    expect(html).toContain("570.780,00");
    expect(html).toContain("27502");
  });

  it("renders the real edital and the four official document links", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(files)));
    const html = renderToStaticMarkup(await TenderFiles(props));
    expect(html).toContain("Edital");
    expect(html.match(/Abrir documento oficial/g)).toHaveLength(4);
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders a source outage separately from an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 429 })));
    const failed = renderToStaticMarkup(await TenderItems(props));
    expect(failed).toContain("Não foi possível consultar");
    expect(failed).not.toContain("não retornou itens");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    expect(renderToStaticMarkup(await TenderItems(props))).toContain("não retornou itens");
  });

  it("shows a secret budget without presenting its hidden zero as a price", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([{ numeroItem: 1, descricao: "Item de teste", orcamentoSigiloso: true, valorUnitarioEstimado: 0, valorTotal: 0 }])));
    const html = renderToStaticMarkup(await TenderItems(props));
    expect(html).toContain("Orçamento sigiloso");
    expect(html).not.toContain("R$");
  });

  it("exposes navigation when more items may exist and can return from an empty final page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(Array.from({ length: 50 }, (_, index) => ({ numeroItem: index + 1, descricao: "Item de teste" })))));
    expect(renderToStaticMarkup(await TenderItems(props))).toContain("itemsPage=2#itens");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json([])));
    const html = renderToStaticMarkup(await TenderItems({ ...props, page: 2 }));
    expect(html).toContain("Não há mais itens");
    expect(html).toContain("itemsPage=1#itens");
  });
});
