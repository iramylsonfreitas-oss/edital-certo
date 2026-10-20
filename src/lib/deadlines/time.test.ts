import { describe, expect, it } from "vitest";
import { deadlineState } from "./time";

describe("prazo em horário de Brasília", () => {
  it("marca como encerrado mesmo que o prazo tenha acabado hoje", () => {
    expect(deadlineState("2026-10-20T16:00:00Z", new Date("2026-10-20T17:00:00Z"))?.text).toBe("Encerrada");
    expect(deadlineState("2026-10-20T16:00:00Z", new Date("2026-10-20T16:00:00Z"))?.expired).toBe(true);
  });
  it("usa o dia local, sem arredondar horas restantes para um dia", () => {
    expect(deadlineState("2026-10-20T23:00:00Z", new Date("2026-10-20T17:00:00Z"))?.text).toBe("Encerra hoje");
    expect(deadlineState("2026-10-21T03:10:00Z", new Date("2026-10-21T02:50:00Z"))?.text).toBe("Encerra amanhã");
  });
  it("trata virada de ano e entradas inválidas", () => {
    expect(deadlineState("2027-01-02T15:00:00Z", new Date("2026-12-31T15:00:00Z"))?.days).toBe(2);
    expect(deadlineState("inválida")).toBeNull();
    expect(deadlineState(null)).toBeNull();
  });
});
