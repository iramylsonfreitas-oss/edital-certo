export function resumableCheckpoint(run: { status?: string; checkpoint?: unknown } | undefined): unknown {
  return run?.status === "partial" || run?.status === "failed" ? run.checkpoint ?? null : null;
}
