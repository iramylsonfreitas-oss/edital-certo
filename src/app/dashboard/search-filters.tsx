"use client";

import { healthCategories } from "@/lib/segments/health";
import { useState } from "react";
import Form from "next/form";
import Link from "next/link";

export type DashboardFilterValues = {
  segment: "it" | "health";
  healthCategory: string;
  query: string;
  uf: string;
  modality: string;
  sphere: string;
  minimumValue: string;
  maximumValue: string;
  closesBefore: string;
  sort: string;
  view: string;
  showClosed: boolean;
};

export function SearchFilters({ values, activeCount }: { values: DashboardFilterValues; activeCount: number }) {
  const [segment, setSegment] = useState(values.segment);
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <Form action="/dashboard" className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <label className="mb-4 block text-sm font-semibold">Segmento
        <select className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" name="segment" value={segment} onChange={event => setSegment(event.target.value === "health" ? "health" : "it")}>
          <option value="it">Tecnologia da Informação</option><option value="health">Saúde</option>
        </select>
      </label>
      {segment === "health" ? <label className="mb-4 block text-sm font-semibold">Área de saúde
        <select className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" name="healthCategory" defaultValue={values.healthCategory}>
          <option value="">Todas as áreas</option>{healthCategories.map(category => <option key={category.key} value={category.key}>{category.name}</option>)}
        </select>
      </label> : null}
      <label className="block text-sm font-semibold" htmlFor="opportunity-search">Buscar oportunidades</label>
      <input autoComplete="off" className="mt-2 block w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-slate-900" defaultValue={values.query} id="opportunity-search" maxLength={200} name="q" placeholder="notebook, suporte técnico..." />
      <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
        <button className="rounded-lg bg-blue-700 px-4 py-2.5 font-semibold text-white hover:bg-blue-800" type="submit">Buscar</button>
        <button aria-expanded={filtersOpen} className="rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-semibold dark:border-slate-600" onClick={() => setFiltersOpen((open) => !open)} type="button">
          Filtros{activeCount ? ` (${activeCount})` : ""}
        </button>
      </div>
      <div className={`mt-4 grid gap-3 ${filtersOpen ? "" : "hidden md:grid"}`}>
        <label className="text-sm font-medium">UF
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 uppercase text-slate-900" defaultValue={values.uf} maxLength={2} name="uf" placeholder="SP" />
        </label>
        <label className="text-sm font-medium">Código da modalidade
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={values.modality} inputMode="numeric" maxLength={20} name="modality" />
        </label>
        <label className="text-sm font-medium">Esfera
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={values.sphere} name="sphere">
            <option value="">Todas</option><option value="F">Federal</option><option value="E">Estadual</option><option value="M">Municipal</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm font-medium">Valor mínimo
            <input className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-slate-900" defaultValue={values.minimumValue} min="0" name="minimumValue" type="number" />
          </label>
          <label className="text-sm font-medium">Valor máximo
            <input className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 bg-white px-2 py-2 text-slate-900" defaultValue={values.maximumValue} min="0" name="maximumValue" type="number" />
          </label>
        </div>
        <label className="text-sm font-medium">Encerramento até
          <input className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={values.closesBefore} name="closesBefore" type="date" />
        </label>
        <label className="text-sm font-medium">Visualização
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={values.view} name="view">
            <option value="all">Todas</option><option value="favorites">Favoritas</option><option value="discarded">Descartadas</option>
          </select>
        </label>
        <label className="text-sm font-medium">Ordenar por
          <select className="mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" defaultValue={values.sort} name="sort">
            <option value="relevance">Maior aderência</option><option value="deadline">Prazo</option><option value="value">Maior valor</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input defaultChecked={values.showClosed} name="showClosed" type="checkbox" value="true" />
          Mostrar encerradas
        </label>
        <Link className="text-sm font-semibold text-blue-700 underline" href={values.segment === "health" ? "/dashboard?segment=health" : "/dashboard"}>Limpar filtros</Link>
      </div>
    </Form>
  );
}
