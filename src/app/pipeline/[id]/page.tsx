import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { AppNavigation } from "@/components/app-navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { canDeleteComment, canWriteComments, commentCursor, encodeCommentCursor } from "@/lib/pipeline/comments";
import { AddCommentForm, DeleteCommentForm } from "./comment-forms";

export const dynamic = "force-dynamic";
type Comment = { id: string; author_user_id: string; author_name: string; body: string; created_at: string };

export default async function PipelineCommentsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ before?: string; notice?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const cursor = commentCursor(query.before);
  if (query.before && !cursor) notFound();
  const client = await createSupabaseServerClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: card, error: cardError } = await client.from("pipeline_cards")
    .select("id,organization_id,archived_at,tenders!inner(id,title)").eq("id", id).maybeSingle();
  if (cardError) throw new Error("Não foi possível carregar o acompanhamento.");
  if (!card) notFound();
  let commentsQuery = client.from("comments").select("id,author_user_id,author_name,body,created_at")
    .eq("pipeline_card_id", id).eq("organization_id", card.organization_id)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(21);
  if (cursor) commentsQuery = commentsQuery.or(`created_at.lt.${cursor.at},and(created_at.eq.${cursor.at},id.lt.${cursor.id})`);
  const [commentsResult, membership] = await Promise.all([
    commentsQuery,
    client.from("memberships").select("role").eq("organization_id", card.organization_id).eq("user_id", auth.user.id).maybeSingle()
  ]);
  const role = membership.error ? undefined : membership.data?.role;
  const comments = (commentsResult.data ?? []) as Comment[];
  const visible = comments.slice(0, 20);
  const last = visible.at(-1);
  const tender = Array.isArray(card.tenders) ? card.tenders[0] : card.tenders;
  const returnUrl = card.archived_at ? "/pipeline?view=archived" : "/pipeline";
  return <main className="mx-auto min-h-screen max-w-3xl px-4 py-8 pb-28 md:pb-8">
    <header className="border-b border-slate-200 pb-5 dark:border-slate-700">
      <Link href={returnUrl} className="text-sm font-semibold text-blue-700">← Voltar ao pipeline</Link>
      <h1 className="mt-3 text-2xl font-bold">Comentários do acompanhamento</h1>
      <div className="mt-4"><AppNavigation active="/pipeline" /></div>
    </header>
    <section className="mt-6">
      <h2 className="text-lg font-semibold"><Link href={`/tenders/${tender.id}`} className="hover:text-blue-700">{tender.title}</Link></h2>
      {card.archived_at ? <p className="mt-2 text-sm text-slate-600">Acompanhamento arquivado. O histórico continua disponível.</p> : null}
      {query.notice === "comment-added" || query.notice === "comment-deleted" ? <p role="status" className="mt-3 text-sm text-emerald-700">{query.notice === "comment-added" ? "Comentário publicado." : "Comentário excluído."}</p> : null}
      {canWriteComments(role) ? <AddCommentForm cardId={id} commentId={crypto.randomUUID()} /> : <p className="mt-5 text-sm text-slate-600">Seu acesso permite consultar os comentários. Administradores e analistas podem comentar.</p>}
    </section>
    <section aria-label="Histórico de comentários" className="mt-8">
      <h2 className="text-lg font-semibold">Histórico</h2>
      {commentsResult.error ? <p role="alert" className="mt-4 text-rose-700">Não foi possível carregar os comentários. Atualize a página.</p> : <>
        {visible.length === 0 ? <p className="mt-4 text-sm text-slate-600">{cursor ? "Não há mais comentários nesta página." : "Nenhum comentário neste acompanhamento."}</p> : <ul className="mt-4 grid gap-4">
          {visible.map((comment) => <li key={comment.id} className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap justify-between gap-2 text-sm text-slate-600 dark:text-slate-300">
              <p className="font-semibold">{comment.author_user_id === auth.user!.id ? "Você" : comment.author_name || "Integrante da equipe"}</p>
              <time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString("pt-BR", { timeZone: "America/Boa_Vista", dateStyle: "short", timeStyle: "short" })}</time>
            </div>
            <p className="mt-3 whitespace-pre-wrap break-words">{comment.body}</p>
            {canDeleteComment(role, auth.user!.id, comment.author_user_id) ? <DeleteCommentForm cardId={id} commentId={comment.id} /> : null}
          </li>)}
        </ul>}
        <nav aria-label="Páginas de comentários" className="mt-5 flex gap-5 text-sm font-semibold text-blue-700">
          {cursor ? <Link href={`/pipeline/${id}`}>Mais recentes</Link> : null}
          {comments.length > 20 && last ? <Link href={`/pipeline/${id}?before=${encodeCommentCursor(last.created_at, last.id)}`}>Comentários anteriores</Link> : null}
        </nav>
        <p className="mt-3 text-xs text-slate-500">Horários de Boa Vista (UTC−4). Os mais recentes aparecem primeiro.</p>
      </>}
    </section>
  </main>;
}
