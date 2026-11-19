import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:4179',
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    }
  },
  webServer: {
    command: 'npm run dev:web -- --host 127.0.0.1 --port 4179',
    url: 'http://127.0.0.1:4179',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  },
  timeout: 60_000
})
