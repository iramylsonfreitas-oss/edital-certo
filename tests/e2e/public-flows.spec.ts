import { expect, test } from "@playwright/test";

test("página inicial oferece cadastro e acesso", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /licitações compatíveis/i })).toBeVisible();
  await page.getByRole("link", { name: "Criar conta" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole("heading", { name: "Criar conta" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveAttribute("required", "");
});

test("página de login apresenta senha e magic link", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Acesse sua conta" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Entrar com senha" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Enviar link mágico" })).toBeDisabled();
});

test("cancelamento público pede confirmação sem sessão", async ({ page }) => {
  await page.goto("/email/unsubscribe?token=" + "a".repeat(64));
  await expect(page.getByRole("heading", { name: "Cancelar alertas por e-mail", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar cancelamento" })).toBeVisible();
  await expect(page.locator("form")).toHaveAttribute("method", "post");
  await expect(page).toHaveURL(/\/email\/unsubscribe\?token=/);
});

test("integração pública fica fechada sem configuração", async ({ request }) => {
  expect((await request.get("/email/unsubscribe?token=invalid")).status()).toBe(400);
  expect((await request.post("/api/email/events", { data: {} })).status()).toBe(503);
});
