import { expect, test, type Page } from "@playwright/test";

const enabled=process.env.NAVIGATION_TEST_DISPOSABLE==="true" && process.env.NEXT_PUBLIC_SUPABASE_URL==="http://127.0.0.1:54321";
test.skip(!enabled,"Requires disposable local navigation accounts.");
async function login(page:Page) {
 await page.goto("/login");
 await page.getByLabel("E-mail",{exact:true}).fill("navigation-admin@example.invalid");
 await page.getByLabel("Senha",{exact:true}).fill("local-navigation-only-6419");
 await page.getByRole("button",{name:"Entrar com senha"}).click();
 await expect(page.getByText(/2 oportunidade\(s\) encontradas/)).toBeVisible({timeout:30000});
}
test("search and clear filters preserve the document and account session",async({page})=>{
 await login(page);
 await page.evaluate(()=>{document.documentElement.dataset.navigationMarker="same-document";});
 await page.getByLabel("Buscar oportunidades",{exact:true}).fill("nobreak");
 await page.getByRole("button",{name:"Buscar",exact:true}).click();
 await expect(page).toHaveURL(/q=nobreak/);
 await expect(page.getByText(/1 oportunidade\(s\) encontradas/)).toBeVisible();
 expect(await page.locator("html").getAttribute("data-navigation-marker")).toBe("same-document");
 await page.getByRole("link",{name:"Limpar filtros",exact:true}).click();
 await expect(page.getByText(/2 oportunidade\(s\) encontradas/)).toBeVisible();
 await expect(page.getByLabel("Buscar oportunidades",{exact:true})).toHaveValue("");
 expect(await page.locator("html").getAttribute("data-navigation-marker")).toBe("same-document");
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
