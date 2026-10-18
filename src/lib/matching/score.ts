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
  let score = 0;

  const required = profile.requiredKeywords.map((term) => term.trim()).filter(Boolean);
  const requiredMatches = required.filter((term) => includesTerm(text, term));
  if (required.length > 0 && requiredMatches.length !== required.length) {
    return { score: 0, matched: false, explanation: ["Não corresponde a todas as palavras-chave obrigatórias."] };
  }
  if (requiredMatches.length > 0) {
    score += 40;
    explanation.push(`palavras-chave obrigatórias: ${requiredMatches.join(", ")}`);
  }

  const excluded = profile.excludedKeywords.filter((term) => term.trim() && includesTerm(text, term));
  if (excluded.length > 0) {
    return { score: 0, matched: false, explanation: [`excluída por: ${excluded.join(", ")}`] };
  }

  const optionalMatches = profile.optionalKeywords
    .map((term) => term.trim())
    .filter((term) => term && includesTerm(text, term));
  score += Math.min(25, optionalMatches.length * 5);
  if (optionalMatches.length > 0) explanation.push(`palavras opcionais: ${optionalMatches.join(", ")}`);

  if (profile.ufs.length === 0 || (tender.uf && profile.ufs.includes(tender.uf.toUpperCase()))) {
    score += 15;
    if (profile.ufs.length > 0 && tender.uf) explanation.push(`UF: ${tender.uf.toUpperCase()}`);
  } else {
    return { score: 0, matched: false, explanation: ["UF fora do perfil."] };
  }

  if (profile.municipalityCodes.length > 0) {
    if (!tender.municipalityCode || !profile.municipalityCodes.includes(tender.municipalityCode)) {
      return { score: 0, matched: false, explanation: ["Município fora do perfil ou não informado pela fonte."] };
    }
    score += 5;
    explanation.push(`município: código ${tender.municipalityCode}`);
  }

  if (profile.modalityCodes.length === 0 || (tender.modalityCode && profile.modalityCodes.includes(tender.modalityCode))) {
    score += 10;
    if (tender.modalityCode && profile.modalityCodes.length > 0) explanation.push("modalidade compatível");
  } else {
    return { score: 0, matched: false, explanation: ["Modalidade fora do perfil."] };
  }

  const agencyMatched = profile.agencyTerms.some((term) => tender.agencyName && includesTerm(tender.agencyName, term));
  if (profile.agencyTerms.length === 0 || agencyMatched) {
    score += profile.agencyTerms.length === 0 ? 0 : 5;
    if (agencyMatched) explanation.push("órgão compatível");
  } else {
    return { score: 0, matched: false, explanation: ["Órgão fora do perfil."] };
  }

  const sphereMatched = profile.spheres.length === 0 || (tender.sphere != null && profile.spheres.includes(tender.sphere));
  if (sphereMatched) score += 5;
  else return { score: 0, matched: false, explanation: ["Esfera fora do perfil."] };

  if (profile.minimumValue !== null || profile.maximumValue !== null) {
    if (tender.estimatedValue === null) {
      return { score: 0, matched: false, explanation: ["O valor estimado não está disponível para validar o filtro."] };
    }
    const below = profile.minimumValue !== null && tender.estimatedValue < profile.minimumValue;
    const above = profile.maximumValue !== null && tender.estimatedValue > profile.maximumValue;
    if (below || above) return { score: 0, matched: false, explanation: ["Valor fora da faixa configurada."] };
    score += 10;
    explanation.push(`valor estimado: R$ ${tender.estimatedValue.toLocaleString("pt-BR")}`);
  }

  if (profile.exclusiveMeEpp !== null) {
    if (tender.exclusiveMeEpp !== profile.exclusiveMeEpp) {
      return { score: 0, matched: false, explanation: ["Exclusividade ME/EPP incompatível."] };
    }
    score += 5;
    explanation.push("exclusividade ME/EPP compatível");
  }

  if (profile.cnaeCodes.length > 0) {
    const matchedCnaes = profile.cnaeCodes.filter((code) => tender.cnaeCodes.includes(code));
    if (matchedCnaes.length === 0) {
      return { score: 0, matched: false, explanation: ["CNAE não corresponde ou não está disponível na contratação."] };
    }
    score += 5;
    explanation.push(`CNAE: ${matchedCnaes.join(", ")}`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    matched: true,
    explanation
  };
}

