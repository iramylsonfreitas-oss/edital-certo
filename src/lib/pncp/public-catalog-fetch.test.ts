import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPublicPncpCatalog } from "./public-catalog";

afterEach(()=>vi.unstubAllGlobals());
describe("public catalog cache boundary",()=>{
  it("keeps the real capture below the cache entry budget without dropping records or object text",async()=>{
    const raw=readFileSync("data/dados.json","utf8");
    const source=JSON.parse(raw);
    const fetcher=vi.fn().mockResolvedValue(new Response(raw));
    vi.stubGlobal("fetch",fetcher);
    const compact=await fetchPublicPncpCatalog();
    expect(compact.registros.map(row=>[row.numeroControlePNCP,row.objetoCompra]))
      .toEqual(source.registros.map((row:{numeroControlePNCP:string;objetoCompra:string})=>[row.numeroControlePNCP,row.objetoCompra]));
    expect(Buffer.byteLength(JSON.stringify(compact))).toBeLessThan(1800000);
    expect(fetcher.mock.calls[0][1]).toMatchObject({cache:"no-store"});
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("preserves filter and official-link fields while omitting unused upstream payload",async()=>{
    const record={numeroControlePNCP:"123-1-1/2026",objetoCompra:"Objeto inteiro",modalidadeId:6,modalidadeNome:"Pregão",
      valorTotalEstimado:5000,dataEncerramentoProposta:"2027-01-01T10:00:00",linkSistemaOrigem:"https://pncp.gov.br",
      orgaoEntidade:{razaoSocial:"Órgão",esferaId:"F",extra:"unused"},unidadeOrgao:{ufSigla:"AM",municipioNome:"Manaus",extra:"unused"},unusedRawPayload:"x".repeat(3000000)};
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(Response.json({registros:[record],status:"ok"})));
    const compact=await fetchPublicPncpCatalog();
    expect(compact.registros[0]).toMatchObject({objetoCompra:record.objetoCompra,valorTotalEstimado:5000,
      linkSistemaOrigem:record.linkSistemaOrigem,orgaoEntidade:{razaoSocial:"Órgão",esferaId:"F"},unidadeOrgao:{ufSigla:"AM",municipioNome:"Manaus"}});
    expect(JSON.stringify(compact)).not.toContain("unused");
  });
  it("fails closed on an invalid or unavailable public source",async()=>{
    for(const response of [new Response(null,{status:503}),Response.json({registros:{}})]) {
      vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response));
      await expect(fetchPublicPncpCatalog()).rejects.toThrow();
    }
  });
});
