import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests/browser', workers:1, retries:0, timeout:90000,
  reporter:'line', use:{baseURL:'http://127.0.0.1:4321',trace:'off',screenshot:'off',video:'off'},
  webServer:{command:'node tests/browser/server.mjs',url:'http://127.0.0.1:4321/hiens-nha/',timeout:30000,reuseExistingServer:false},
});
