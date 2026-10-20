import { describe, expect, it } from "vitest";
import { formatSourceStatus, type SourceStatusRun } from "./source-status";

const baseRun: SourceStatusRun = {
  status: "partial",
  started_at: "2026-10-19T15:00:10.671Z",
  finished_at: "2026-10-19T15:01:23.034Z",
  pages_fetched: 10,
  records_seen: 500,
  records_inserted: 472,
  records_updated: 28
};

describe("formatSourceStatus", () => {
  it("identifica uma coleta parcial já encerrada e informa que continuará", () => {
    const text = formatSourceStatus(baseRun);
    expect(text).toContain("Coleta parcial, encerrada em 19/10/2026 às 12:01");
    expect(text).toContain("10 páginas");
    expect(text).toContain("500 registros recebidos");
    expect(text).toContain("retomado no próximo ciclo automático");
    expect(text).not.toContain("em andamento");
  });

  it("identifica uma coleta em andamento usando a hora de início", () => {
    const text = formatSourceStatus({ ...baseRun, status: "running", finished_at: null });
    expect(text).toContain("Coleta em andamento desde 19/10/2026 às 12:00");
  });

  it("identifica uma coleta concluída", () => {
    const text = formatSourceStatus({ ...baseRun, status: "succeeded" });
    expect(text).toContain("Operacional · coleta concluída");
  });

  it("identifica uma falha e informa a próxima tentativa automática", () => {
    const text = formatSourceStatus({ ...baseRun, status: "failed" });
    expect(text).toContain("Falha na última coleta");
    expect(text).toContain("tentará novamente no próximo ciclo automático");
  });
});
