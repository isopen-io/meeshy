import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PROBE = 'TZ_ISOLATION_PROBE';
const appRoot = fileURLToPath(new URL('../..', import.meta.url));

describe('le fuseau des témoins ne vient pas du poste (#20729)', () => {
  test('une heure rendue se lit en UTC', () => {
    const noon = new Date(Date.UTC(2026, 6, 1, 12, 0, 0));

    expect(noon.getTimezoneOffset()).toBe(0);
    expect(noon.getHours()).toBe(12);
    expect(new Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
  });

  test.skipIf(process.env[PROBE] === '1')('un poste réglé sur un autre fuseau rend le même verdict', () => {
    const run = spawnSync(process.execPath, ['test', './src/test-support/timezone-isolation.test.ts'], {
      cwd: appRoot,
      env: { ...process.env, TZ: 'Pacific/Kiritimati', [PROBE]: '1' },
      encoding: 'utf8',
    });

    expect(run.status).toBe(0);
  });
});
