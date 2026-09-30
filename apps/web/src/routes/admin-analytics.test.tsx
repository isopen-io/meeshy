import { onlineManager } from '@tanstack/react-query';
import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { NOW, PAYLOADS, pendingGateway, statsGateway } from '@/lib/admin/analytics-fixtures';
import { dayLabelsEndingToday } from '@/lib/admin/interpret/time';
import type { AdminDeps } from '@/lib/api/admin';
import { analyticsKeys } from '@/lib/api/admin-analytics';
import { appQueryClient } from '@/lib/api/query-client';
import { createRouter, navigate } from '@/lib/router';
import { adminIdentityFixture, expectNoRawIdentifiers } from '@/test-support/admin-assertions';
import { setupAdminKitTests } from '@/test-support/admin-harness';

import { AdminAnalyticsPanel } from './admin-analytics';

const { mount, mounter } = setupAdminKitTests({ languages: ['fr', 'en'] });

/** Le contenu de TOUS les messages et de toutes les traductions (#6919) : les statistiques ne l'appellent jamais. */
const FORBIDDEN_PATHS: readonly string[] = ['/api/v1/admin/messages', '/api/v1/admin/translations'];

const BIGBOSS = adminIdentityFixture({ role: 'BIGBOSS' });

const routerFor = (deps: AdminDeps, language: 'fr' | 'en' = 'fr') =>
  createRouter(
    { probe: { pattern: '/probe', screen: async () => ({ default: () => <AdminAnalyticsPanel language={language} deps={deps} now={NOW} /> }) } },
    () => <p>absent</p>,
  ).Router;

const STILL_LOADING = '[data-admin-stat-state="loading"], [data-admin-chart-skeleton]';

/** Monte le panneau par un routeur de sonde et attend que tout ce qui PEUT répondre ait répondu. */
async function openPanel(url: string, deps: AdminDeps, language: 'fr' | 'en' = 'fr', options: { readonly settled?: boolean } = {}): Promise<HTMLDivElement> {
  navigate(url, true);
  const Router = routerFor(deps, language);
  const host = await mount(<Router wrap={(children) => children} skeleton={null} />, BIGBOSS);
  for (let attempt = 0; attempt < 20 && host.querySelector('[data-admin-analytics]') === null; attempt += 1) await mounter.settle();
  for (let attempt = 0; attempt < 20 && options.settled !== false && host.querySelector(STILL_LOADING) !== null; attempt += 1) await mounter.settle();
  await mounter.settle();
  return host;
}

const stat = (host: Element, anchor: string) => host.querySelector(`[data-admin-stat="${anchor}"]`);
const statText = (host: Element, anchor: string): string => stat(host, anchor)?.textContent ?? '';
const chart = (host: Element, id: string) => host.querySelector(`[data-admin-chart="${id}"]`);
const tab = (host: Element, id: string) => host.querySelector<HTMLButtonElement>(`[data-admin-tab="${id}"]`);
const chip = (host: Element, value: string) => host.querySelector<HTMLButtonElement>(`[data-admin-chip="${value}"]`);

const showTable = async (host: Element, id: string): Promise<HTMLTableElement | null> => {
  await act(async () => chart(host, id)?.querySelector<HTMLButtonElement>('[data-admin-action="chart-table"]')?.click());
  return chart(host, id)?.querySelector('table') ?? null;
};

const rowLabels = (table: HTMLTableElement | null): readonly string[] => [...(table?.querySelectorAll('tbody th') ?? [])].map((cell) => cell.textContent ?? '');

describe('les statistiques — onglet Activité', () => {
  test('rend les valeurs servies, formatées : temps réel, santé de l’usage — et rien d’autre que les quatre taux calculés', async () => {
    const { deps } = statsGateway();
    const host = await openPanel('/probe', deps);

    expect(host.querySelector('h1')?.textContent).toBe('Statistiques');
    expect(statText(host, 'online')).toContain('12');
    expect(statText(host, 'online')).toContain('En ligne maintenant');
    expect(statText(host, 'messages-last-hour')).toContain('340');
    expect(statText(host, 'active-conversations')).toContain('9');
    expect(host.querySelector('[data-admin-stats-section="analytics-now"]')?.textContent).toContain('Mesuré il y a 2 minutes');

    expect(statText(host, 'messages-per-user')).toContain('13');
    expect(statText(host, 'growth-rate')).toContain('7');
  });

  test('les deux échelles de pourcentage : les taux servis en 0–100 se lisent « 42 % », jamais « 4 200 % »', async () => {
    const { deps } = statsGateway();
    const host = await openPanel('/probe', deps);

    const percent = (value: number) => new Intl.NumberFormat('fr', { style: 'percent' }).format(value);
    expect(statText(host, 'engagement-rate')).toContain(percent(0.42));
    expect(statText(host, 'active-user-rate')).toContain(percent(0.41));
    expect(statText(host, 'growth-rate')).toContain(percent(0.07));
    expect(host.textContent).not.toContain('4 200');
  });

  test('avgSessionTime et peakHours, codés en dur côté serveur, ne sont jamais affichés', async () => {
    const { deps } = statsGateway();
    const host = await openPanel('/probe', deps);

    expect(host.textContent).not.toContain('2h 45m');
    expect(host.textContent).not.toContain('18h-21h');
  });

  test('n’appelle que les routes d’analyse — jamais le contenu de tous les messages (#6919)', async () => {
    const gateway = statsGateway();
    await openPanel('/probe', gateway.deps);

    const paths = gateway.calls().map((call) => call.path.split('?')[0] ?? '');
    for (const forbidden of FORBIDDEN_PATHS) expect(paths).not.toContain(forbidden);
    expect(new Set(gateway.paths())).toEqual(
      new Set([
        '/api/v1/admin/analytics/realtime',
        '/api/v1/admin/analytics/kpis?period=30d',
        '/api/v1/admin/analytics/volume-timeline',
        '/api/v1/admin/analytics/hourly-activity',
        '/api/v1/admin/analytics/user-distribution',
        '/api/v1/admin/analytics/message-types?period=30d',
      ]),
    );
  });

  test('T4 — les jours du volume se libellent par POSITION, dans la langue d’interface : le libellé français du serveur est ignoré', async () => {
    const { deps } = statsGateway();
    const host = await openPanel('/probe', deps, 'en');

    const table = await showTable(host, 'volume');
    expect(rowLabels(table)).toEqual(dayLabelsEndingToday(7, NOW, 'en'));
    expect(host.textContent).not.toContain('lun. 24/09');
  });

  test('l’heure d’une tranche se lit en nombre : « 09h » devient « 9 h », au format de la langue', async () => {
    const { deps } = statsGateway();
    const host = await openPanel('/probe', deps);

    const labels = rowLabels(await showTable(host, 'hourly'));
    expect(labels).toHaveLength(8);
    expect(labels).toContain(new Intl.DateTimeFormat('fr', { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, 9))));
    expect(labels.join(' ')).not.toContain('09h');
  });

  test('T4 — la distribution se nomme par INDICE (très actifs… inactifs) ; le nom et la couleur servis sont ignorés', async () => {
    const { deps } = statsGateway({
      '/api/v1/admin/analytics/user-distribution': {
        ok: true,
        data: [
          { name: 'XXX', value: 5, color: '#10b981' },
          { name: 'YYY', value: 10, color: '#3b82f6' },
          { name: 'ZZZ', value: 20, color: '#f59e0b' },
          { name: 'WWW', value: 65, color: '#ef4444' },
        ],
      },
    });
    const host = await openPanel('/probe', deps);

    expect(rowLabels(await showTable(host, 'distribution'))).toEqual(['Très actifs', 'Actifs', 'Occasionnels', 'Inactifs']);
    expect(host.innerHTML).not.toContain('#10b981');
    expect(host.textContent).not.toContain('XXX');
  });

  test('les types de messages : nommés, pourcentage servi en 0–100, type inconnu « Non reconnu »', async () => {
    const { deps } = statsGateway();
    const host = await openPanel('/probe', deps);

    expect(rowLabels(await showTable(host, 'message-types'))).toEqual(['Texte', 'Image', 'Non reconnu']);
    expect(chart(host, 'message-types')?.querySelector('figcaption')?.textContent).toContain(`Texte : ${new Intl.NumberFormat('fr', { style: 'percent' }).format(0.82)} des messages`);
    expect(host.textContent).not.toContain('hologram');
  });

  test('chaque graphique a sa légende textuelle et son tableau « Voir les données »', async () => {
    const { deps } = statsGateway();
    const host = await openPanel('/probe', deps);

    for (const id of ['volume', 'hourly', 'distribution', 'message-types']) {
      expect(chart(host, id)?.querySelector('figcaption')?.textContent?.length).toBeGreaterThan(5);
      expect(chart(host, id)?.querySelector('[data-admin-action="chart-table"]')?.textContent).toBe('Voir les données');
    }
  });

  test('un pic nul n’est pas un pic : sans aucun message, le résumé le dit', async () => {
    const { deps } = statsGateway({
      '/api/v1/admin/analytics/volume-timeline': { ok: true, data: Array.from({ length: 7 }, () => ({ date: 'x', messages: 0 })) },
    });
    const host = await openPanel('/probe', deps);

    expect(chart(host, 'volume')?.querySelector('figcaption')?.textContent).toContain('Aucun message sur la période');
  });

  test('expectNoRawIdentifiers : ni identifiant, ni ISO, ni énumération brute à l’écran', async () => {
    const { deps } = statsGateway();
    expectNoRawIdentifiers(await openPanel('/probe', deps));
  });

  test('le temps réel se rafraîchit chaque minute tant que l’onglet est visible', async () => {
    const { deps } = statsGateway();
    await openPanel('/probe', deps);

    const query = appQueryClient.getQueryCache().find({ queryKey: analyticsKeys.realtime() });
    expect(query?.observers[0]?.options.refetchInterval).toBe(60_000);
    expect(query?.observers[0]?.options.refetchIntervalInBackground === true).toBe(false);
  });
});

describe('la période et l’onglet vivent dans l’adresse', () => {
  test('« 7 jours » écrit ?period=7d EN PLACE et relit les indicateurs ET les types sur cette fenêtre', async () => {
    const gateway = statsGateway();
    const host = await openPanel('/probe', gateway.deps);
    const avant = window.history.length;

    await mounter.click(chip(host, '7d'));

    expect(window.location.search).toBe('?period=7d');
    expect(window.history.length).toBe(avant);
    expect(gateway.paths()).toContain('/api/v1/admin/analytics/kpis?period=7d');
    expect(gateway.paths()).toContain('/api/v1/admin/analytics/message-types?period=7d');
    expect(chip(host, '7d')?.getAttribute('aria-pressed')).toBe('true');
  });

  test('90 jours : les types de messages n’existent pas sur 90 jours — la fenêtre réellement servie (30 jours) est écrite', async () => {
    const gateway = statsGateway();
    const host = await openPanel('/probe?period=90d', gateway.deps);

    expect(gateway.paths()).toContain('/api/v1/admin/analytics/kpis?period=90d');
    expect(gateway.paths()).toContain('/api/v1/admin/analytics/message-types?period=30d');
    expect(host.querySelector('[data-admin-stats-section="analytics-health"]')?.textContent).toContain('Période : 90 derniers jours');
    expect(host.querySelector('[data-admin-stats-section="analytics-trends"]')?.textContent).toContain('Période : 30 derniers jours');
  });

  test('une période inconnue de l’adresse retombe sur le défaut de l’onglet', async () => {
    const gateway = statsGateway();
    await openPanel('/probe?period=1an', gateway.deps);
    expect(gateway.paths()).toContain('/api/v1/admin/analytics/kpis?period=30d');
  });

  test('changer d’onglet écrit ?tab= en place et ne relance pas les lectures de l’autre onglet', async () => {
    const gateway = statsGateway();
    const host = await openPanel('/probe', gateway.deps);

    await mounter.click(tab(host, 'messages'));

    expect(window.location.search).toBe('?tab=messages');
    expect(host.querySelector('[data-admin-tab-panel="messages"]')).not.toBeNull();
    expect(host.querySelector('[data-admin-tab-panel="activity"]')).toBeNull();
    expect(gateway.paths()).toContain('/api/v1/admin/messages/stats?period=30d');
    expect(gateway.paths().filter((path) => path.startsWith('/api/v1/admin/analytics/kpis'))).toHaveLength(1);
  });

  test('un onglet inconnu retombe sur Activité', async () => {
    const host = await openPanel('/probe?tab=secret', statsGateway().deps);
    expect(host.querySelector('[data-admin-tab-panel="activity"]')).not.toBeNull();
  });

  test('les onglets sont un tablist ARIA de trois entrées', async () => {
    const host = await openPanel('/probe', statsGateway().deps);
    const tabs = [...host.querySelectorAll('[role="tab"]')].map((node) => node.textContent);
    expect(tabs).toEqual(['Activité', 'Messages', 'Appels']);
    expect(tab(host, 'activity')?.getAttribute('aria-selected')).toBe('true');
  });
});

describe('les états de l’onglet Activité', () => {
  test('squelette quand rien n’est en cache : des cartes en chargement, des graphiques de même hauteur', async () => {
    const host = await openPanel('/probe', pendingGateway(), 'fr', { settled: false });

    expect(stat(host, 'online')?.getAttribute('data-admin-stat-state')).toBe('loading');
    expect(chart(host, 'volume')?.querySelector('[data-admin-chart-skeleton]')).not.toBeNull();
    expect(chart(host, 'volume')?.getAttribute('aria-busy')).toBe('true');
  });

  test('cache-first : des données en cache s’affichent SANS squelette, même quand la lecture suivante ne répond pas', async () => {
    appQueryClient.setQueryData(analyticsKeys.kpis('30d'), { engagementRate: 55, growthRate: 3, messagesPerUser: 8, activeUserRate: 55 });
    const host = await openPanel('/probe', pendingGateway(), 'fr', { settled: false });

    expect(statText(host, 'engagement-rate')).toContain(new Intl.NumberFormat('fr', { style: 'percent' }).format(0.55));
    expect(stat(host, 'engagement-rate')?.getAttribute('data-admin-stat-state')).toBeNull();
  });

  test('erreur : UN seul « Réessayer » par groupe de cartes, qui relance la lecture', async () => {
    let served = false;
    const gateway = statsGateway({
      '/api/v1/admin/analytics/kpis': () => {
        if (served) return { ok: true, data: PAYLOADS['/api/v1/admin/analytics/kpis'] };
        served = true;
        return { ok: false, status: 500, error: 'boom' };
      },
    });
    const host = await openPanel('/probe', gateway.deps);

    const section = host.querySelector('[data-admin-stats-section="analytics-health"]');
    expect(section?.querySelectorAll('[data-admin-error]')).toHaveLength(1);
    expect(section?.querySelector('[data-admin-stat]')).toBeNull();

    await mounter.click(section?.querySelector<HTMLButtonElement>('[data-admin-retry]') ?? null);

    expect(statText(host, 'messages-per-user')).toContain('13');
    expect(gateway.paths().filter((path) => path.startsWith('/api/v1/admin/analytics/kpis'))).toHaveLength(2);
  });

  test('une lecture qui échoue ALORS QUE des données sont en cache les garde et le dit', async () => {
    appQueryClient.setQueryData(analyticsKeys.volume(), [1, 2, 3, 4, 5, 6, 7], { updatedAt: 0 });
    const gateway = statsGateway({ '/api/v1/admin/analytics/volume-timeline': { ok: false, status: 500, error: 'boom' } });
    const host = await openPanel('/probe', gateway.deps);

    expect(chart(host, 'volume')?.querySelector('[data-admin-chart-body]')).not.toBeNull();
    expect(chart(host, 'volume')?.querySelector('[data-admin-error]')).toBeNull();
    expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('dernières reçues');
  });

  test('un bloc refusé (403) se rend comme un refus en place — le reste de l’écran sert toujours', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/analytics/calls': { ok: false, status: 403, error: 'Forbidden' }, '/api/v1/admin/analytics/kpis': { ok: false, status: 403, error: 'Forbidden' } });
    const host = await openPanel('/probe', deps);

    expect(host.querySelector('[data-admin-stats-section="analytics-health"] [data-admin-denied-inline]')).not.toBeNull();
    expect(statText(host, 'online')).toContain('12');
  });

  test('un graphique vide (aucun point) le dit : « Aucune donnée sur la période »', async () => {
    const { deps } = statsGateway({ '/api/v1/admin/analytics/message-types': { ok: true, data: [] } });
    const host = await openPanel('/probe', deps);

    expect(chart(host, 'message-types')?.querySelector('[data-admin-chart-empty]')?.textContent).toBe('Aucune donnée sur la période');
  });

  test('hors ligne : la notice le dit, les données en cache restent affichées', async () => {
    appQueryClient.setQueryData(analyticsKeys.realtime(), { onlineUsers: 7, messagesLastHour: 1, activeConversations: 1, timestamp: null });
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    onlineManager.setOnline(false);
    try {
      const host = await openPanel('/probe', statsGateway().deps);

      expect(host.querySelector('[data-admin-notice="warning"]')?.textContent).toContain('hors ligne');
      expect(statText(host, 'online')).toContain('7');
      expect(stat(host, 'online')?.getAttribute('data-admin-stat-state')).toBeNull();
    } finally {
      mounter.unmountAll();
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
      onlineManager.setOnline(true);
    }
  });
});

describe('les requêtes des statistiques ne vont jamais sur le disque', () => {
  test('les clés commencent par admin : le client de requêtes ne les persiste pas', async () => {
    const { deps } = statsGateway();
    await openPanel('/probe', deps);
    const keys = appQueryClient.getQueryCache().getAll().map((query) => query.queryKey[0]);
    expect(keys.filter((key) => key !== 'admin')).toEqual([]);
  });
});
