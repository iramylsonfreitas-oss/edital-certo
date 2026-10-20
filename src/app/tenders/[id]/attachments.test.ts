import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TenderFiles, TenderItems } from "./attachments";
import { createSupabaseServerClient } from "@/lib/supabase/server";

vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: vi.fn() }));

const props = { sourceId: "10806496000149-1-000134/2026", tenderId: "test-tender", page: 1 };
const items = JSON.parse(readFileSync("fixtures/pncp/attachments/items-10806496000149-2026-134.json", "utf8"));
const files = JSON.parse(readFileSync("fixtures/pncp/attachments/files-10806496000149-2026-134.json", "utf8"));
afterEach(() => vi.unstubAllGlobals());

describe("tender detail attachment sections", () => {
  it("uses a complete stored snapshot without calling PNCP and labels its consultation date", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: [{ item_number: 1, description: "Notebook salvo", quantity: 3, raw_data: { orcamentoSigiloso: true } }], error: null }) };
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from: () => chain } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const html = renderToStaticMarkup(await TenderItems({ ...props, storedAt: "2026-10-20T12:00:00Z" }));
    expect(html).toContain("Notebook salvo");
    expect(html).toContain("Itens consultados no PNCP em");
    expect(html).toContain("Orçamento sigiloso");
    expect(request).not.toHaveBeenCalled();
  });

  it("falls back to the live source if the saved snapshot cannot be read", async () => {
    const chain = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockReturnThis(), range: vi.fn().mockResolvedValue({ data: null, error: { message: "Database unavailable" } }) };
    vi.mocked(createSupabaseServerClient).mockResolvedValue({ from: () => chain } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
    const request = vi.fn(async () => Response.json(items)); vi.stubGlobal("fetch", request);
    const html = renderToStaticMarkup(await TenderItems({ ...props, storedAt: "2026-10-20T12:00:00Z" }));
    expect(html).toContain("570.780,00");
    expect(html).not.toContain("Itens consultados no PNCP em");
    expect(request).toHaveBeenCalledOnce();
  });
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
