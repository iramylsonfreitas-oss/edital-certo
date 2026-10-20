import Link from "next/link";
import { fetchTenderFiles, fetchTenderItems } from "@/lib/connectors/pncp/attachments";

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function TenderItems({ sourceId, tenderId, page }: { sourceId: string; tenderId: string; page: number }) {
  const result = await fetchTenderItems(sourceId, page);
  return <>
    {result.status === "unavailable" ? <p role="status" className="mt-3 text-sm text-amber-800 dark:text-amber-200">Não foi possível consultar os itens no PNCP agora. Tente novamente mais tarde ou consulte a fonte oficial abaixo.</p> : null}
    {result.status === "empty" ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{page === 1 ? "O PNCP não retornou itens para esta contratação." : "Não há mais itens nesta página."}</p> : null}
    {result.records.length ? <ul className="mt-3 grid gap-3">{result.records.map((item) => <li key={item.number} className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <h3 className="break-words font-semibold">Item {item.number}</h3>
      <p className="mt-1 whitespace-pre-wrap break-words text-sm">{item.description}</p>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-500">Quantidade</dt><dd>{item.quantity == null ? "Não informada" : `${item.quantity.toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ${item.unit ?? "unidades"}`}</dd></div>
        <div><dt className="text-slate-500">Situação</dt><dd>{item.status ?? "Não informada"}</dd></div>
        <div><dt className="text-slate-500">Valor unitário estimado</dt><dd>{item.budgetIsSecret ? "Orçamento sigiloso" : item.unitValue == null ? "Não informado" : money(item.unitValue)}</dd></div>
        <div><dt className="text-slate-500">Valor total estimado</dt><dd>{item.budgetIsSecret ? "Orçamento sigiloso" : item.totalValue == null ? "Não informado" : money(item.totalValue)}</dd></div>
      </dl>
      {item.catalogCode ? <p className="mt-2 text-xs text-slate-500">Código no catálogo da fonte: {item.catalogCode}</p> : null}
    </li>)}</ul> : null}
    {page > 1 || result.hasMore ? <nav aria-label="Paginação dos itens" className="mt-4 flex flex-wrap items-center gap-3 text-sm">
      {page > 1 ? <Link prefetch={false} className="rounded-lg border px-3 py-2 font-semibold text-blue-700 dark:text-blue-300" href={`/tenders/${tenderId}?itemsPage=${page - 1}#itens`}>Itens anteriores</Link> : null}
      <span>Página {page}</span>
      {result.hasMore && page < 1000 ? <Link prefetch={false} className="rounded-lg border px-3 py-2 font-semibold text-blue-700 dark:text-blue-300" href={`/tenders/${tenderId}?itemsPage=${page + 1}#itens`}>Próximos itens</Link> : null}
    </nav> : null}
    {result.status === "ready" ? <p className="mt-3 text-xs text-slate-500">Dados consultados no PNCP. Confira o edital e eventuais retificações antes de preparar a proposta.</p> : null}
  </>;
}

export async function TenderFiles({ sourceId }: { sourceId: string }) {
  const result = await fetchTenderFiles(sourceId);
  if (result.status === "unavailable") return <p role="status" className="mt-3 text-sm text-amber-800 dark:text-amber-200">Não foi possível consultar os documentos no PNCP agora. Tente novamente mais tarde ou consulte a fonte oficial abaixo.</p>;
  if (result.status === "empty") return <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">O PNCP não retornou documentos ativos para esta contratação.</p>;
  return <ul className="mt-3 grid gap-3">{result.records.map((file) => <li className="min-w-0 rounded-xl border border-slate-200 p-4 dark:border-slate-700" key={file.number}>
    <h3 className="break-words font-semibold">{file.title}</h3>
    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{file.type ?? "Documento"}{file.publishedAt ? ` · publicado em ${new Date(file.publishedAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""}</p>
    {file.url ? <a className="mt-3 inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-blue-700 dark:border-slate-600 dark:text-blue-300" href={file.url} rel="noopener noreferrer" target="_blank">Abrir documento oficial</a> : <p className="mt-2 text-sm text-slate-500">Documento sem link válido na fonte.</p>}
  </li>)}</ul>;
}
