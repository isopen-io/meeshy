import { describe, expect, test } from 'bun:test';

import { statsGateway } from '@/lib/admin/analytics-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import { decodePlaybackQoe } from '@/lib/api/admin-analytics-playback';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminPlaybackTab } from './admin-analytics-playback';

const { mount, mounter } = setupAdminKitTests();

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const STILL_LOADING = '[data-admin-stat-state="loading"], [data-admin-chart-skeleton]';
const PATH = '/api/v1/admin/analytics/playback';

const cell = (over: Record<string, unknown> = {}) => ({
  day: '2026-10-22',
  surface: 'reels',
  deviceTier: 'low',
  sessions: 120,
  devices: 34,
  timeToFirstFrameMs: { p50: 420, p95: 1850 },
  rebufferMs: { p50: 0, p95: 2400 },
  rebufferRatio: { p50: 0, p95: 0.08 },
  rebufferedRate: 0.125,
  ...over,
});

const summary = (over: Record<string, unknown> = {}) => ({
  windowDays: 7,
  sampled: false,
  minDevices: 20,
  cells: [cell(), cell({ day: '2026-10-21', surface: 'feed', deviceTier: 'high', timeToFirstFrameMs: { p50: 180, p95: 640 }, rebufferMs: null, rebufferRatio: null, rebufferedRate: null })],
  suppressedCells: 3,
  ...over,
});

async function openTab(deps: AdminDeps): Promise<HTMLDivElement> {
  const host = await mount(<AdminPlaybackTab language="fr" deps={deps} period="7d" />, BIGBOSS);
  for (let attempt = 0; attempt < 20 && host.querySelector(STILL_LOADING) !== null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const rows = (host: Element): readonly (readonly string[])[] =>
  [...host.querySelectorAll('[data-admin-playback-table] tbody tr')].map((row) => [...row.children].map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim()));

describe('l’onglet Lecture — le temps jusqu’à la première image et le rebuffer, p50/p95 par surface et appareil (#11280)', () => {
  test('lit GET /admin/analytics/playback sur la fenêtre de la période', async () => {
    const gateway = statsGateway({ [PATH]: { ok: true, data: summary() } });
    await openTab(gateway.deps);

    const request = gateway.calls().find((call) => call.path.startsWith(PATH));
    expect(request?.path).toBe(`${PATH}?days=7`);
  });

  test('une ligne par jour × surface × appareil, du plus récent au plus ancien, en millisecondes et en parts', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: summary() } }).deps);

    const table = rows(host);
    expect(table).toHaveLength(2);
    expect(table[0]?.[0]).toContain('22');
    expect(table[0]).toContain('reels');
    expect(table[0]?.join(' ')).toMatch(/420\s*ms/);
    expect(table[0]?.join(' ')).toMatch(/1,9\s*s/);
    expect(table[0]?.join(' ')).toContain('12,5');
    expect(table[1]).toContain('feed');
  });

  test('une mesure absente se dit « — », jamais « 0 ms »', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: summary() } }).deps);

    const feed = rows(host)[1] ?? [];
    expect(feed.filter((value) => value === '—').length).toBeGreaterThanOrEqual(3);
  });

  test('dit combien de cellules le k-anonymat retient, sans rien en montrer', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: summary() } }).deps);

    expect(host.querySelector('[data-admin-stat="playback-suppressed"]')?.textContent ?? '').toContain('3');
    expect(host.textContent).toContain('20');
    expectNoRawIdentifiers(host);
  });

  test('une fenêtre plafonnée le dit', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: summary({ sampled: true }) } }).deps);
    expect(host.querySelector('[data-admin-playback-sampled]')).not.toBeNull();
  });

  test('sans aucune cellule servie, un état vide le dit', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: summary({ cells: [], suppressedCells: 0 }) } }).deps);
    expect(host.querySelector('[data-admin-playback-table]')).toBeNull();
    expect(host.querySelector('[data-admin-empty]')).not.toBeNull();
  });
});

describe('decodePlaybackQoe', () => {
  test('écarte une cellule illisible seule, et refuse une réponse sans cellules', () => {
    const decoded = decodePlaybackQoe(summary({ cells: [cell(), { day: 3 }, cell({ timeToFirstFrameMs: { p50: 'x', p95: 1 } })] }));
    expect(decoded?.cells).toHaveLength(2);
    expect(decoded?.cells[1]?.timeToFirstFrameMs).toBeNull();
    expect(decodePlaybackQoe({ windowDays: 7 })).toBeNull();
  });
});
