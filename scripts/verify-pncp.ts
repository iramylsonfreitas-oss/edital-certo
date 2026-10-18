import { PncpConnector } from "../src/lib/connectors/pncp/connector";

function todayAsPncpDate(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

async function main() {
  const modalityCodes = (process.env.PNCP_MODALITY_CODES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map(Number)
    .filter((value) => Number.isInteger(value) && value >= 0);

  if (modalityCodes.length === 0) {
    throw new Error("Defina PNCP_MODALITY_CODES com códigos conferidos na tabela oficial de domínio.");
  }

  const date = todayAsPncpDate();
  const connector = new PncpConnector();
  const results = await Promise.allSettled(
    modalityCodes.map((modalityCode) =>
      connector.fetchNew({
        fromDate: date,
        toDate: date,
        modalityCode,
        page: 1,
        pageSize: 10
      })
    )
  );

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    if (result?.status === "fulfilled") {
      console.log(JSON.stringify({
        modalityCode: modalityCodes[index],
        currentPage: result.value.currentPage,
        totalPages: result.value.totalPages,
        records: result.value.records.length
      }));
    } else if (result?.status === "rejected") {
      console.error(JSON.stringify({
        modalityCode: modalityCodes[index],
        error: result.reason instanceof Error ? result.reason.message : String(result.reason)
      }));
    }
  }

  if (results.some((result) => result.status === "rejected")) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

