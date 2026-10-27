import { expect, test, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const enabled=process.env.NAVIGATION_TEST_DISPOSABLE==="true" && process.env.NEXT_PUBLIC_SUPABASE_URL==="http://127.0.0.1:54321";
test.skip(!enabled,"Requires disposable local navigation accounts.");
async function login(page:Page) {
 await page.goto("/login");
 await page.getByLabel("E-mail",{exact:true}).fill("navigation-admin@example.invalid");
 await page.getByLabel("Senha",{exact:true}).fill("local-navigation-only-6419");
 await page.getByRole("button",{name:"Entrar com senha"}).click();
 await expect(page.getByText(/53 oportunidade\(s\) encontradas/)).toBeVisible({timeout:30000});
}

test("manager blocks and reactivates an existing evaluation session",async({page,browser})=>{
 await login(page);
 await page.goto("/settings/access");
 await expect(page.getByText("Avaliador sintético",{exact:true})).toBeVisible();
 const context=await browser.newContext({viewport:{width:360,height:740}});
 try {
   const evaluator=await context.newPage();
   await evaluator.goto("/login");
   await evaluator.getByLabel("E-mail",{exact:true}).fill("navigation-evaluator@example.invalid");
   await evaluator.getByLabel("Senha",{exact:true}).fill("local-navigation-only-6419");
   await evaluator.getByRole("button",{name:"Entrar com senha"}).click();
   await expect(evaluator.getByRole("heading",{name:"Oportunidades",exact:true})).toBeVisible({timeout:30000});
   await evaluator.goto("/settings/access");
   await expect(evaluator.getByText("Nenhum acesso de avaliação sob sua gestão.",{exact:true})).toBeVisible();
   const api=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
   const signed=await api.auth.signInWithPassword({email:"navigation-evaluator@example.invalid",password:"local-navigation-only-6419"});
   expect(signed.error).toBeNull();
   expect((await api.from("tenders").select("id").limit(1)).data).toHaveLength(1);
   await page.getByRole("button",{name:"Bloquear acesso",exact:true}).click();
   await expect(page.getByText("Status: Bloqueado",{exact:true})).toBeVisible();
   expect((await api.from("tenders").select("id").limit(1)).data).toHaveLength(0);
   const escalation=await api.rpc("set_evaluator_access",{target_user:signed.data.user!.id,access_enabled:true});
   expect(escalation.error?.code).toBe("42501");
   await evaluator.goto("/dashboard?segment=health");
   await expect(evaluator.getByRole("heading",{name:"Acesso de avaliação bloqueado",exact:true})).toBeVisible();
   await page.getByRole("button",{name:"Reativar acesso",exact:true}).click();
   await expect(page.getByText("Status: Ativo",{exact:true})).toBeVisible();
   expect((await api.from("tenders").select("id").limit(1)).data).toHaveLength(1);
   await evaluator.goto("/dashboard");
   await expect(evaluator.getByRole("heading",{name:"Oportunidades",exact:true})).toBeVisible();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
 } finally { await context.close(); }
});
test("search and clear filters preserve the document and account session",async({page})=>{
 await login(page);
 await page.evaluate(()=>{document.documentElement.dataset.navigationMarker="same-document";});
 await page.getByLabel("Buscar oportunidades",{exact:true}).fill("nobreak");
 await page.getByRole("button",{name:"Buscar",exact:true}).click();
 await expect(page).toHaveURL(/q=nobreak/);
 await expect(page.getByText(/1 oportunidade\(s\) encontradas/)).toBeVisible();
 expect(await page.locator("html").getAttribute("data-navigation-marker")).toBe("same-document");
 await page.getByRole("link",{name:"Limpar filtros",exact:true}).click();
 await expect(page.getByText(/53 oportunidade\(s\) encontradas/)).toBeVisible();
 await expect(page.getByLabel("Buscar oportunidades",{exact:true})).toHaveValue("");
 expect(await page.locator("html").getAttribute("data-navigation-marker")).toBe("same-document");
});

test("panel separates TI and health and agrees with the unfiltered opportunity list", async({page})=>{
 await login(page);
 await page.goto("/panel");
 await expect(page.getByText("53 oportunidades abertas neste segmento", {exact:true})).toBeVisible();
 await page.getByRole("navigation", {name:"Segmento do painel",exact:true}).getByRole("link",{name:"Saúde",exact:true}).click();
 await expect(page.getByText("54 oportunidades abertas neste segmento", {exact:true})).toBeVisible();
 await page.getByRole("link",{name:"Ver oportunidades",exact:true}).click();
 await expect(page.getByText(/54 oportunidade\(s\) encontradas/)).toBeVisible();
});

test("equivalent publications keep secondary favorites and pipeline history",async({page})=>{
 await login(page);
 await expect(page.getByRole("heading",{name:"Notebook de paginação 1 - publicação alternativa",exact:true})).toHaveCount(0);
 await page.getByRole("link",{name:"2 publicações reunidas · ver fontes",exact:true}).click();
 const publications=page.getByRole("region",{name:"Publicações do edital",exact:true});
 await expect(publications.getByRole("listitem")).toHaveCount(2);
 const actions=page.getByRole("region",{name:"Ações da oportunidade",exact:true});
 await expect(actions.getByRole("button",{name:"Remover favorito",exact:true})).toBeVisible();
 await expect(actions.getByRole("link",{name:"Abrir no pipeline",exact:true})).toBeVisible();
 await actions.getByRole("button",{name:"Remover favorito",exact:true}).click();
 await expect(actions.getByRole("button",{name:"Favoritar",exact:true})).toBeVisible();
 await actions.getByRole("link",{name:"Abrir no pipeline",exact:true}).click();
 expect(await page.getByLabel("Anotações",{exact:true}).evaluateAll(elements => elements.some(element => (element as HTMLTextAreaElement).value === "Anotação de publicação secundária"))).toBe(true);
});

test("detail follows a tender and blue links retain white text",async({page})=>{
 await login(page);
 await page.getByLabel("Buscar oportunidades",{exact:true}).fill("software");
 await page.getByRole("button",{name:"Buscar",exact:true}).click();
 await page.getByRole("link",{name:"Software de teste de navegação",exact:true}).click();
 const actions=page.getByRole("region",{name:"Ações da oportunidade",exact:true});
 await actions.getByRole("button",{name:"Acompanhar",exact:true}).click();
 const link=actions.getByRole("link",{name:"Abrir no pipeline",exact:true});
 await expect(link).toBeVisible();
 await expect(link).toHaveCSS("color","rgb(255, 255, 255)");
 await page.emulateMedia({colorScheme:"dark"});
 await expect(link).toHaveCSS("color","rgb(255, 255, 255)");
});
test("mobile page switches keep the session and isolate organization data",async({page})=>{
 await page.setViewportSize({width:360,height:740});
 await login(page);
 for(const title of ["Pipeline","Prazos","Painel","Oportunidades"]) {
   console.log(`Navigating to ${title}`);
   await page.getByRole("navigation",{name:"Navegação móvel",exact:true}).getByRole("link",{name:title,exact:true}).click();
   console.log(`Clicked ${title}: ${page.url()}`);
   await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
   console.log(`Ready ${title}`);
   await expect(page.locator("main[aria-busy=true]")).toHaveCount(0);
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   if(title==="Pipeline") {
     await expect(page.getByRole("textbox",{name:"Anotações",exact:true})).toHaveValue("Anotação exclusiva da conta de teste");
     await expect(page.getByText("Software de teste de navegação",{exact:true})).toHaveCount(0);
   }
 }
});

test("pagination preserves the document, order and complete result set", async ({ page }) => {
 await login(page);
 await page.evaluate(() => { document.documentElement.dataset.navigationMarker = "pagination-document"; });
 const firstTitle = await page.getByRole("heading", { level: 2 }).first().innerText();
 await expect(page.getByRole("heading", { level: 2 })).toHaveCount(50);
 await page.getByRole("navigation", { name: "Paginação", exact: true }).getByRole("link", { name: "Próxima →", exact: true }).click();
 await expect(page.getByText(/página 2 de 2/)).toBeVisible();
 await expect(page.getByRole("heading", { level: 2 })).toHaveCount(3);
 await expect(page.getByRole("link", { name: "Próxima →", exact: true })).toHaveCount(0);
 expect(await page.locator("html").getAttribute("data-navigation-marker")).toBe("pagination-document");
 await page.getByRole("link", { name: "← Anterior", exact: true }).click();
 await expect(page.getByText(/página 1 de 2/)).toBeVisible();
 await expect(page.getByRole("heading", { level: 2 })).toHaveCount(50);
 await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(firstTitle);
 expect(await page.locator("html").getAttribute("data-navigation-marker")).toBe("pagination-document");
});

test("health segment keeps scope across categories, pagination, search and clear", async ({ page }) => {
 await page.setViewportSize({ width: 360, height: 740 });
 await login(page);
 await page.getByRole("combobox",{name:"Segmento", exact:true}).selectOption("health");
 await page.getByRole("button", {name:"Buscar",exact:true}).click();
 await expect(page.getByText(/54 oportunidade\(s\) encontradas/)).toBeVisible();
 await expect(page.getByRole("heading", {level:2})).toHaveCount(50);
 await expect(page.getByRole("heading", {name:"Nobreak de teste de navegação",exact:true})).toHaveCount(0);
 await page.getByRole("link", {name:"Próxima →",exact:true}).click();
 await expect(page.getByText(/página 2 de 2/)).toBeVisible();
 await expect(page).toHaveURL(/segment=health/);
 await expect(page.getByRole("heading", {level:2})).toHaveCount(4);
 await page.getByRole("combobox",{name:"Área de saúde", exact:true}).selectOption("equipment");
 await page.getByRole("button", {name:"Buscar",exact:true}).click();
 await expect(page.getByText(/1 oportunidade\(s\) encontradas/)).toBeVisible();
 await expect(page.getByRole("heading", {name:"Equipamentos médicos de teste de navegação",exact:true})).toBeVisible();
 await page.getByRole("button", {name:/Filtros/}).click();
 await page.getByRole("link", {name:"Limpar filtros",exact:true}).click();
 await expect(page.getByText(/54 oportunidade\(s\) encontradas/)).toBeVisible();
 await expect(page.getByRole("combobox",{name:"Segmento",exact:true})).toHaveValue("health");
 await page.getByLabel("Buscar oportunidades",{exact:true}).fill("seringas");
 await page.getByRole("button", {name:"Buscar",exact:true}).click();
 await expect(page.getByText(/1 oportunidade\(s\) encontradas/)).toBeVisible();
 await expect(page.getByRole("heading",{name:"Seringas de teste de navegação",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.goto("/profiles/new");
 await page.getByRole("combobox",{name:"Segmento",exact:true}).selectOption("health");
 await expect(page.getByRole("combobox",{name:"Segmento",exact:true})).toHaveValue("health");
});
