import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

const enabled = process.env.PIPELINE_TEST_DISPOSABLE === "true" && process.env.NEXT_PUBLIC_SUPABASE_URL === "http://127.0.0.1:54321";
test.skip(!enabled,"Requires the disposable local comments fixture; never runs against a hosted project.");
function fixture():{card:string;password:string} { return JSON.parse(readFileSync(process.env.PIPELINE_TEST_FIXTURE!,"utf8")); }
async function login(page:Page,role:string) {
 await page.goto("/login");
 await page.getByLabel("E-mail",{exact:true}).fill(`comments-${role}@example.invalid`);
 await page.getByLabel("Senha",{exact:true}).fill(fixture().password);
 await page.getByRole("button",{name:"Entrar com senha"}).click();
 await expect(page).toHaveURL(/\/dashboard/, {timeout:30000});
}

test("admin publishes escaped text, sees persistence and confirms deletion",async({page})=>{
 await login(page,"admin");
 await page.goto("/pipeline");
 await page.getByRole("link",{name:"Ver comentários",exact:true}).click();
 await expect(page.getByRole("heading",{name:"Comentários do acompanhamento"})).toBeVisible();
 const body='Decisão registrada <script>window.commentInjected=true</script>\nRevisar habilitação.';
 await page.getByLabel("Comentário",{exact:true}).fill(body);
 await page.getByRole("button",{name:"Publicar comentário"}).click();
 await expect(page.getByRole("status")).toHaveText("Comentário publicado.");
 await expect(page.getByText(body,{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>"commentInjected" in window)).toBe(false);
 await page.reload();
 const item=page.getByRole("listitem").filter({hasText:body});
 await expect(item).toBeVisible();
 await item.getByText("Excluir comentário",{exact:true}).click();
 await item.getByRole("button",{name:"Confirmar exclusão",exact:true}).click();
 await expect(item).toBeVisible(); // Native confirmation is required.
 await item.getByRole("checkbox").check();
 await item.getByRole("button",{name:"Confirmar exclusão",exact:true}).click();
 await expect(page.getByRole("status")).toHaveText("Comentário excluído.");
 await expect(page.getByText(body,{exact:true})).toHaveCount(0);
});

test("reader browses stable pages without posting or moderation controls",async({page})=>{
 await login(page,"reader");
 await page.goto(`/pipeline/${fixture().card}`);
 await expect(page.getByRole("form",{name:"Novo comentário"})).toHaveCount(0);
 await expect(page.getByText("Excluir comentário",{exact:true})).toHaveCount(0);
 const first=await page.getByRole("listitem").allTextContents();
 expect(first).toHaveLength(20);
 await page.getByRole("link",{name:"Comentários anteriores"}).click();
 await expect(page).toHaveURL(/\?before=/);
 await expect(page.getByRole("listitem")).toHaveCount(3);
 const second=await page.getByRole("listitem").allTextContents();
 expect(second).toHaveLength(3);
 expect(new Set([...first,...second]).size).toBe(23);
 await page.getByRole("link",{name:"Mais recentes"}).click();
 await expect(page.getByRole("listitem")).toHaveCount(20);
});

test("another organization receives no card or comments",async({page})=>{
 await login(page,"outsider");
 const response=await page.goto(`/pipeline/${fixture().card}`);
 expect(response?.status()).toBe(404);
 await expect(page.getByText("Comentário inicial",{exact:false})).toHaveCount(0);
 await expect(page.getByRole("form",{name:"Novo comentário"})).toHaveCount(0);
});
