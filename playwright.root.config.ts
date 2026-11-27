import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/root-browser',workers:1,retries:0,timeout:30000,reporter:'line',
  use:{baseURL:'http://127.0.0.1:4321',trace:'off',screenshot:'off',video:'off',launchOptions:{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}},
  webServer:{command:'node tests/browser/server.mjs',url:'http://127.0.0.1:4321/',env:{PLAYWRIGHT_BASE_PATH:'/',PLAYWRIGHT_DIST:'dist'},timeout:30000,reuseExistingServer:false},
});
