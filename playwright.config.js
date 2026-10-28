// @ts-check
const { defineConfig } = require('@playwright/test');

const E2E_PORT = Number(process.env.E2E_PORT) || 3100;

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
  globalTeardown: require.resolve('./tests/e2e/global-teardown.js'),
  use: {
    baseURL: process.env.BASE_URL || `http://127.0.0.1:${E2E_PORT}`,
    extraHTTPHeaders: {
      Accept: 'application/json',
    },
  },
  projects: [
    {
      name: 'api',
      testMatch: /.*\.spec\.js/,
    },
  ],
});
