// @ts-check
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir:   './e2e',
  timeout:   30_000,
  retries:   process.env.CI ? 2 : 0,
  workers:   process.env.CI ? 1 : undefined,
  reporter:  [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['list'],
  ],
  use: {
    baseURL:     process.env.BASE_URL || 'http://localhost:3001',
    trace:       'on-first-retry',
    screenshot:  'only-on-failure',
    video:       'retain-on-failure',
    locale:      'de-DE',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Lokaler Dev-Server starten falls nicht schon läuft
  // webServer: {
  //   command: 'cd ../re-assistant/backend && node server.js',
  //   port: 3001,
  //   reuseExistingServer: true,
  // },
});
