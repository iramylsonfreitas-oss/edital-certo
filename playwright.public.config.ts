import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir:"./tests/public",
  workers:1,
  timeout:120000,
  use:{baseURL:"http://127.0.0.1:3100",viewport:{width:360,height:740},trace:"retain-on-failure"},
  webServer:{command:"node scripts/serve-public-validation.mjs",url:"http://127.0.0.1:3100",reuseExistingServer:false},
  projects:[{name:"mobile-360",use:{browserName:"chromium"}}]
});
