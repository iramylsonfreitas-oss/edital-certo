"use client";

import { useActionState } from "react";
import { addCommentAction, deleteCommentAction, type CommentActionState } from "./actions";

const initialState: CommentActionState = { error: "" };
export function AddCommentForm({ cardId, commentId }: { cardId: string; commentId: string }) {
  const [state, action, pending] = useActionState(addCommentAction, initialState);
  return <form action={action} className="mt-6 grid gap-3" aria-label="Novo comentário">
    <input type="hidden" name="cardId" value={cardId} />
    <input type="hidden" name="commentId" value={commentId} />
    <label className="grid gap-2 text-sm font-semibold">Comentário
      <textarea name="body" defaultValue={state.body ?? ""} required maxLength={10000} rows={4} disabled={pending}
        className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900" aria-describedby="comment-help" />
    </label>
    <p id="comment-help" className="text-xs text-slate-500">Até 10.000 caracteres. Visível para os membros da organização.</p>
    <button type="submit" disabled={pending} className="justify-self-start rounded-lg bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-60">{pending ? "Publicando…" : "Publicar comentário"}</button>
    {state.error ? <p role="alert" className="text-sm text-rose-700">{state.error}</p> : null}
  </form>;
}

export function DeleteCommentForm({ cardId, commentId }: { cardId: string; commentId: string }) {
  const [state, action, pending] = useActionState(deleteCommentAction, initialState);
  return <details className="mt-3 text-sm">
    <summary className="cursor-pointer font-semibold text-rose-700">Excluir comentário</summary>
    <form action={action} className="mt-3 grid gap-3" aria-label="Confirmar exclusão">
      <input type="hidden" name="cardId" value={cardId} />
      <input type="hidden" name="commentId" value={commentId} />
      <label className="flex gap-2"><input type="checkbox" name="confirm" value="yes" required disabled={pending} />Confirmo a exclusão deste comentário.</label>
      <button type="submit" disabled={pending} className="justify-self-start rounded-lg border border-rose-300 px-3 py-2 text-rose-700 disabled:opacity-60">{pending ? "Excluindo…" : "Confirmar exclusão"}</button>
      {state.error ? <p role="alert" className="text-rose-700">{state.error}</p> : null}
    </form>
  </details>;
}
