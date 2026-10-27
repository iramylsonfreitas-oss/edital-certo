export type PublicationGroup = { tender_id: string; related_ids: string[] };

export function publicationGroupMap(groups: PublicationGroup[]): Map<string, string> {
  const result = new Map<string, string>();
  for (const group of groups) {
    const primary = group.related_ids[0] ?? group.tender_id;
    for (const id of [group.tender_id, ...group.related_ids]) result.set(id, primary);
  }
  return result;
}

export function groupedFeedback(rows: Array<{ tender_id: string; state: string }>, groups: Map<string, string>): Map<string, "favorite" | "discarded"> {
  const result = new Map<string, "favorite" | "discarded">();
  for (const row of rows) {
    if (row.state !== "favorite" && row.state !== "discarded") continue;
    const id = groups.get(row.tender_id) ?? row.tender_id;
    if (result.get(id) !== "favorite") result.set(id, row.state);
  }
  return result;
}

export function groupPublications<T extends { id: string }>(rows: T[], groups: Map<string, string>): T[] {
  const result = new Map<string, T>();
  for (const row of rows) {
    const id = groups.get(row.id) ?? row.id;
    if (!result.has(id) || row.id === id) result.set(id, { ...row, id });
  }
  return [...result.values()];
}
