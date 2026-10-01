/**
 * **LES CHARGES DE LA SUPERVISION, TELLES QUE LA PASSERELLE LES SERT** (#8876) —
 * les formes exactes de `routes/admin/monitoring.ts` et `routes/admin/route-usage.ts`,
 * copiées clé par clé. Partagées par les témoins ; aucune n'est lue par le produit.
 */
import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

type Served = Record<string, unknown>;

/**
 * Les adresses des témoins viennent du catalogue généré (jamais écrites à la main) : une
 * route surveillée n'est qu'un chemin, et n'importe quelle entrée du catalogue en est un.
 */
export const ROUTE = {
  unused: adminEndpoints.dashboard,
  used: adminEndpoints.users,
  gone: `${adminEndpoints.dashboard}/retired`,
  pending: adminEndpoints.ranking,
} as const;

export const servedMonitoring = (overrides: Served = {}): Served => ({
  generatedAt: '2026-09-30T11:59:00.000Z',
  gateway: {
    uptimeSeconds: 273_600,
    memory: { heapUsed: 157_286_400, heapTotal: 209_715_200, rss: 367_001_600 },
  },
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
    { name: 'translator-zmq', state: 'CLOSED', failures: 0, successes: 4_120, totalRequests: 4_120, lastFailureAt: null },
    { name: 'push-provider', state: 'OPEN', failures: 5, successes: 310, totalRequests: 315, lastFailureAt: '2026-09-30T11:55:00.000Z' },
    { name: 'mailer', state: 'HALF_OPEN', failures: 2, successes: 40, totalRequests: 42, lastFailureAt: '2026-09-30T10:00:00.000Z' },
  ],
  presenceUpdates: { totalRequests: 1_200, throttledRequests: 30, throttleRate: 2.5, successfulUpdates: 1_170, failedUpdates: 0 },
  ...overrides,
});

export const servedWatched = (overrides: Served = {}): Served => ({
  method: 'GET',
  route: ROUTE.unused,
  issue: 4181,
  matched: true,
  count: 0,
  lastSeenAt: null,
  ...overrides,
});

export const servedUsageEntry = (overrides: Served = {}): Served => ({
  method: 'GET',
  route: ROUTE.used,
  platform: 'ios',
  version: '2.4.0',
  count: 120,
  lastSeenAt: '2026-09-30T11:30:00.000Z',
  total: false,
  ...overrides,
});

export const BLIND_SPOTS = [
  "web-et-android-ne-posent-aucun-en-tete-de-version : seul iOS envoie X-Meeshy-Version. Tout le trafic web et Android tombe dans version=absent.",
  "agregat-en-memoire-et-par-instance : il meurt au redemarrage et ne totalise pas les repliques.",
  "cache-navigateur-et-service-worker : une reponse servie depuis un cache client n'atteint jamais le gateway.",
  "trafic-socket-io : les trames WebSocket ne produisent aucune reponse Fastify.",
  "routes-deja-retirees : une requete qui ne matche aucune route est comptee sous (unrouted).",
  "ventilation-sous-saturation : au-dela de maxKeysPerSlice, les NOUVELLES ventilations sont refusees.",
];

export const servedRouteUsage = (overrides: Served = {}): Served => ({
  instrumented: true,
  reconciled: true,
  instanceId: 'gw-7f3a',
  observingSince: '2026-09-29T08:00:00.000Z',
  observedForMs: 100_800_000,
  windowMs: 86_400_000,
  sliceCount: 24,
  generatedAt: '2026-09-30T12:00:00.000Z',
  saturated: false,
  droppedSamples: 0,
  distinctKeys: 12,
  maxKeysPerSlice: 512,
  scope: 'watched',
  entriesTotal: 2,
  entriesTruncated: false,
  watched: [
    servedWatched(),
    servedWatched({ route: ROUTE.used, issue: 4182, count: 37, lastSeenAt: '2026-09-30T11:58:00.000Z' }),
    servedWatched({ method: 'POST', route: ROUTE.gone, issue: 4184, matched: false }),
    servedWatched({ route: ROUTE.pending, issue: 4178, matched: null }),
  ],
  entries: [
    servedUsageEntry({ route: ROUTE.used, platform: '*', version: '*', count: 37, total: true, lastSeenAt: '2026-09-30T11:58:00.000Z' }),
    servedUsageEntry({ route: ROUTE.used, platform: 'android', version: 'absent', count: 25 }),
    servedUsageEntry({ route: ROUTE.used, platform: 'script', version: 'invalid', count: 12 }),
  ],
  blindSpots: BLIND_SPOTS,
  ...overrides,
});
