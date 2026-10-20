import { describe, expect, it } from "vitest";
import { prepareAlertPage, type AlertPage, type AlertTenderRow } from "./prepare";

const tender: AlertTenderRow = {
  id: "tender-1", title: "Aquisição de equipamentos", object: "Materiais permanentes",
  items_search_text: "Nobreak para servidor de rede", uf: "AM", municipality_code: "1302603", modality_code: "6",
  estimated_value: 100_000, exclusive_me_epp: null, agency_name: "Prefeitura de Manaus", sphere: "M"
};
function page(): AlertPage {
  return {
    alert_id: "alert-1", profile_id: "profile-1", claim_token: "lease-1", minimum_score: 80,
    profile: {
      required_keywords: ["nobreak"], optional_keywords: [], excluded_keywords: [], ufs: ["AM"],
      municipality_codes: [], modality_codes: [], agency_terms: [], spheres: [], minimum_value: null,
      maximum_value: null, exclusive_me_epp: null, cnae_codes: []
    }, tenders: [{ ...tender }]
  };
}
describe("email alert page matching", () => {
  it("matches item descriptions and retains the explanation", () => {
    expect(prepareAlertPage(page())).toEqual([{ tender_id: "tender-1", score: 100, explanation: ["palavras-chave obrigatórias: nobreak", "UF: AM"] }]);
  });
  it("rejects missing required terms, excluded terms and other states", () => {
    const p = page();
    p.tenders.push({ ...tender, id: "missing", items_search_text: null }, { ...tender, id: "excluded", object: "Locação", items_search_text: "nobreak locação" }, { ...tender, id: "other-state", uf: "RR" });
    p.profile.excluded_keywords = ["locação"];
    expect(prepareAlertPage(p).map((m) => m.tender_id)).toEqual(["tender-1"]);
  });
  it("never queues empty or exclusion-only profiles even at minimum zero", () => {
    const p = page();
    p.minimum_score = 0;
    p.profile.required_keywords = [];
    p.profile.ufs = [];
    expect(prepareAlertPage(p)).toEqual([]);
    p.profile.excluded_keywords = ["cirúrgico"];
    expect(prepareAlertPage(p)).toEqual([]);
  });
  it("enforces minimum score and rejects zero optional-keyword matches", () => {
    const p = page();
    p.profile.required_keywords = [];
    p.profile.ufs = [];
    p.profile.optional_keywords = ["nobreak", "notebook"];
    expect(prepareAlertPage(p)).toEqual([]);
    p.minimum_score = 50;
    expect(prepareAlertPage(p)[0]?.score).toBe(50);
    p.minimum_score = 0;
    p.tenders[0].items_search_text = "cadeira";
    expect(prepareAlertPage(p)).toEqual([]);
  });
  it("does not infer missing price, exclusivity or CNAE data", () => {
    const p = page();
    p.profile.minimum_value = 1;
    p.tenders[0].estimated_value = null;
    expect(prepareAlertPage(p)).toEqual([]);
    p.profile.minimum_value = null;
    p.profile.exclusive_me_epp = true;
    expect(prepareAlertPage(p)).toEqual([]);
    p.profile.exclusive_me_epp = null;
    p.profile.cnae_codes = ["6201501"];
    expect(prepareAlertPage(p)).toEqual([]);
  });
});
