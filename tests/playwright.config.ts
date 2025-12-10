/**
 * Playwright Configuration for E2E Tests
 *
 * Configuration optimisée pour tester le système de statut utilisateur temps réel
 */

import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3100';
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',

  // Timeout configuration
  timeout: 60000, // 60 seconds per test
  expect: {
    timeout: 10000 // 10 seconds for assertions
  },

  // Test execution
  fullyParallel: false, // Run tests sequentially to avoid conflicts
  forbidOnly: !!process.env.CI, // Fail CI if test.only is used
  retries: process.env.CI ? 2 : 0, // Retry failed tests in CI
  workers: process.env.CI ? 1 : 2, // Limit parallelism

  // Reporter configuration
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ['list']
  ],

  // Global test configuration
  use: {
    // Base URL for navigation
    baseURL: FRONTEND_URL,

    // Browser context options
    trace: 'on-first-retry', // Collect trace on first retry
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // Timeouts
    actionTimeout: 15000,
    navigationTimeout: 30000,

    // Browser options
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,

    // Custom environment
    extraHTTPHeaders: {
      'Accept-Language': 'fr-FR,fr;q=0.9'
    }
  },

  // Test projects (different browsers/devices)
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--disable-web-security'] // Allow WebSocket in tests
        }
      }
    },
    {
      name: 'firefox-desktop',
      use: {
        ...devices['Desktop Firefox']
      }
    },
    {
      name: 'webkit-desktop',
      use: {
        ...devices['Desktop Safari']
      }
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5']
      }
    },
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 13']
      }
    }
  ],

  // Web server configuration (optional - auto-start frontend/backend)
  webServer: process.env.CI ? undefined : [
    {
      command: 'cd ../frontend && npm run dev',
      url: FRONTEND_URL,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe'
    },
    {
      command: 'cd ../gateway && npm run dev',
      url: GATEWAY_URL,
      timeout: 120000,
      reuseExistingServer: !process.env.CI,
      stdout: 'ignore',
      stderr: 'pipe'
    }
  ],

  // Global setup and teardown
  globalSetup: path.resolve(__dirname, 'e2e/global-setup.ts'),
  globalTeardown: path.resolve(__dirname, 'e2e/global-teardown.ts')
});
