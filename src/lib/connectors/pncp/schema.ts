import { z } from "zod";

const nullableText = z.union([z.string(), z.number()]).transform((value) => String(value)).nullable().optional();

export const pncpTenderSchema = z.object({
  numeroControlePNCP: z.string().min(1),
  numeroCompra: nullableText,
  anoCompra: z.number().int().nullable().optional(),
  modalidadeId: z.union([z.number(), z.string()]).nullable().optional(),
  modalidadeNome: z.string().nullable().optional(),
  situacaoCompraNome: z.string().nullable().optional(),
  objetoCompra: z.string().default(""),
  valorTotalEstimado: z.number().nullable().optional(),
  dataPublicacaoPncp: z.string().nullable().optional(),
  dataAberturaProposta: z.string().nullable().optional(),
  dataEncerramentoProposta: z.string().nullable().optional(),
  dataAtualizacao: z.string().nullable().optional(),
  linkSistemaOrigem: z.string().nullable().optional(),
  orgaoEntidade: z.object({
    cnpj: z.string().nullable().optional(),
    razaoSocial: z.string().nullable().optional(),
    poderId: z.string().nullable().optional(),
    esferaId: z.string().nullable().optional()
  }).nullable().optional(),
  unidadeOrgao: z.object({
    ufSigla: z.string().nullable().optional(),
    codigoIbge: z.union([z.string(), z.number()]).nullable().optional(),
    municipioId: z.union([z.string(), z.number()]).nullable().optional(),
    municipioNome: z.string().nullable().optional(),
    codigoUnidade: z.string().nullable().optional(),
    nomeUnidade: z.string().nullable().optional()
  }).nullable().optional()
}).passthrough();

export const pncpPageSchema = z.object({
  data: z.array(z.unknown()),
  numeroPagina: z.number().int().positive(),
  totalPaginas: z.number().int().nonnegative(),
  paginasRestantes: z.number().int().nonnegative()
}).passthrough();

export type PncpTender = z.infer<typeof pncpTenderSchema>;
export type PncpPage = z.infer<typeof pncpPageSchema>;

