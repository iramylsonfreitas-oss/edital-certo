import { scoreTender, type InterestProfile } from "../matching/score.ts";

export interface AlertProfileRow {
  required_keywords: string[]; optional_keywords: string[]; excluded_keywords: string[];
  ufs: string[]; municipality_codes: string[]; modality_codes: string[]; agency_terms: string[];
  spheres: string[]; minimum_value: number | null; maximum_value: number | null;
  exclusive_me_epp: boolean | null; cnae_codes: string[];
}
export interface AlertTenderRow {
  id: string; title: string; object: string; items_search_text: string | null;
  uf: string | null; municipality_code: string | null; modality_code: string | null;
  estimated_value: number | null; exclusive_me_epp: boolean | null; agency_name: string | null; sphere: string | null;
}
export interface AlertPage {
  alert_id: string; profile_id: string; claim_token: string; minimum_score: number;
  profile: AlertProfileRow; tenders: AlertTenderRow[];
}
export interface PreparedMatch { tender_id: string; score: number; explanation: string[] }

// Shared deterministic scorer: previews and background matching use the same rules.
export function prepareAlertPage(page: AlertPage): PreparedMatch[] {
  const p = page.profile;
  const profile: InterestProfile = {
    requiredKeywords: p.required_keywords, optionalKeywords: p.optional_keywords, excludedKeywords: p.excluded_keywords,
    ufs: p.ufs, municipalityCodes: p.municipality_codes, modalityCodes: p.modality_codes,
    agencyTerms: p.agency_terms, spheres: p.spheres, minimumValue: p.minimum_value, maximumValue: p.maximum_value,
    exclusiveMeEpp: p.exclusive_me_epp, cnaeCodes: p.cnae_codes
  };
  const matches: PreparedMatch[] = [];
  for (const tender of page.tenders) {
    const result = scoreTender(profile, {
      title: tender.title, object: tender.object, itemText: tender.items_search_text ?? "",
      uf: tender.uf, municipalityCode: tender.municipality_code, modalityCode: tender.modality_code,
      agencyName: tender.agency_name, sphere: tender.sphere, estimatedValue: tender.estimated_value,
      exclusiveMeEpp: tender.exclusive_me_epp, cnaeCodes: []
    });
    // An exclusion-only/empty profile or zero keyword match must not notify everyone.
    if (result.matched && result.score > 0 && result.score >= page.minimum_score) {
      matches.push({ tender_id: tender.id, score: result.score, explanation: result.explanation });
    }
  }
  return matches;
}
