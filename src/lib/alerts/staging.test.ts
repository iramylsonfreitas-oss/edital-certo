import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareStoredDigestBatch } from "./stored-worker.ts";
import { runStagingBatch, stagingSender } from "./staging";

vi.mock("./stored-worker.ts", () => ({ prepareStoredDigestBatch: vi.fn() }));
const prepare = vi.mocked(prepareStoredDigestBatch);
const client = { rpc: vi.fn() };
beforeEach(() => vi.resetAllMocks());

describe("development staging batch", () => {
  it("stops at five messages without sending or claiming attempts", async () => {
    prepare.mockResolvedValue({ prepared: 1, stopped: "limit" });
    expect(await runStagingBatch(client, () => 1_000)).toEqual({ staged: 5, exhausted: false });
    expect(prepare).toHaveBeenCalledTimes(5);
    expect(prepare).toHaveBeenCalledWith(client, { from: stagingSender, limit: 1, now: new Date(1_000) });
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it("reports exhaustion without another reservation", async () => {
    prepare.mockResolvedValueOnce({ prepared: 1, stopped: "limit" }).mockResolvedValueOnce({ prepared: 0, stopped: "empty" });
    expect(await runStagingBatch(client, () => 0)).toEqual({ staged: 1, exhausted: true });
    expect(prepare).toHaveBeenCalledTimes(2);
  });
  it("does not start another message after the time budget", async () => {
    const clock = vi.fn().mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValueOnce(45_000);
    prepare.mockResolvedValue({ prepared: 1, stopped: "limit" });
    expect(await runStagingBatch(client, clock)).toEqual({ staged: 1, exhausted: false });
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("stops on an ambiguous failure instead of reserving again", async () => {
    prepare.mockResolvedValue({ prepared: 0, stopped: "error" });
    await expect(runStagingBatch(client, () => 0)).rejects.toThrow("EMAIL_STAGING_PREPARATION_FAILED");
    expect(prepare).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid and backwards clocks before preparing another message", async () => {
    for (const values of [[NaN], [100, NaN], [100, 99]]) {
      prepare.mockClear();
      let i = 0;
      await expect(runStagingBatch(client, () => values[i++])).rejects.toThrow("EMAIL_STAGING_CLOCK_INVALID");
      expect(prepare).not.toHaveBeenCalled();
    }
  });
});
