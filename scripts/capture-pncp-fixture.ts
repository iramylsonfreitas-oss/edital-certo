import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PncpConnector } from "../src/lib/connectors/pncp/connector";
import { pncpPageSchema } from "../src/lib/connectors/pncp/schema";

const datePattern = /^\d{8}$/;

async function main() {
  const fromDate = process.env.PNCP_FIXTURE_START_DATE;
  const toDate = process.env.PNCP_FIXTURE_END_DATE;
  const modalityCode = Number(process.env.PNCP_FIXTURE_MODALITY_CODE);

  if (!fromDate || !datePattern.test(fromDate) || !toDate || !datePattern.test(toDate)) {
    throw new Error("Defina PNCP_FIXTURE_START_DATE e PNCP_FIXTURE_END_DATE no formato AAAAMMDD.");
  }
  if (!Number.isInteger(modalityCode) || modalityCode < 0) {
    throw new Error("Defina PNCP_FIXTURE_MODALITY_CODE com código confirmado na tabela oficial do PNCP.");
  }

  const url = new URL("v1/contratacoes/publicacao", `${(process.env.PNCP_BASE_URL ?? "https://pncp.gov.br/api/consulta").replace(/\/$/, "")}/`);
  url.searchParams.set("dataInicial", fromDate);
  url.searchParams.set("dataFinal", toDate);
  url.searchParams.set("codigoModalidadeContratacao", String(modalityCode));
  url.searchParams.set("pagina", "1");
  url.searchParams.set("tamanhoPagina", "10");

  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`PNCP respondeu HTTP ${response.status}.`);

  const payload: unknown = await response.json();
  const parsedPage = pncpPageSchema.safeParse(payload);
  if (!parsedPage.success) {
    throw new Error("A resposta real divergiu do envelope esperado. Revise o schema com o Swagger atual antes de alterar o parser.");
  }
  const connector = new PncpConnector();
  const records = parsedPage.data.data.map((record) => connector.normalize(record));
  if (records.length === 0) {
    throw new Error("A resposta não trouxe contratações para salvar como fixture. Escolha outro período/modalidade.");
  }

  const fixture = {
    capturedAt: new Date().toISOString(),
    source: "PNCP",
    request: { path: url.pathname, query: Object.fromEntries(url.searchParams) },
    response: payload
  };
  const destination = resolve("fixtures/pncp/real-response.json");
  await mkdir(resolve("fixtures/pncp"), { recursive: true });
  await writeFile(destination, `${JSON.stringify(fixture, null, 2)}\n`, { flag: "w", mode: 0o600 });
  console.log(`Fixture real salva em ${destination} (${records.length} registros na primeira página).`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

