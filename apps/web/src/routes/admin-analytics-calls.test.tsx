import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { PAYLOADS, pendingGateway, statsGateway } from '@/lib/admin/analytics-fixtures';
import type { AdminDeps } from '@/lib/api/admin';
import type { KpiPeriod } from '@/lib/api/admin-analytics';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminCallsTab } from './admin-analytics-calls';

const { mount, mounter } = setupAdminKitTests();

/** Le contenu de TOUS les messages et de toutes les traductions (#6919) : les statistiques ne l'appellent jamais. */
const FORBIDDEN_PATHS: readonly string[] = ['/api/v1/admin/messages', '/api/v1/admin/translations'];

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });
const STILL_LOADING = '[data-admin-stat-state="loading"], [data-admin-chart-skeleton]';

async function openTab(deps: AdminDeps, period: KpiPeriod = '7d'): Promise<HTMLDivElement> {
  const host = await mount(<AdminCallsTab language="fr" deps={deps} period={period} />, BIGBOSS);
  for (let attempt = 0; attempt < 20 && host.querySelector(STILL_LOADING) !== null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const callsWith = (extra: Readonly<Record<string, unknown>>) => ({ ...(PAYLOADS['/api/v1/admin/analytics/calls'] as object), ...extra });
const stat = (host: Element, anchor: string): string => host.querySelector(`[data-admin-stat="${anchor}"]`)?.textContent ?? '';
const chart = (host: Element, id: string) => host.querySelector(`[data-admin-chart="${id}"]`);
const percent = (ratio: number, digits = 0) => new Intl.NumberFormat('fr', { style: 'percent', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(ratio);

const showTable = async (host: Element, id: string): Promise<HTMLTableElement | null> => {
  await act(async () => chart(host, id)?.querySelector<HTMLButtonElement>('[data-admin-action="chart-table"]')?.click());
  return chart(host, id)?.querySelector('table') ?? null;
};
const rows = (table: HTMLTableElement | null): readonly (readonly string[])[] =>
  [...(table?.querySelectorAll('tbody tr') ?? [])].map((row) => [...row.children].map((cell) => cell.textContent ?? ''));
const rowLabels = (table: HTMLTableElement | null): readonly string[] => rows(table).map((row) => row[0] ?? '');

describe('l’onglet Appels — la fiabilité, mesurée sur la télémétrie des participants', () => {
  test('rend les valeurs servies avec LEURS échelles : parts 0–1, pertes en pourcentage, délais en millisecondes, durée en secondes', async () => {
    const host = await openTab(statsGateway().deps);

    expect(stat(host, 'total-calls')).toContain('40');
    expect(stat(host, 'video-share')).toContain(percent(0.25));
    expect(stat(host, 'connect-rate')).toContain(percent(0.9));
    expect(stat(host, 'failure-rate')).toContain(percent(0.05, 1));
    expect(stat(host, 'reconnection-rate')).toContain(percent(0.2));
    expect(stat(host, 'reconnection-rate')).toContain('0,3 reconnexions par appel');
    expect(stat(host, 'setup-time')).toContain('820');
    expect(stat(host, 'duration')).toContain('3');
    expect(stat(host, 'rtt')).toContain('64');
    expect(stat(host, 'network-transitions')).toContain('0,1');
  });

  test('la perte de paquets est servie en POURCENTAGE : 1,5 se lit « 1,5 % », jamais « 150 % »', async () => {
    const host = await openTab(statsGateway().deps);

    expect(stat(host, 'packet-loss')).toContain(percent(0.015, 1));
    expect(stat(host, 'packet-loss-max')).toContain(percent(0.12, 1));
    expect(host.textContent).not.toContain('150');
  });

  test('la durée se lit en minutes et secondes, le délai en millisecondes', async () => {
    const host = await openTab(statsGateway().deps);

    expect(stat(host, 'duration')).toMatch(/3\s*min/);
    expect(stat(host, 'setup-time')).toMatch(/820\s*ms/);
    expect(stat(host, 'rtt')).toMatch(/64\s*ms/);
  });

  test('une moyenne nulle (aucun appel connecté) se dit « — », jamais « 0 ms »', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/analytics/calls': { ok: true, data: callsWith({ avgSetupTimeMs: null, avgNegotiationTimeMs: null, avgRtt: null, avgPacketLoss: null }) } });
    const host = await openTab(deps);

    for (const anchor of ['setup-time', 'negotiation-time', 'rtt', 'packet-loss']) {
      expect(stat(host, anchor)).toContain('—');
      expect(stat(host, anchor)).not.toContain('0 ms');
    }
  });

  test('envoie la fenêtre en jours et n’appelle que la télémétrie d’appels', async () => {
    const gateway = statsGateway();
    await openTab(gateway.deps, '90d');

    expect(gateway.paths()).toEqual(['/api/v1/admin/analytics/calls?days=90']);
    for (const forbidden of FORBIDDEN_PATHS) expect(gateway.paths().map((path) => path.split('?')[0])).not.toContain(forbidden);
  });

  test('la fenêtre réellement mesurée est écrite', async () => {
    const host = await openTab(statsGateway().deps, '30d');
    expect(host.querySelector('[data-admin-stats-section="calls-reliability"]')?.textContent).toContain('Période : 30 derniers jours');
  });

  test('un échantillon plafonné se dit : « Échantillon plafonné à 5 000 appels »', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/analytics/calls': { ok: true, data: callsWith({ sampled: true }) } });
    const host = await openTab(deps);

    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('Échantillon plafonné à 5 000 appels');
  });

  test('sans plafond, aucune notice', async () => {
    const host = await openTab(statsGateway().deps);
    expect(host.querySelector('[data-admin-notice]')).toBeNull();
  });
});

describe('la qualité, les plateformes et les motifs de fin — nommés', () => {
  test('la qualité se dit en mots, avec les couleurs d’ÉTAT de ses niveaux et leurs mots', async () => {
    const host = await openTab(statsGateway().deps);

    const table = await showTable(host, 'call-quality');
    expect(rows(table).map((row) => row[0])).toEqual(['Excellente', 'Bonne', 'Moyenne', 'Mauvaise']);
    expect(rows(table).map((row) => row[1])).toEqual([percent(0.6), percent(0.25), percent(0.1), percent(0.05)]);
    expect(chart(host, 'call-quality')?.querySelector('figcaption')?.textContent).toContain(`Excellente : ${percent(0.6)} des mesures`);
    expect(chart(host, 'call-quality')?.innerHTML).toContain('var(--color-success)');
    expect(chart(host, 'call-quality')?.innerHTML).toContain('var(--color-danger)');
  });

  test('les plateformes sont NOMMÉES et celles qui se disent pareil sont sommées : macOS + Windows = Ordinateur', async () => {
    const host = await openTab(statsGateway().deps);

    expect(rows(await showTable(host, 'call-platforms'))).toEqual([
      ['Navigateur', '20'],
      ['iPhone / iPad', '10'],
      ['Android', '5'],
      ['Ordinateur', '5'],
    ]);
  });

  test('les motifs de fin sont dits en mots ; un motif inconnu se dit « Non reconnu » sans montrer son code', async () => {
    const host = await openTab(statsGateway().deps);

    const labels = rowLabels(await showTable(host, 'call-reasons'));
    expect(labels).toEqual(['Terminé normalement', 'Raccroché par ce participant', 'Connexion perdue', 'Non reconnu', 'Échec de connexion']);
    expect(host.textContent).not.toContain('teleported');
    expect(host.textContent).not.toContain('connectionLost');
  });

  test('les motifs inconnus se somment en UNE ligne', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/analytics/calls': { ok: true, data: callsWith({ byEndReason: { completed: 10, foo: 3, bar: 4 } }) } });
    const host = await openTab(deps);

    expect(rows(await showTable(host, 'call-reasons'))).toEqual([
      ['Terminé normalement', '10'],
      ['Non reconnu', '7'],
    ]);
  });

  test('chaque graphique a sa synthèse et son tableau', async () => {
    const host = await openTab(statsGateway().deps);

    for (const id of ['call-quality', 'call-platforms', 'call-reasons', 'call-ratings', 'call-issues']) {
      expect(chart(host, id)?.querySelector('figcaption')?.textContent?.length).toBeGreaterThan(5);
      expect(chart(host, id)?.querySelector('[data-admin-action="chart-table"]')).not.toBeNull();
    }
  });
});

describe('les avis des participants', () => {
  test('nombre d’avis, note moyenne « 4,3 / 5 », répartition des notes 1 à 5, problèmes nommés', async () => {
    const host = await openTab(statsGateway().deps);

    expect(stat(host, 'rated-calls')).toContain('4');
    expect(stat(host, 'average-rating')).toContain('4,3 / 5');
    expect(rows(await showTable(host, 'call-ratings'))).toEqual([
      ['1 ★', '0'],
      ['2 ★', '0'],
      ['3 ★', '1'],
      ['4 ★', '1'],
      ['5 ★', '2'],
    ]);
    expect(rows(await showTable(host, 'call-issues'))).toEqual([
      ['Écho', '2'],
      ['Appel coupé', '1'],
    ]);
  });

  test('aucun avis : le dit par une notice, sans graphique plat', async () => {
    const { deps } = statsGateway({
      '/api/v1/admin/analytics/calls': { ok: true, data: callsWith({ feedback: { ratedCalls: 0, avgRating: null, ratingDistribution: {}, byIssue: {} } }) },
    });
    const host = await openTab(deps);

    expect(host.querySelector('[data-admin-stats-section="calls-feedback"]')?.textContent).toContain('Aucun avis laissé sur cette période.');
    expect(chart(host, 'call-ratings')).toBeNull();
    expect(stat(host, 'average-rating')).toContain('—');
  });
});

describe('les états de l’onglet Appels', () => {
  test('sans aucun relevé : un état vide qui explique d’où viennent ces statistiques', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/analytics/calls': { ok: true, data: callsWith({ totalCalls: 0, rowsWithTelemetry: 0 }) } });
    const host = await openTab(deps);

    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('Aucun relevé d’appel sur cette période');
    expect(host.querySelector('[data-admin-empty]')?.textContent).toContain('télémétrie');
    expect(host.querySelector('[data-admin-stat]')).toBeNull();
  });

  test('squelette pendant le chargement', async () => {
    const pending = pendingGateway();
    const host = await mount(<AdminCallsTab language="fr" deps={pending} period="7d" />, BIGBOSS);

    expect(host.querySelector('[data-admin-stat="total-calls"]')?.getAttribute('data-admin-stat-state')).toBe('loading');
    expect(chart(host, 'call-platforms')?.querySelector('[data-admin-chart-skeleton]')).not.toBeNull();
  });

  test('erreur : une seule erreur pour tout l’onglet, « Réessayer » relance la lecture', async () => {
    let served = false;
    const gateway = statsGateway({
      '/api/v1/admin/analytics/calls': () => {
        if (served) return { ok: true, data: PAYLOADS['/api/v1/admin/analytics/calls'] };
        served = true;
        return { ok: false, status: 500, error: 'boom' };
      },
    });
    const host = await openTab(gateway.deps);

    expect(host.querySelectorAll('[data-admin-error]')).toHaveLength(1);
    await mounter.click(host.querySelector<HTMLButtonElement>('[data-admin-retry]'));

    expect(stat(host, 'total-calls')).toContain('40');
    expect(gateway.paths()).toHaveLength(2);
  });

  test('refusé (403) : un refus en place', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/analytics/calls': { ok: false, status: 403, error: 'Forbidden' } });
    const host = await openTab(deps);

    expect(host.querySelector('[data-admin-denied-inline]')).not.toBeNull();
    expect(host.querySelector('[data-admin-error]')).toBeNull();
  });

  test('charge illisible (sans total d’appels) : une erreur avec « Réessayer », pas des zéros', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/analytics/calls': { ok: true, data: { videoShare: 0.5 } } });
    const host = await openTab(deps);

    expect(host.querySelector('[data-admin-error]')).not.toBeNull();
    expect(host.querySelector('[data-admin-stat]')).toBeNull();
  });

  test('expectNoRawIdentifiers : aucun code brut à l’écran', async () => {
    expectNoRawIdentifiers(await openTab(statsGateway().deps));
  });
});
