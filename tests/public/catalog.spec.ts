import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

type SourceRecord = {numeroControlePNCP:string;objetoCompra:string;dataEncerramentoProposta:string};
const capture = JSON.parse(readFileSync("data/dados.json","utf8")) as {atualizadoEm:string;registros:SourceRecord[]};

async function openCapture(page:Page,path="/") {
  // Replay the real capture at its publication time; performance.now remains the real timer.
  await page.addInitScript(({at})=>{
    const NativeDate=Date; const origin=performance.now();
    const now=()=>at+performance.now()-origin;
    const CaptureDate=new Proxy(NativeDate,{
      construct(target,args,newTarget){return Reflect.construct(target,args.length ? args : [now()],newTarget);},
      apply(){return new NativeDate(now()).toString();}
    });
    CaptureDate.now=now;
    window.Date=CaptureDate;
    localStorage.setItem("edital-certo-onboarding-v1",JSON.stringify({complete:true}));
  },{at:Date.parse(capture.atualizadoEm)});
  await page.goto(path);
  await expect(page.locator("#snapshotRefreshText")).toContainText("Arquivo verificado",{timeout:60000});
  await expect(page.locator("#sampleTotal")).toHaveText(String(capture.registros.length));
}

test("mobile pagination preserves all results and searches beyond the first page",async({page})=>{
  await openCapture(page);
  await expect(page.locator(".tender-card")).toHaveCount(50);
  const count=await page.locator("#resultCount strong").innerText();
  const firstIds=await page.locator(".tender-card").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.tenderId));
  await page.getByRole("button",{name:"Próxima",exact:true}).click();
  await expect(page.locator("#resultPageStatus")).toContainText("Página 2 de");
  await expect(page.locator(".tender-card")).toHaveCount(50);
  await expect(page.locator("#resultCount strong")).toHaveText(count);
  const secondIds=await page.locator(".tender-card").evaluateAll(nodes=>nodes.map(node=>(node as HTMLElement).dataset.tenderId));
  expect(new Set([...firstIds,...secondIds]).size).toBe(100);
  const target=[...capture.registros].reverse().find(record=>{
    const deadline=new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(record.dataEncerramentoProposta) ? record.dataEncerramentoProposta : record.dataEncerramentoProposta+"-03:00");
    return !firstIds.includes(record.numeroControlePNCP) && deadline.getTime()>Date.parse(capture.atualizadoEm)
      && !record.objetoCompra.startsWith("[") && record.objetoCompra.length>80;
  });
  expect(target).toBeDefined();
  await page.getByRole("searchbox",{name:"Busca textual"}).fill(target!.objetoCompra.slice(0,75).trim());
  await expect(page.locator(`[data-tender-id="${target!.numeroControlePNCP}"]`)).toBeVisible();
  await expect(page.locator("#resultPageStatus")).toContainText("Página 1 de");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole("searchbox",{name:"Busca textual"}).fill("zzzz-nenhuma-oportunidade");
  await expect(page.locator(".tender-card")).toHaveCount(0);
  await expect(page.getByRole("navigation",{name:"Paginação das oportunidades"})).toBeHidden();
});

test("calendar boundaries remain accurate",async({page})=>{
  await openCapture(page);
  const values=await page.evaluate(()=>{
    const api=window as unknown as {daysUntil:(value:string,reference:Date)=>number;deadlineInfo:(record:{closesAt:string},reference:Date)=>{closed:boolean}};
    return {days:api.daysUntil("2026-10-28T00:01:00-03:00",new Date("2026-10-27T23:59:00-03:00")),
      closed:api.deadlineInfo({closesAt:"2026-10-27T10:00:00-03:00"},new Date("2026-10-27T10:00:01-03:00")).closed};
  });
  expect(values).toEqual({days:1,closed:true});
});

test("compare render time with the previous version at four-times CPU slowdown",async({browser},testInfo)=>{
  test.skip(!process.env.PUBLIC_BASELINE_SHA,"Requires the exact baseline commit.");
  const results:Record<string,{median_ms:number;cards:number;samples_ms:number[]}>={};
  for(const [label,path] of [["before","/baseline.html"],["after","/"]]) {
    const context=await browser.newContext({viewport:{width:360,height:740}});
    const page=await context.newPage();
    const cdp=await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate",{rate:4});
    await openCapture(page,path);
    const samples:number[]=[];
    for(let i=0;i<3;i++) samples.push(await page.evaluate(()=>{
      const start=performance.now();
      (window as unknown as {renderOpportunities:()=>void}).renderOpportunities();
      return performance.now()-start;
    }));
    results[label]={median_ms:[...samples].sort((a,b)=>a-b)[1],cards:await page.locator(".tender-card").count(),samples_ms:samples};
    await context.close();
  }
  expect(results.before.cards).toBeGreaterThan(50);
  expect(results.after.cards).toBe(50);
  console.log(JSON.stringify({mode:"real_capture_replay",capture: capture.atualizadoEm,viewport_width:360,cpu_slowdown:4,render:results}));
  await testInfo.attach("render-comparison.json",{body:JSON.stringify(results,null,2),contentType:"application/json"});
});
