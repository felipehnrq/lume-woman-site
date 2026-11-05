const {defineConfig} = require('@playwright/test');
module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.cjs',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    launchOptions: {executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', args: ['--no-sandbox']},
    trace: 'retain-on-failure'
  },
  webServer: {command: 'node tests/server.cjs', port: 4173, reuseExistingServer: false}
});
