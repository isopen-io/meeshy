import { describe, expect, test } from 'bun:test';

import { statsGateway } from '@/lib/admin/analytics-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import { decodeGameBaseline } from '@/lib/api/admin-analytics-game';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminGameTab } from './admin-analytics-game';

const { mount, mounter } = setupAdminKitTests();

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const STILL_LOADING = '[data-admin-stat-state="loading"], [data-admin-chart-skeleton]';
const PATH = '/api/v1/admin/analytics/game';

const cellOf = (eligible: number, returned: number, rate: number | null) => ({ eligible, returned, rate });

const cohort = (over: Record<string, unknown> = {}) => ({
  weekStart: '2026-11-16',
  accounts: 40,
  day1: cellOf(40, 18, 45),
  day7: cellOf(0, 0, null),
  day30: cellOf(0, 0, null),
  ...over,
});

const baseline = (over: Record<string, unknown> = {}) => ({
  windowDays: 7,
  cohortWeeks: 13,
  sampled: false,
  retention: [
    cohort(),
    cohort({ weekStart: '2026-10-05', accounts: 25, day1: cellOf(25, 15, 60), day7: cellOf(25, 8, 32), day30: cellOf(25, 4, 16) }),
  ],
  daily: [
    { day: '2026-11-25', offeringsOpened: 12, meeshesMinted: 30, meeshesSpent: 5 },
    { day: '2026-11-26', offeringsOpened: 7, meeshesMinted: 0, meeshesSpent: 20 },
  ],
  longFlames: { minDays: 7, alive: 9 },
  guards: { gameHidden: 4, gameNotificationsOff: 11 },
  ...over,
});

async function openTab(deps: AdminDeps): Promise<HTMLDivElement> {
  const host = await mount(<AdminGameTab language="fr" deps={deps} period="7d" />, BIGBOSS);
  for (let attempt = 0; attempt < 20 && host.querySelector(STILL_LOADING) !== null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const seen = (cell: Element): string => {
  const copy = cell.cloneNode(true) as Element;
  copy.querySelectorAll('.sr-only').forEach((node) => node.remove());
  return (copy.textContent ?? '').replace(/\s+/g, ' ').trim();
};

const rowsOf = (host: Element, table: string): readonly (readonly string[])[] =>
  [...host.querySelectorAll(`[${table}] tbody tr`)].map((row) => [...row.children].map(seen));

const stat = (host: Element, anchor: string): string => host.querySelector(`[data-admin-stat="${anchor}"]`)?.textContent ?? '';

describe('l’onglet Jeu — le retour à 1, 7 et 30 jours et les compteurs du Jeu (#20618, #17363)', () => {
  test('lit GET /admin/analytics/game sur la fenêtre de la période', async () => {
    const gateway = statsGateway({ [PATH]: { ok: true, data: baseline() } });
    await openTab(gateway.deps);

    const request = gateway.calls().find((call) => call.path.startsWith(PATH));
    expect(request?.path).toBe(`${PATH}?days=7`);
  });

  test('une ligne par semaine d’inscription, de la plus récente à la plus ancienne, avec ses comptes et ses trois taux', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: baseline() } }).deps);

    const table = rowsOf(host, 'data-admin-game-retention-table');
    expect(table).toHaveLength(2);
    expect(table[0]?.[0]).toContain('16');
    expect(table[0]?.[1]).toBe('40');
    expect(table[0]?.[2]).toMatch(/45\s*%/);
    expect(table[1]?.join(' ')).toMatch(/60\s*%/);
    expect(table[1]?.join(' ')).toMatch(/32\s*%/);
    expect(table[1]?.join(' ')).toMatch(/16\s*%/);
  });

  test('un horizon qu’aucun compte n’a encore pu atteindre se dit « — », jamais « 0 % »', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: baseline() } }).deps);

    const recent = rowsOf(host, 'data-admin-game-retention-table')[0] ?? [];
    expect(recent[3]).toBe('—');
    expect(recent[4]).toBe('—');
  });

  test('au lecteur d’écran, « — » se dit « aucune donnée », jamais « tiret » (#20628)', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: baseline() } }).deps);

    const cell = host.querySelectorAll('[data-admin-game-retention-table] tbody tr')[0]?.children[3];
    expect(cell?.querySelector('[aria-hidden="true"]')?.textContent).toBe('—');
    expect(cell?.querySelector('.sr-only')?.textContent).toBe('aucune donnée');
  });

  test('chaque tableau s’annonce par sa légende et défile au clavier ; chaque (i) est un bouton (#20628)', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: baseline() } }).deps);

    for (const table of ['data-admin-game-retention-table', 'data-admin-game-daily-table']) {
      const zone = host.querySelector(`[${table}] [role="region"]`);
      expect(zone?.getAttribute('tabindex')).toBe('0');
      expect(zone?.getAttribute('aria-label')).toBe(host.querySelector(`[${table}] caption`)?.textContent ?? '∅');
      expect(host.querySelectorAll(`[${table}] th[scope="col"]`).length).toBeGreaterThan(0);
    }
    for (const section of ['game-today', 'game-retention', 'game-daily']) {
      const info = host.querySelector(`[data-admin-stats-section="${section}"] button`);
      expect(info).not.toBeNull();
      expect(info?.getAttribute('tabindex')).not.toBe('-1');
    }
  });

  test('un jour par ligne, du plus récent au plus ancien : Offrandes ouvertes, Meeshes frappées et dépensées', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: baseline() } }).deps);

    const table = rowsOf(host, 'data-admin-game-daily-table');
    expect(table).toHaveLength(2);
    expect(table[0]?.[0]).toContain('26');
    expect(table[0]?.slice(1)).toEqual(['7', '0', '20']);
    expect(table[1]?.slice(1)).toEqual(['12', '30', '5']);
  });

  test('les Flammes longues encore vivantes, les comptes en « Jeu masqué » et sans notifications de jeu', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: baseline() } }).deps);

    expect(stat(host, 'game-long-flames')).toContain('9');
    expect(stat(host, 'game-long-flames')).toContain('7');
    expect(stat(host, 'game-hidden')).toContain('4');
    expect(stat(host, 'game-notifications-off')).toContain('11');
    expectNoRawIdentifiers(host);
  });

  test('une lecture plafonnée le dit', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: baseline({ sampled: true }) } }).deps);
    expect(host.querySelector('[data-admin-game-sampled]')).not.toBeNull();
  });

  test('sans aucune inscription sur les treize semaines, un état vide le dit à la place du tableau du retour', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: true, data: baseline({ retention: [] }) } }).deps);
    expect(host.querySelector('[data-admin-game-retention-table]')).toBeNull();
    expect(host.querySelector('[data-admin-empty]')).not.toBeNull();
    expect(host.querySelector('[data-admin-game-daily-table]')).not.toBeNull();
  });

  test('une passerelle en panne rend une erreur avec son « Réessayer », jamais des zéros', async () => {
    const host = await openTab(statsGateway({ [PATH]: { ok: false, status: 500, error: 'boom' } }).deps);
    expect(host.querySelector('[data-admin-game-retention-table]')).toBeNull();
    expect(host.querySelector('[data-admin-stat="game-long-flames"]')?.textContent ?? '').not.toContain('0');
    expect(host.textContent).toContain('Réessayer');
  });
});

describe('decodeGameBaseline', () => {
  test('refuse une réponse sans retour ni jours', () => {
    expect(decodeGameBaseline({ windowDays: 7 })).toBeNull();
    expect(decodeGameBaseline(baseline({ retention: 'x' }))).toBeNull();
    expect(decodeGameBaseline(baseline({ daily: null }))).toBeNull();
  });

  test('écarte une semaine ou un jour illisible seul ; un taux illisible devient null', () => {
    const decoded = decodeGameBaseline(
      baseline({
        retention: [cohort(), { weekStart: 3 }, cohort({ weekStart: '2026-11-09', day1: cellOf(10, 3, Number.NaN) })],
        daily: [{ day: 'hier', offeringsOpened: 1, meeshesMinted: 1, meeshesSpent: 1 }, { day: '2026-11-26', offeringsOpened: 2, meeshesMinted: 3, meeshesSpent: 4 }],
      }),
    );
    expect(decoded?.retention).toHaveLength(2);
    expect(decoded?.retention[1]?.day1.rate).toBeNull();
    expect(decoded?.daily).toEqual([{ day: '2026-11-26', offeringsOpened: 2, meeshesMinted: 3, meeshesSpent: 4 }]);
  });

  test('des compteurs absents restent null — jamais un zéro fabriqué', () => {
    const decoded = decodeGameBaseline(baseline({ longFlames: undefined, guards: { gameHidden: 'x' } }));
    expect(decoded?.longFlames).toBeNull();
    expect(decoded?.guards.gameHidden).toBeNull();
    expect(decoded?.guards.gameNotificationsOff).toBeNull();
  });
});
