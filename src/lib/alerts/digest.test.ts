import { describe, expect, it } from "vitest";
import { composeDigest, type DigestOpportunity } from "./digest";
const now = new Date("2026-10-20T15:00:00Z");
const tender: DigestOpportunity = { id: "322969ea-0162-4515-98b6-41770f23a446", title: "Aquisição de TI", agency: "Órgão público", uf: "AM", estimatedValue: null, deadline: "2026-10-21T12:00:00Z", score: 100, explanation: ["UF: AM"] };
describe("email digest content", () => {
  it("includes equivalent HTML/text, explicit timezone and preference link", () => {
    const result = composeDigest([tender], now);
    expect(result.html).toContain('lang="pt-BR"');
    expect(result.html).toContain('role="presentation"');
    expect(result.text).toContain("21/10/2026, 09:00");
    expect(result.text).toContain("Valor estimado: Não informado");
    expect(result.text).toContain("Aderência: 100/100");
    expect(result.text).toContain("https://edital-certo-six.vercel.app/alerts");
    expect(result.html).not.toMatch(/<script|<img|javascript:/);
  });
  it("escapes source text and refuses IDs that could alter links", () => {
    const result = composeDigest([{ ...tender, title: '<script>alert("x")</script>', agency: '<img src=x onerror="evil">' }, { ...tender, id: '" onclick="evil' }], now);
    expect(result.count).toBe(1);
    expect(result.html).toContain("&lt;script&gt;");
    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("<img");
  });
  it("deduplicates and excludes expired, invalid and unknown deadlines", () => {
    expect(composeDigest([tender, tender, { ...tender, id: "00000000-0000-0000-0000-000000000001", deadline: now.toISOString() }, { ...tender, deadline: "invalid" }], now).count).toBe(1);
    expect(() => composeDigest([{ ...tender, deadline: "invalid" }], now)).toThrow();
  });
  it("bounds length and item count, and preserves a real zero price", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ ...tender, id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`, title: "a".repeat(10_000), estimatedValue: 0 }));
    const result = composeDigest(rows, now);
    expect(result.count).toBe(20);
    expect(result.text).toContain("a".repeat(219) + "…");
    expect(new TextEncoder().encode(result.html).length).toBeLessThan(95_000);
    expect(result.text).toMatch(/R\$\s*0,00/);
  });
  it("labels examples and omits invented scores", () => {
    const result = composeDigest([{ ...tender, score: null, explanation: [] }], now, true);
    expect(result.subject).toMatch(/^Prévia/);
    expect(result.text).toContain("Não representa alertas pessoais enviados.");
    expect(result.html).not.toContain("Aderência");
  });
});
