import { defineConfig, devices } from '@playwright/test';

import { chromiumPath } from '../../scripts/lib/navigateur.cjs';

// `navigateur.cjs` est le site UNIQUE de « où est Chromium » (conception § 9.2). Quand il ne
// trouve rien, on ne recopie pas son chemin de repli ici : on laisse Playwright résoudre son
// propre navigateur et échouer avec SON message, qui dit quoi installer.
const executablePath = ((): string | undefined => {
  try {
    return chromiumPath();
  } catch {
    return undefined;
  }
})();

const BASE_URL = process.env.V3_BASE_URL ?? 'http://127.0.0.1:3300';

// La preuve d'un build se prend sur `next start`, jamais sur `next dev` (leçon 339).
const webServer =
  process.env.V3_BASE_URL === undefined
    ? {
        command: 'npm run start',
        url: `${BASE_URL}/healthz`,
        reuseExistingServer: process.env.CI === undefined,
        timeout: 120_000,
      }
    : undefined;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: process.env.CI !== undefined,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: false,
        launchOptions: {
          ...(executablePath === undefined ? {} : { executablePath }),
          args: ['--no-sandbox', '--disable-dev-shm-usage'],
        },
      },
    },
  ],
  ...(webServer === undefined ? {} : { webServer }),
});
