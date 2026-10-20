export interface InterestProfile {
  requiredKeywords: string[];
  optionalKeywords: string[];
  excludedKeywords: string[];
  ufs: string[];
  municipalityCodes: string[];
  modalityCodes: string[];
  agencyTerms: string[];
  spheres: string[];
  minimumValue: number | null;
  maximumValue: number | null;
  exclusiveMeEpp: boolean | null;
  cnaeCodes: string[];
}

export interface TenderCandidate {
  title: string;
  object: string;
  uf: string | null;
  municipalityCode: string | null;
  modalityCode: string | null;
  agencyName: string | null;
  sphere: string | null;
  estimatedValue: number | null;
  exclusiveMeEpp: boolean | null;
  cnaeCodes: string[];
}

export interface MatchResult {
  score: number;
  matched: boolean;
  explanation: string[];
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
}

function includesTerm(haystack: string, term: string): boolean {
  return haystack.includes(normalizeText(term.trim()));
}

export function scoreTender(profile: InterestProfile, tender: TenderCandidate): MatchResult {
  const text = normalizeText(`${tender.title} ${tender.object}`);
  const explanation: string[] = [];
  let availableWeight = 0;
  let earnedWeight = 0;

  const cleanTerms = (terms: string[]): string[] => {
    const uniqueTerms = new Map<string, string>();
    for (const value of terms) {
      const term = value.trim();
      if (term) uniqueTerms.set(normalizeText(term), term);
    }
    return [...uniqueTerms.values()];
  };
  const addCriterion = (weight: number, ratio = 1) => {
    availableWeight += weight;
    earnedWeight += weight * ratio;
  };

  const required = cleanTerms(profile.requiredKeywords);
  const requiredMatches = required.filter((term) => includesTerm(text, term));
  if (required.length > 0 && requiredMatches.length !== required.length) {
    return { score: 0, matched: false, explanation: ["Não corresponde a todas as palavras-chave obrigatórias."] };
  }
  if (required.length > 0) {
    addCriterion(50);
    explanation.push(`palavras-chave obrigatórias: ${requiredMatches.join(", ")}`);
  }

  const excluded = cleanTerms(profile.excludedKeywords)
    .filter((term) => includesTerm(text, term));
  if (excluded.length > 0) {
    return { score: 0, matched: false, explanation: [`excluída por: ${excluded.join(", ")}`] };
  }

  const optional = cleanTerms(profile.optionalKeywords);
  const optionalMatches = optional.filter((term) => includesTerm(text, term));
  if (optional.length > 0) {
    addCriterion(30, optionalMatches.length / optional.length);
    if (optionalMatches.length > 0) {
      explanation.push(`palavras opcionais: ${optionalMatches.join(", ")}`);
    }
  }

  const ufs = cleanTerms(profile.ufs).map((uf) => uf.toUpperCase());
  if (ufs.length > 0) {
    if (!tender.uf || !ufs.includes(tender.uf.toUpperCase())) {
      return { score: 0, matched: false, explanation: ["UF fora do perfil."] };
    }
    addCriterion(20);
    explanation.push(`UF: ${tender.uf.toUpperCase()}`);
  }

  const municipalityCodes = cleanTerms(profile.municipalityCodes);
  if (municipalityCodes.length > 0) {
    if (!tender.municipalityCode || !municipalityCodes.includes(tender.municipalityCode)) {
      return { score: 0, matched: false, explanation: ["Município fora do perfil ou não informado pela fonte."] };
    }
    addCriterion(5);
    explanation.push(`município: código ${tender.municipalityCode}`);
  }

  const modalityCodes = cleanTerms(profile.modalityCodes);
  if (modalityCodes.length > 0) {
    if (!tender.modalityCode || !modalityCodes.includes(tender.modalityCode)) {
      return { score: 0, matched: false, explanation: ["Modalidade fora do perfil."] };
    }
    addCriterion(10);
    explanation.push("modalidade compatível");
  }

  const agencyTerms = cleanTerms(profile.agencyTerms);
  if (agencyTerms.length > 0) {
    const agencyMatched = agencyTerms.some((term) => tender.agencyName && includesTerm(tender.agencyName, term));
    if (!agencyMatched) return { score: 0, matched: false, explanation: ["Órgão fora do perfil."] };
    addCriterion(5);
    explanation.push("órgão compatível");
  }

  const spheres = cleanTerms(profile.spheres);
  if (spheres.length > 0) {
    if (!tender.sphere || !spheres.includes(tender.sphere)) {
      return { score: 0, matched: false, explanation: ["Esfera fora do perfil."] };
    }
    addCriterion(5);
  }

  if (profile.minimumValue != null || profile.maximumValue != null) {
    if (tender.estimatedValue === null) {
      return { score: 0, matched: false, explanation: ["O valor estimado não está disponível para validar o filtro."] };
    }
    const below = profile.minimumValue != null && tender.estimatedValue < profile.minimumValue;
    const above = profile.maximumValue != null && tender.estimatedValue > profile.maximumValue;
    if (below || above) return { score: 0, matched: false, explanation: ["Valor fora da faixa configurada."] };
    addCriterion(10);
    explanation.push(`valor estimado: R$ ${tender.estimatedValue.toLocaleString("pt-BR")}`);
  }

  if (profile.exclusiveMeEpp != null) {
    if (tender.exclusiveMeEpp !== profile.exclusiveMeEpp) {
      return { score: 0, matched: false, explanation: ["Exclusividade ME/EPP incompatível."] };
    }
    addCriterion(5);
    explanation.push("exclusividade ME/EPP compatível");
  }

  const cnaeCodes = cleanTerms(profile.cnaeCodes);
  if (cnaeCodes.length > 0) {
    const matchedCnaes = cnaeCodes.filter((code) => tender.cnaeCodes.includes(code));
    if (matchedCnaes.length === 0) {
      return { score: 0, matched: false, explanation: ["CNAE não corresponde ou não está disponível na contratação."] };
    }
    addCriterion(5);
    explanation.push(`CNAE: ${matchedCnaes.join(", ")}`);
  }

  if (availableWeight === 0) {
    return {
      score: 0,
      matched: true,
      explanation: ["Critérios de exclusão atendidos; adicione critérios positivos para calcular a aderência."]
    };
  }

  return {
    score: Math.round((earnedWeight / availableWeight) * 100),
    matched: true,
    explanation
  };
}
