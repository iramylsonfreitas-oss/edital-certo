export type SourceStatusRun = {
  status: string;
  started_at: string;
  finished_at: string | null;
  pages_fetched: number | null;
  records_seen: number | null;
  records_inserted: number | null;
  records_updated: number | null;
};

function formatBrasiliaDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "data indisponível";
  return parsed
    .toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
    .replace(",", " às");
}

function formatRunMetrics(run: SourceStatusRun): string {
  const pages = run.pages_fetched ?? 0;
  const seen = run.records_seen ?? 0;
  const inserted = run.records_inserted ?? 0;
  const updated = run.records_updated ?? 0;
  return `${pages.toLocaleString("pt-BR")} páginas · ${seen.toLocaleString("pt-BR")} registros recebidos · ${inserted.toLocaleString("pt-BR")} novos · ${updated.toLocaleString("pt-BR")} atualizados`;
}

export function formatSourceStatus(run: SourceStatusRun): string {
  if (run.status === "running") {
    return `Coleta em andamento desde ${formatBrasiliaDate(run.started_at)}.`;
  }

  const completedAt = formatBrasiliaDate(run.finished_at ?? run.started_at);
  const metrics = formatRunMetrics(run);

  if (run.status === "succeeded") {
    return `Operacional · coleta concluída em ${completedAt} · ${metrics}.`;
  }

  if (run.status === "partial") {
    return `Coleta parcial, encerrada em ${completedAt} · ${metrics}. O restante será retomado no próximo ciclo automático.`;
  }

  if (run.status === "failed") {
    return `Falha na última coleta, encerrada em ${completedAt} · ${metrics}. O robô tentará novamente no próximo ciclo automático.`;
  }

  return `Status desconhecido da fonte PNCP · última atualização em ${completedAt}.`;
}
