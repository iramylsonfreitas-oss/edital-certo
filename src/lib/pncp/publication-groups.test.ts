import { expect, it } from "vitest";
import { groupedFeedback, groupPublications, publicationGroupMap } from "./publication-groups";

const groups = publicationGroupMap([{ tender_id: "rich", related_ids: ["rich", "brief"] }, { tender_id: "unique", related_ids: ["unique"] }]);
it("uses the richer public record without dropping singleton records", () => {
  expect(groupPublications([{ id:"brief",title:"brief" },{ id:"rich",title:"complete" },{ id:"unique",title:"other" }],groups))
    .toEqual([{id:"rich",title:"complete"},{id:"unique",title:"other"}]);
});
it("retains favorites on a secondary publication and counts the opportunity once", () => {
  expect([...groupedFeedback([{tender_id:"brief",state:"favorite"}],groups)]).toEqual([["rich","favorite"]]);
});
it("preserves an existing favorite when old source states conflict, independently of order", () => {
  for (const rows of [[{tender_id:"brief",state:"favorite"},{tender_id:"rich",state:"discarded"}], [{tender_id:"rich",state:"discarded"},{tender_id:"brief",state:"favorite"}]]) {
    expect(groupedFeedback(rows,groups).get("rich")).toBe("favorite");
  }
});
it("maps every related ID for existing pipeline cards and tolerates older singleton data", () => {
  expect(groups.get("brief")).toBe("rich");
  expect(publicationGroupMap([{tender_id:"old",related_ids:[]}]).get("old")).toBe("old");
});
