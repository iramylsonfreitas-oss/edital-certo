import { describe, expect, it } from "vitest";
import { resumableCheckpoint } from "./resume-checkpoint";

describe("ingestion checkpoint cycle", () => {
  it("resumes incomplete work but starts a new cycle after success", () => {
    const checkpoint = { page: 7, modalityIndex: 1 };
    expect(resumableCheckpoint({ status: "partial", checkpoint })).toEqual(checkpoint);
    expect(resumableCheckpoint({ status: "failed", checkpoint })).toEqual(checkpoint);
    expect(resumableCheckpoint({ status: "succeeded", checkpoint })).toBeNull();
    expect(resumableCheckpoint({ status: "running", checkpoint })).toBeNull();
    expect(resumableCheckpoint(undefined)).toBeNull();
  });
});
