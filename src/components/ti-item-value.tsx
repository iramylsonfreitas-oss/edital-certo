import { tenderValue } from "@/lib/pncp/presentation";

export type TiItemSummary = {
  tender_id: string;
  item_count: number;
  ti_item_count: number;
  ti_estimated_value: number | null;
  item_estimated_value: number | null;
  complete_values: boolean;
  items_complete: boolean;
};

export function TiItemValue({ summary }: { summary: TiItemSummary | undefined }) {
  if (!summary || Number(summary.ti_item_count) === 0) return null;
  const total = Number(summary.item_estimated_value);
  const ti = Number(summary.ti_estimated_value);
  const full = summary.items_complete && summary.complete_values && total > 0;
  return <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-200">
    {full
      ? `Itens de TI: ${tenderValue(ti)} · ${(100 * ti / total).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do valor dos itens`
      : `TI identificada em ${summary.ti_item_count} de ${summary.item_count} itens consultados · percentual indisponível: coleta ou valores incompletos`}
  </p>;
}
