export interface DigestOpportunity {
  id: string; title: string; agency: string | null; uf: string | null;
  estimatedValue: number | null; deadline: string; score: number | null; explanation: string[];
}
export interface DigestContent { subject: string; html: string; text: string; count: number }
const appOrigin = "https://edital-certo-six.vercel.app";
const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
const clean = (value: string, max: number) => {
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (text.length <= max) return text;
  const prefix = text.slice(0, max - 1);
  const boundary = prefix.lastIndexOf(" ");
  return `${prefix.slice(0, boundary > max * 0.75 ? boundary : prefix.length).trimEnd()}…`;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// No scripts, images, tracking pixels or remote assets. Portable to Node and Deno.
export function composeDigest(opportunities: DigestOpportunity[], now: Date, example = false): DigestContent {
  if (!Number.isFinite(now.getTime())) throw new Error("Data de composição inválida.");
  const seen = new Set<string>();
  const rows = opportunities.filter((row) => {
    if (!uuid.test(row.id) || seen.has(row.id) || !Number.isFinite(Date.parse(row.deadline)) || Date.parse(row.deadline) <= now.getTime()) return false;
    seen.add(row.id);
    return true;
  }).slice(0, 20);
  if (!rows.length) throw new Error("Nenhuma oportunidade com prazo futuro disponível.");
  const subject = `${example ? "Prévia — " : ""}Edital Certo: ${rows.length} ${rows.length === 1 ? "oportunidade" : "oportunidades"}`;
  const introduction = example ? "Exemplo de formato com dados reais do catálogo. Não representa alertas pessoais enviados." : "Confira as oportunidades selecionadas para os seus perfis de interesse.";
  const plain: string[] = [subject, "", introduction, "", "Horários de encerramento no fuso de Brasília (America/Sao_Paulo).", ""];
  const cards = rows.map((row) => {
    const title = clean(row.title, 220);
    const agency = clean(row.agency || "Órgão não informado", 180);
    const deadline = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(row.deadline));
    const value = row.estimatedValue !== null && Number.isFinite(row.estimatedValue) && row.estimatedValue >= 0
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(row.estimatedValue) : "Não informado";
    const score = row.score !== null && Number.isInteger(row.score) && row.score > 0 && row.score <= 100 ? `Aderência: ${row.score}/100` : null;
    const reasons = row.explanation.filter((reason) => typeof reason === "string").slice(0, 3).map((reason) => clean(reason, 180)).filter(Boolean);
    const url = `${appOrigin}/tenders/${row.id}`;
    plain.push(title, `${agency}${row.uf ? ` · ${clean(row.uf, 2)}` : ""}`, `Encerramento: ${deadline} (Brasília)`, `Valor estimado: ${value}`, ...(score ? [score] : []), ...reasons, `Ver licitação: ${url}`, "");
    return `<tr><td style="padding:20px 24px;border-bottom:1px solid #dbe3ef"><h2 style="margin:0 0 12px;font-size:18px;line-height:1.5;color:#0f172a">${escape(title)}</h2><p style="margin:0 0 10px;color:#475569">${escape(agency)}${row.uf ? ` · ${escape(clean(row.uf, 2))}` : ""}</p><p style="margin:6px 0"><strong>Encerramento:</strong> ${escape(deadline)} (Brasília)</p><p style="margin:6px 0"><strong>Valor estimado:</strong> ${escape(value)}</p>${score ? `<p style="margin:6px 0;color:#1d4ed8"><strong>${escape(score)}</strong></p>` : ""}${reasons.length ? `<ul style="padding-left:20px;color:#475569">${reasons.map((reason) => `<li>${escape(reason)}</li>`).join("")}</ul>` : ""}<p style="margin:18px 0 0"><a href="${url}" target="_blank" rel="noopener noreferrer" style="display:inline-block;box-sizing:border-box;background:#1d4ed8;color:#fff;padding:12px 18px;border-radius:6px;text-decoration:none;font-weight:bold">Ver licitação no Edital Certo</a></p></td></tr>`;
  }).join("");
  const footer = "Confira os dados e eventuais retificações na fonte oficial. Para pausar ou excluir suas preferências, acesse as configurações de alerta da sua conta.";
  plain.push(footer, `${appOrigin}/alerts`);
  const html = `<!doctype html><html lang="pt-BR" dir="ltr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(subject)}</title></head><body style="margin:0;padding:20px 8px;background:#f1f5f9;font:15px/1.6 Arial,Helvetica,sans-serif;color:#0f172a"><div style="display:none;max-height:0;overflow:hidden">${escape(subject)}</div><table role="presentation" style="width:100%;max-width:600px;margin:auto;border-collapse:collapse;background:#fff"><tr><td style="padding:24px;background:#1d4ed8;color:#fff"><p style="margin:0 0 8px;font-size:13px;letter-spacing:1px">EDITAL CERTO</p><h1 style="margin:0;font-size:24px">Oportunidades para acompanhar</h1></td></tr><tr><td style="padding:20px 24px"><p style="margin:0">${escape(introduction)}</p><p style="margin:12px 0 0;color:#475569">Horários no fuso de Brasília. O prazo pode ser alterado pelo órgão.</p></td></tr>${cards}<tr><td style="padding:24px;font-size:13px;color:#475569"><p>${escape(footer)}</p><a style="color:#1d4ed8" href="${appOrigin}/alerts" target="_blank" rel="noopener noreferrer">Gerenciar minhas preferências de alerta</a></td></tr></table></body></html>`;
  if (new TextEncoder().encode(html).length > 95_000) throw new Error("Resumo excede o tamanho permitido.");
  return { subject, html, text: plain.join("\n"), count: rows.length };
}
