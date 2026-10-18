import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const templatePath = resolve("standalone/template.html");
const fixturePath = resolve("fixtures/pncp/ti-interview-sample.json");
const outputPath = resolve("Edital_Certo.html");
const marker = "/* PNCP_FIXTURE_SLOT */";

async function main() {
  const [template, fixtureText] = await Promise.all([
    readFile(templatePath, "utf8"),
    readFile(fixturePath, "utf8")
  ]);
  const fixture = JSON.parse(fixtureText);
  if (!Array.isArray(fixture?.response?.data) || fixture.response.data.length === 0) {
    throw new Error("A fixture PNCP precisa conter registros reais antes de gerar o HTML.");
  }
  if (!template.includes(marker)) {
    throw new Error("O ponto de inserção da fixture não foi encontrado no template HTML.");
  }
  const embeddedFixture = JSON.stringify(fixture).replaceAll("<", "\\u003c");
  const html = template.replace(marker, embeddedFixture);
  await writeFile(outputPath, html, { encoding: "utf8", mode: 0o644 });
  console.log(`HTML independente criado em ${outputPath} com ${fixture.response.data.length} registros reais do PNCP.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
