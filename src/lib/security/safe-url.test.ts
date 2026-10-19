import { describe, expect, it } from "vitest";
import { toSafeHttpUrl } from "./safe-url";

describe("toSafeHttpUrl", () => {
  it("allows only absolute HTTP and HTTPS URLs", () => {
    expect(toSafeHttpUrl("https://pncp.gov.br/contratacao/123")).toBe("https://pncp.gov.br/contratacao/123");
    expect(toSafeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(toSafeHttpUrl("/relative/path")).toBeNull();
  });
});
