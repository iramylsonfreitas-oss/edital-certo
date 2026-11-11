import { z } from "zod";

export const commentInput = z.object({
  cardId: z.string().uuid(),
  commentId: z.string().uuid(),
  body: z.string().trim().min(1, "Escreva um comentário.").max(10000, "Use até 10.000 caracteres.")
});
const cursorSchema = z.object({ at: z.iso.datetime({ offset: true }), id: z.string().uuid() });
export type CommentCursor = z.infer<typeof cursorSchema>;
export function commentCursor(value: string | undefined): CommentCursor | null {
  if (!value || value.length > 256 || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(value, "base64url").toString("utf8")));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}
export function encodeCommentCursor(at: string, id: string): string {
  return Buffer.from(JSON.stringify(cursorSchema.parse({ at, id }))).toString("base64url");
}

export function canWriteComments(role: string | undefined): boolean {
  return role === "admin" || role === "analyst";
}
export function canDeleteComment(role: string | undefined, userId: string, authorId: string): boolean {
  return canWriteComments(role) && (role === "admin" || userId === authorId);
}
