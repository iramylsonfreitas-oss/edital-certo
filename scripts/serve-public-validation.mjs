import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";

const current = await readFile("index.html");
const data = await readFile("data/dados.json");
const baseline = process.env.PUBLIC_BASELINE_SHA
  ? execFileSync("git", ["show", process.env.PUBLIC_BASELINE_SHA + ":index.html"], { maxBuffer: 4_000_000 })
  : current;
createServer((request,response) => {
  const path = new URL(request.url,"http://127.0.0.1:3100").pathname;
  const content = path === "/" ? current : path === "/baseline.html" ? baseline : path === "/data/dados.json" ? data : null;
  response.writeHead(content ? 200 : 404,{"Content-Type":path.endsWith(".json") ? "application/json" : "text/html; charset=utf-8","Cache-Control":"no-store"});
  response.end(content ?? "Not found");
}).listen(3100,"127.0.0.1");
