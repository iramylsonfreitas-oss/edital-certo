import { describe, expect, it } from "vitest";
import { normalizePncpDateTime } from "./date-time";

describe("normalizePncpDateTime", () => {
  it("converte hora local de Brasília para um instante UTC", () => {
    expect(normalizePncpDateTime("2026-10-19T09:00:00")).toBe("2026-10-19T12:00:00.000Z");
  });

  it("respeita o fuso explícito recebido da fonte", () => {
    expect(normalizePncpDateTime("2026-10-19T09:00:00-03:00")).toBe("2026-10-19T12:00:00.000Z");
  });

  it("retorna null para data inválida", () => {
    expect(normalizePncpDateTime("texto inválido")).toBeNull();
  });
});
