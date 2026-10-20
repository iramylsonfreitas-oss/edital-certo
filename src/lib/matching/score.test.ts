import { describe, expect, it } from "vitest";
import { scoreTender, type InterestProfile, type TenderCandidate } from "./score";

const profile: InterestProfile = {
  requiredKeywords: ["notebook"],
  optionalKeywords: ["suporte"],
  excludedKeywords: ["recondicionado"],
  ufs: ["SP"],
  municipalityCodes: [],
  modalityCodes: ["6"],
  agencyTerms: [],
  spheres: [],
  minimumValue: null,
  maximumValue: 500000,
  exclusiveMeEpp: null,
  cnaeCodes: []
};

const tender: TenderCandidate = {
  title: "Aquisição de notebooks",
  object: "Compra de notebook com suporte técnico",
  uf: "SP",
  municipalityCode: "3550308",
  modalityCode: "6",
  agencyName: "Secretaria de Tecnologia",
  sphere: "M",
  estimatedValue: 250000,
  exclusiveMeEpp: null,
  cnaeCodes: []
};

describe("scoreTender", () => {
  it("normaliza para 100 quando todos os critérios configurados são atendidos", () => {
    const first = scoreTender(profile, tender);
    const second = scoreTender(profile, tender);
    expect(first).toEqual(second);
    expect(first.score).toBe(100);
    expect(first.explanation.join(" ")).toContain("notebook");
    expect(first.explanation.join(" ")).toContain("SP");
  });

  it("atribui 100 a um perfil configurado somente com UF", () => {
    const result = scoreTender({ ...profile, requiredKeywords: [], optionalKeywords: [], excludedKeywords: [], ufs: ["SP"], modalityCodes: [], maximumValue: null }, tender);
    expect(result).toMatchObject({ score: 100, matched: true });
  });

  it("atribui 100 a um perfil configurado somente com palavra obrigatória", () => {
    const result = scoreTender({ ...profile, requiredKeywords: ["notebook"], optionalKeywords: [], excludedKeywords: [], ufs: [], modalityCodes: [], maximumValue: null }, tender);
    expect(result).toMatchObject({ score: 100, matched: true });
  });

  it("calcula termos opcionais proporcionalmente e normaliza os critérios configurados", () => {
    const result = scoreTender({
      ...profile,
      requiredKeywords: [],
      optionalKeywords: ["notebook", "suporte"],
      excludedKeywords: [],
      ufs: [],
      modalityCodes: [],
      maximumValue: null
    }, tender);
    expect(result.score).toBe(50);
    expect(result.matched).toBe(true);
  });

  it("retorna zero e orientação para um perfil sem critérios positivos", () => {
    const result = scoreTender({
      ...profile,
      requiredKeywords: [],
      optionalKeywords: [],
      excludedKeywords: ["recondicionado"],
      ufs: [],
      modalityCodes: [],
      maximumValue: null
    }, tender);
    expect(result).toMatchObject({ score: 0, matched: true });
    expect(result.explanation[0]).toContain("critérios positivos");
  });

  it("rejeita palavra-chave obrigatória ausente", () => {
    const result = scoreTender(profile, { ...tender, title: "Serviço de rede", object: "Manutenção de equipamentos" });
    expect(result).toMatchObject({ score: 0, matched: false });
  });

  it("rejeita termos excluídos sem diferenciar acentos", () => {
    const result = scoreTender(profile, { ...tender, object: "Notebook recondicionádo" });
    expect(result.matched).toBe(false);
  });

  it("rejeita valor fora da faixa", () => {
    const result = scoreTender(profile, { ...tender, estimatedValue: 600000 });
    expect(result).toMatchObject({ score: 0, matched: false });
  });

  it("filtra por município e CNAE somente quando a fonte informa esses dados", () => {
    const scopedProfile = { ...profile, municipalityCodes: ["3550308"], cnaeCodes: ["6201501"] };
    const scopedTender = { ...tender, cnaeCodes: ["6201501"] };
    expect(scoreTender(scopedProfile, scopedTender).matched).toBe(true);
    expect(scoreTender(scopedProfile, { ...scopedTender, municipalityCode: "3304557" }).matched).toBe(false);
    expect(scoreTender(scopedProfile, { ...scopedTender, cnaeCodes: [] }).matched).toBe(false);
  });
});

