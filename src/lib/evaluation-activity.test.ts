import { describe, expect, it } from "vitest";
import { formatEvaluationActivity, shouldRecordEvaluatorAccess } from "./evaluation-activity";

describe("evaluation activity", () => {
  it("records navigation while excluding prefetches and non-navigation requests", () => {
    expect(shouldRecordEvaluatorAccess("GET", new Headers())).toBe(true);
    for (const method of ["POST", "HEAD", "OPTIONS"]) expect(shouldRecordEvaluatorAccess(method, new Headers())).toBe(false);
    for (const [name, value] of [["next-router-prefetch", "1"], ["x-middleware-prefetch", "1"], ["purpose", "prefetch"], ["sec-purpose", "prefetch;prerender"]]) {
      expect(shouldRecordEvaluatorAccess("GET", new Headers([[name, value]]))).toBe(false);
    }
  });
  it("uses the stated timezone across a UTC date boundary", () => {
    expect(formatEvaluationActivity("2026-10-28T01:23:00Z")).toBe("27/10/2026, 22:23");
    expect(formatEvaluationActivity(null)).toBeNull();
    expect(formatEvaluationActivity("invalid")).toBeNull();
  });
});
