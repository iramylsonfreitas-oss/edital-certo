"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { commentInput } from "@/lib/pipeline/comments";

export type CommentActionState = { error: string; body?: string };

export async function addCommentAction(_previous: CommentActionState, form: FormData): Promise<CommentActionState> {
  const parsed = commentInput.safeParse({ cardId: form.get("cardId"), commentId: form.get("commentId"), body: form.get("body") });
  if (!parsed.success) return { error: "Escreva um comentário de até 10.000 caracteres.", body: String(form.get("body") ?? "").slice(0, 10000) };
  const { cardId, commentId, body } = parsed.data;
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  // Derive organization from the visible card; never trust a submitted organization/author.
  const { data: card, error: cardError } = await client.from("pipeline_cards").select("organization_id").eq("id", cardId).maybeSingle();
  if (cardError || !card) return { error: "Cartão indisponível ou sem permissão.", body };
  const result = await client.from("comments").insert({ id: commentId, organization_id: card.organization_id,
    pipeline_card_id: cardId, author_user_id: auth.user.id, body }).select("id").single();
  if (result.error) {
    // A repeated POST after a lost response acknowledges only this exact author's content.
    if (result.error.code !== "23505") return { error: "Não foi possível comentar. Confira sua permissão e tente novamente.", body };
    const { data: existing, error } = await client.from("comments").select("id,body").eq("id", commentId)
      .eq("pipeline_card_id", cardId).eq("organization_id", card.organization_id).eq("author_user_id", auth.user.id).maybeSingle();
    if (error || !existing || existing.body !== body) return { error: "Não foi possível comentar. Atualize a página e tente novamente.", body };
  }
  revalidatePath(`/pipeline/${cardId}`);
  redirect(`/pipeline/${cardId}?notice=comment-added`);
}

export async function deleteCommentAction(_previous: CommentActionState, form: FormData): Promise<CommentActionState> {
  const parsed = z.object({ cardId: z.string().uuid(), commentId: z.string().uuid(), confirm: z.literal("yes") })
    .safeParse({ cardId: form.get("cardId"), commentId: form.get("commentId"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: "Confirme a exclusão do comentário." };
  const { cardId, commentId } = parsed.data;
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data, error } = await client.from("comments").delete().eq("id", commentId).eq("pipeline_card_id", cardId).select("id").maybeSingle();
  // RLS can return no rows without an error; never report a denied deletion as successful.
  if (error || !data) return { error: "Não foi possível excluir. Confira sua permissão e atualize a página." };
  revalidatePath(`/pipeline/${cardId}`);
  redirect(`/pipeline/${cardId}?notice=comment-deleted`);
}
