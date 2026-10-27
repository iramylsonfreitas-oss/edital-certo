import { describe, expect, it } from "vitest";
import { canDeleteComment, canWriteComments, commentCursor, commentInput, encodeCommentCursor } from "./comments";

const id = "00000000-0000-4000-8000-000000000001";
describe("comment boundaries", () => {
  it("rejects blank, oversized and forged input", () => {
    for (const body of ["", " \n\t ", "x".repeat(10001)]) expect(commentInput.safeParse({cardId:id,commentId:id,body}).success).toBe(false);
    expect(commentInput.safeParse({cardId:"bad",commentId:id,body:"Texto"}).success).toBe(false);
    expect(commentInput.parse({cardId:id,commentId:id,body:"  decisão\nregistrada  "}).body).toBe("decisão\nregistrada");
  });
  it("keeps timestamp precision and UUID as a stable cursor tie-breaker", () => {
    const at = "2026-10-27T11:00:00.123456+00:00";
    expect(commentCursor(encodeCommentCursor(at,id))).toEqual({at,id});
    for (const value of [undefined,"!bad", "a".repeat(257),Buffer.from('{"at":"now),id.eq.fake","id":"'+id+'"}').toString("base64url")]) {
      expect(commentCursor(value)).toBeNull();
    }
  });
  it("limits writes and deletion controls to the existing role rules", () => {
    expect(canWriteComments("reader")).toBe(false);
    expect(canWriteComments(undefined)).toBe(false);
    expect(canDeleteComment("reader",id,id)).toBe(false);
    expect(canDeleteComment("analyst",id,id)).toBe(true);
    expect(canDeleteComment("analyst",id,"other")).toBe(false);
    expect(canDeleteComment("admin",id,"other")).toBe(true);
  });
});
