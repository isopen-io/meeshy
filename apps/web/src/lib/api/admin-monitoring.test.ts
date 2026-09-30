import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';
import { describe, expect, test } from 'bun:test';

import {
  BLIND_SPOTS,
  ROUTE,
  servedMonitoring,
  servedRouteUsage,
  servedUsageEntry,
  servedWatched,
} from '@/lib/admin/monitoring-fixtures';
import { DEFAULT_ROUTE_USAGE_STATE, withRoute, withScope } from '@/lib/admin/monitoring-state';
import { scriptedGateway } from '@/test-support/scripted-transport';

import {
  ADMIN_MONITORING_HEALTH_KEY,
  adminRouteUsageKey,
  decodeAdminMonitoring,
  decodeAdminRouteUsage,
  loadAdminMonitoring,
  loadAdminRouteUsage,
} from './admin-monitoring';
import { estClefNonPersistable } from './souverain';

describe('decodeAdminMonitoring — la santé', () => {
  test('lit les sept familles : processus, base, Redis, temps réel, traduction, coupe-circuits, présence', () => {
    expect(decodeAdminMonitoring(servedMonitoring())).toEqual({
      generatedAt: '2026-09-30T11:59:00.000Z',
      gateway: { uptimeSeconds: 273_600, memory: { heapUsed: 157_286_400, heapTotal: 209_715_200, rss: 367_001_600 } },
      database: { status: 'up', latencyMs: 12 },
      redis: { status: 'up', latencyMs: 3 },
      realtime: { connections: 152, connectedUsers: 97, messagesProcessed: 48_210, translationsSent: 31_004, errors: 2 },
      translator: {
        requestsSent: 31_100,
        received: 31_004,
        errors: 6,
        poolFullRejections: 4,
        avgProcessingTimeMs: 850,
        cacheHitRate: 62.5,
        memoryUsageMb: 150,
        uptimeSeconds: 273_500,
      },
      circuitBreakers: [
        { name: 'translator-zmq', state: 'CLOSED', failures: 0, successes: 4_120, lastFailureAt: null },
        { name: 'push-provider', state: 'OPEN', failures: 5, successes: 310, lastFailureAt: '2026-09-30T11:55:00.000Z' },
        { name: 'mailer', state: 'HALF_OPEN', failures: 2, successes: 40, lastFailureAt: '2026-09-30T10:00:00.000Z' },
      ],
      presenceUpdates: { totalRequests: 1_200, throttledRequests: 30, throttleRate: 2.5 },
    });
  });

  test('le traducteur et la présence valent `null` quand la passerelle n’a rien à lire : pas de zéros fabriqués', () => {
    const monitoring = decodeAdminMonitoring(servedMonitoring({ translator: null, presenceUpdates: null }));

    expect(monitoring?.translator).toBeNull();
    expect(monitoring?.presenceUpdates).toBeNull();
  });

  test('une dépendance tombée garde sa latence `null` : « aucune réponse », jamais zéro milliseconde', () => {
    const monitoring = decodeAdminMonitoring(servedMonitoring({ database: { status: 'down', latencyMs: null } }));

    expect(monitoring?.database).toEqual({ status: 'down', latencyMs: null });
  });

  test('ne garde que ce que l’écran affiche : ni les succès de présence, ni le total des coupe-circuits', () => {
    const monitoring = decodeAdminMonitoring(servedMonitoring());

    expect(Object.keys(monitoring?.presenceUpdates ?? {}).sort()).toEqual(['throttleRate', 'throttledRequests', 'totalRequests']);
    expect(Object.keys(monitoring?.circuitBreakers[0] ?? {}).sort()).toEqual(['failures', 'lastFailureAt', 'name', 'state', 'successes']);
  });

  test('un compteur illisible vaut zéro, jamais NaN ; un coupe-circuit sans nom est écarté', () => {
    const monitoring = decodeAdminMonitoring(
      servedMonitoring({
        realtime: { connections: 'beaucoup', connectedUsers: -4 },
        circuitBreakers: [{ state: 'OPEN', failures: 3 }, null, { name: 'mailer', state: 'CLOSED', failures: 'x' }],
      }),
    );

    expect(monitoring?.realtime).toEqual({ connections: 0, connectedUsers: 0, messagesProcessed: 0, translationsSent: 0, errors: 0 });
    expect(monitoring?.circuitBreakers).toEqual([{ name: 'mailer', state: 'CLOSED', failures: 0, successes: 0, lastFailureAt: null }]);
  });

  test('une charge qui n’est pas un objet est illisible — `null`, pas un écran de zéros', () => {
    expect(decodeAdminMonitoring(null)).toBeNull();
    expect(decodeAdminMonitoring('ok')).toBeNull();
  });
});

describe('loadAdminMonitoring', () => {
  test('appelle l’adresse du catalogue et décode la charge', async () => {
    const { deps, calls } = scriptedGateway({ [`GET ${adminEndpoints.monitoring}`]: { ok: true, status: 200, data: servedMonitoring() } });

    const result = await loadAdminMonitoring(deps);

    expect(calls().map((call) => call.path)).toEqual([adminEndpoints.monitoring]);
    expect(result.ok && result.data.database.status).toBe('up');
  });

  test('une charge illisible est une erreur, un refus est rendu tel quel', async () => {
    const illisible = scriptedGateway({ [`GET ${adminEndpoints.monitoring}`]: { ok: true, status: 200, data: null } });
    expect(await loadAdminMonitoring(illisible.deps)).toMatchObject({ ok: false, code: 'UNREADABLE' });

    const refuse = scriptedGateway({ [`GET ${adminEndpoints.monitoring}`]: { ok: false, status: 403, error: 'interdit' } });
    expect(await loadAdminMonitoring(refuse.deps)).toMatchObject({ ok: false, status: 403 });
  });

  test('la clé est sous le préfixe `admin` : jamais persistée', () => {
    expect(ADMIN_MONITORING_HEALTH_KEY).toEqual(['admin', 'monitoring', 'health']);
    expect(estClefNonPersistable(ADMIN_MONITORING_HEALTH_KEY)).toBe(true);
    expect(estClefNonPersistable(adminRouteUsageKey(DEFAULT_ROUTE_USAGE_STATE))).toBe(true);
  });
});

describe('decodeAdminRouteUsage — l’usage des routes', () => {
  test('lit l’observation, les routes surveillées, le détail et les angles morts', () => {
    const usage = decodeAdminRouteUsage(servedRouteUsage());

    expect(usage).toMatchObject({
      instrumented: true,
      observingSince: '2026-09-29T08:00:00.000Z',
      observedForMs: 100_800_000,
      windowMs: 86_400_000,
      saturated: false,
      droppedSamples: 0,
      scope: 'watched',
      entriesTotal: 2,
      entriesTruncated: false,
      blindSpots: BLIND_SPOTS,
    });
    expect(usage?.watched).toHaveLength(4);
    expect(usage?.watched[1]).toEqual({ method: 'GET', route: ROUTE.used, issue: 4182, matched: true, count: 37, lastSeenAt: '2026-09-30T11:58:00.000Z' });
    expect(usage?.entries[0]).toEqual({
      method: 'GET',
      route: ROUTE.used,
      platform: '*',
      version: '*',
      count: 37,
      lastSeenAt: '2026-09-30T11:58:00.000Z',
      total: true,
    });
  });

  test('ne garde ni l’instance, ni les tranches, ni le nombre de clés : rien que l’écran n’affiche', () => {
    const usage = decodeAdminRouteUsage(servedRouteUsage());

    expect(Object.keys(usage ?? {}).sort()).toEqual([
      'blindSpots',
      'droppedSamples',
      'entries',
      'entriesTotal',
      'entriesTruncated',
      'instrumented',
      'observedForMs',
      'observingSince',
      'saturated',
      'scope',
      'watched',
      'windowMs',
    ]);
    expect(JSON.stringify(usage)).not.toContain('gw-7f3a');
  });

  test('`matched` garde ses trois états : montée, plus montée, pas encore vérifiée', () => {
    const usage = decodeAdminRouteUsage(servedRouteUsage());
    expect(usage?.watched.map((route) => route.matched)).toEqual([true, true, false, null]);
  });

  test('une mesure non installée se dit : `instrumented` ne vaut vrai que sur un vrai `true`', () => {
    expect(decodeAdminRouteUsage(servedRouteUsage({ instrumented: false }))?.instrumented).toBe(false);
    expect(decodeAdminRouteUsage(servedRouteUsage({ instrumented: 'oui' }))?.instrumented).toBe(false);
  });

  test('une ligne sans méthode ou sans route est écartée, jamais réparée', () => {
    const usage = decodeAdminRouteUsage(
      servedRouteUsage({
        watched: [servedWatched(), { method: 'GET' }, null],
        entries: [servedUsageEntry(), { route: '/x' }, 'x'],
      }),
    );

    expect(usage?.watched).toHaveLength(1);
    expect(usage?.entries).toHaveLength(1);
  });

  test('une charge qui n’est pas un objet est illisible', () => {
    expect(decodeAdminRouteUsage(undefined)).toBeNull();
  });
});

describe('loadAdminRouteUsage — la requête et la clé', () => {
  test('envoie la portée, la taille et — seulement si elle est posée — la recherche', async () => {
    const plain = `${adminEndpoints.routeUsage}?scope=watched&limit=100`;
    const searched = `${adminEndpoints.routeUsage}?scope=all&limit=100&route=auth`;
    const { deps, calls } = scriptedGateway({
      [`GET ${plain}`]: { ok: true, status: 200, data: servedRouteUsage() },
      [`GET ${searched}`]: { ok: true, status: 200, data: servedRouteUsage({ scope: 'all' }) },
    });

    const first = await loadAdminRouteUsage({ ...deps, state: DEFAULT_ROUTE_USAGE_STATE });
    const second = await loadAdminRouteUsage({ ...deps, state: withRoute(withScope(DEFAULT_ROUTE_USAGE_STATE, 'all'), 'auth') });

    expect(calls().map((call) => call.path)).toEqual([plain, searched]);
    expect(first.ok && first.data.scope).toBe('watched');
    expect(second.ok && second.data.scope).toBe('all');
  });

  test('une charge illisible est une erreur ; la clé porte les trois choix', async () => {
    const path = `${adminEndpoints.routeUsage}?scope=watched&limit=100`;
    const { deps } = scriptedGateway({ [`GET ${path}`]: { ok: true, status: 200, data: [] } });

    expect(await loadAdminRouteUsage({ ...deps, state: DEFAULT_ROUTE_USAGE_STATE })).toMatchObject({ ok: false, code: 'UNREADABLE' });
    expect(adminRouteUsageKey(DEFAULT_ROUTE_USAGE_STATE)).toEqual(['admin', 'monitoring', 'routes', 'watched', '', 100]);
  });
});
