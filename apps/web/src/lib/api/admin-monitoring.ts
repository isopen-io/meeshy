import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { routeUsageRequestQuery, type RouteUsageScope, type RouteUsageState } from '@/lib/admin/monitoring-state';

import { asCount, asRecord, asText, type AdminDeps } from './admin';
import type { ApiResult } from './http';
import { unreadableFailure } from './link-failure';

/**
 * **LA SUPERVISION** (#8876, #6734) — deux lectures, décodées CHAMP PAR CHAMP :
 *
 * - `GET /admin/monitoring` : la santé de la plateforme en UNE lecture (processus,
 *   base, Redis, temps réel, traduction, coupe-circuits, présence) ;
 * - `GET /admin/route-usage` : qui appelle quelles adresses, par plateforme et par
 *   version, sur la fenêtre glissante de l'instance.
 *
 * **Un zéro n'est pas une absence** : `translator` et `presenceUpdates` valent `null`
 * quand la passerelle n'a RIEN à lire (« inconnu »), jamais des compteurs à zéro —
 * le décodeur garde ce `null`, l'écran ne dessine pas de carte de zéros fabriqués.
 * Une charge illisible est une ERREUR, pas un écran de zéros.
 *
 * Ne traverse ce module que ce que l'écran affiche : ni l'instance, ni les
 * tranches, ni le nombre de clés distinctes du compteur d'usage.
 *
 * Clés sous le préfixe `admin` : jamais persistées sur le disque (#8876).
 */
export const ADMIN_MONITORING_QUERY_KEY = ['admin', 'monitoring'] as const;

export const ADMIN_MONITORING_HEALTH_KEY = [...ADMIN_MONITORING_QUERY_KEY, 'health'] as const;

export const adminRouteUsageKey = (state: RouteUsageState) => [...ADMIN_MONITORING_QUERY_KEY, 'routes', state.scope, state.route, state.limit] as const;

export type AdminDependencyState = {
  readonly status: string;
  readonly latencyMs: number | null;
};

export type AdminCircuitBreaker = {
  readonly name: string;
  readonly state: string;
  readonly failures: number;
  readonly successes: number;
  readonly lastFailureAt: string | null;
};

export type AdminTranslatorStats = {
  readonly requestsSent: number;
  readonly received: number;
  readonly errors: number;
  readonly poolFullRejections: number;
  readonly avgProcessingTimeMs: number;
  /** 0–100 : la passerelle sert un POURCENTAGE (`hits / total * 100`), pas un ratio. */
  readonly cacheHitRate: number;
  readonly memoryUsageMb: number;
  readonly uptimeSeconds: number;
};

export type AdminPresenceStats = {
  readonly totalRequests: number;
  readonly throttledRequests: number;
  /** 0–100 : un pourcentage arrondi au centième. */
  readonly throttleRate: number;
};

export type AdminMonitoring = {
  readonly generatedAt: string | null;
  readonly gateway: {
    readonly uptimeSeconds: number;
    readonly memory: { readonly heapUsed: number; readonly heapTotal: number; readonly rss: number };
  };
  readonly database: AdminDependencyState;
  readonly redis: AdminDependencyState;
  readonly realtime: {
    readonly connections: number;
    readonly connectedUsers: number;
    readonly messagesProcessed: number;
    readonly translationsSent: number;
    readonly errors: number;
  };
  readonly translator: AdminTranslatorStats | null;
  readonly circuitBreakers: readonly AdminCircuitBreaker[];
  readonly presenceUpdates: AdminPresenceStats | null;
};

const textOrNull = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

/** `asRecord` accepte un tableau : pour une charge entière, un tableau n'est pas l'objet attendu. */
const payloadOf = (raw: unknown): Readonly<Record<string, unknown>> | null => (Array.isArray(raw) ? null : asRecord(raw));

const numberOrNull = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null);

function decodeDependency(raw: unknown): AdminDependencyState {
  const dependency = asRecord(raw);
  return { status: asText(dependency?.status), latencyMs: numberOrNull(dependency?.latencyMs) };
}

function decodeTranslator(raw: unknown): AdminTranslatorStats | null {
  const translator = asRecord(raw);
  if (translator === null) return null;
  return {
    requestsSent: asCount(translator.requestsSent),
    received: asCount(translator.received),
    errors: asCount(translator.errors),
    poolFullRejections: asCount(translator.poolFullRejections),
    avgProcessingTimeMs: asCount(translator.avgProcessingTimeMs),
    cacheHitRate: asCount(translator.cacheHitRate),
    memoryUsageMb: asCount(translator.memoryUsageMb),
    uptimeSeconds: asCount(translator.uptimeSeconds),
  };
}

function decodePresence(raw: unknown): AdminPresenceStats | null {
  const presence = asRecord(raw);
  if (presence === null) return null;
  return {
    totalRequests: asCount(presence.totalRequests),
    throttledRequests: asCount(presence.throttledRequests),
    throttleRate: asCount(presence.throttleRate),
  };
}

function decodeBreaker(raw: unknown): AdminCircuitBreaker | null {
  const breaker = asRecord(raw);
  const name = textOrNull(breaker?.name);
  if (breaker === null || name === null) return null;
  return {
    name,
    state: asText(breaker.state),
    failures: asCount(breaker.failures),
    successes: asCount(breaker.successes),
    lastFailureAt: textOrNull(breaker.lastFailureAt),
  };
}

/** `null` quand la charge n'est pas un objet : l'écran dit l'erreur plutôt que de montrer des zéros. */
export function decodeAdminMonitoring(raw: unknown): AdminMonitoring | null {
  const payload = payloadOf(raw);
  if (payload === null) return null;
  const gateway = asRecord(payload.gateway);
  const memory = asRecord(gateway?.memory);
  const realtime = asRecord(payload.realtime);
  const breakers = Array.isArray(payload.circuitBreakers) ? payload.circuitBreakers : [];

  return {
    generatedAt: textOrNull(payload.generatedAt),
    gateway: {
      uptimeSeconds: asCount(gateway?.uptimeSeconds),
      memory: { heapUsed: asCount(memory?.heapUsed), heapTotal: asCount(memory?.heapTotal), rss: asCount(memory?.rss) },
    },
    database: decodeDependency(payload.database),
    redis: decodeDependency(payload.redis),
    realtime: {
      connections: asCount(realtime?.connections),
      connectedUsers: asCount(realtime?.connectedUsers),
      messagesProcessed: asCount(realtime?.messagesProcessed),
      translationsSent: asCount(realtime?.translationsSent),
      errors: asCount(realtime?.errors),
    },
    translator: decodeTranslator(payload.translator),
    circuitBreakers: breakers.flatMap((breaker) => decodeBreaker(breaker) ?? []),
    presenceUpdates: decodePresence(payload.presenceUpdates),
  };
}

export async function loadAdminMonitoring(params: AdminDeps & { readonly signal?: AbortSignal }): Promise<ApiResult<AdminMonitoring>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.monitoring,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const monitoring = decodeAdminMonitoring(result.data);
  return monitoring === null ? unreadableFailure('Supervision') : { ok: true, data: monitoring };
}

export type AdminWatchedRoute = {
  readonly method: string;
  readonly route: string;
  readonly issue: number;
  /** `null` : la table de routage n'a pas encore été confrontée à l'adresse ; `false` : elle n'est plus montée. */
  readonly matched: boolean | null;
  readonly count: number;
  readonly lastSeenAt: string | null;
};

export type AdminRouteUsageEntry = {
  readonly method: string;
  readonly route: string;
  readonly platform: string;
  readonly version: string;
  readonly count: number;
  readonly lastSeenAt: string | null;
  /** Vrai pour le seau TOTAL d'une route surveillée (toutes plateformes, toutes versions). */
  readonly total: boolean;
};

export type AdminRouteUsage = {
  /** Faux : le hook de mesure n'est pas posé — un tapis de zéros parfaitement crédible. */
  readonly instrumented: boolean;
  readonly observingSince: string | null;
  readonly observedForMs: number;
  readonly windowMs: number;
  readonly saturated: boolean;
  readonly droppedSamples: number;
  readonly scope: RouteUsageScope;
  readonly entriesTotal: number;
  readonly entriesTruncated: boolean;
  readonly watched: readonly AdminWatchedRoute[];
  readonly entries: readonly AdminRouteUsageEntry[];
  readonly blindSpots: readonly string[];
};

function decodeWatched(raw: unknown): AdminWatchedRoute | null {
  const watched = asRecord(raw);
  const method = textOrNull(watched?.method);
  const route = textOrNull(watched?.route);
  if (watched === null || method === null || route === null) return null;
  return {
    method,
    route,
    issue: asCount(watched.issue),
    matched: typeof watched.matched === 'boolean' ? watched.matched : null,
    count: asCount(watched.count),
    lastSeenAt: textOrNull(watched.lastSeenAt),
  };
}

function decodeEntry(raw: unknown): AdminRouteUsageEntry | null {
  const entry = asRecord(raw);
  const method = textOrNull(entry?.method);
  const route = textOrNull(entry?.route);
  if (entry === null || method === null || route === null) return null;
  return {
    method,
    route,
    platform: asText(entry.platform),
    version: asText(entry.version),
    count: asCount(entry.count),
    lastSeenAt: textOrNull(entry.lastSeenAt),
    total: entry.total === true,
  };
}

/** `null` quand la charge n'est pas un objet. Une ligne sans méthode ou sans route est écartée, jamais « réparée ». */
export function decodeAdminRouteUsage(raw: unknown): AdminRouteUsage | null {
  const payload = payloadOf(raw);
  if (payload === null) return null;
  const watched = Array.isArray(payload.watched) ? payload.watched : [];
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  const blindSpots = Array.isArray(payload.blindSpots) ? payload.blindSpots : [];

  return {
    instrumented: payload.instrumented === true,
    observingSince: textOrNull(payload.observingSince),
    observedForMs: asCount(payload.observedForMs),
    windowMs: asCount(payload.windowMs),
    saturated: payload.saturated === true,
    droppedSamples: asCount(payload.droppedSamples),
    scope: payload.scope === 'all' ? 'all' : 'watched',
    entriesTotal: asCount(payload.entriesTotal),
    entriesTruncated: payload.entriesTruncated === true,
    watched: watched.flatMap((row) => decodeWatched(row) ?? []),
    entries: entries.flatMap((row) => decodeEntry(row) ?? []),
    blindSpots: blindSpots.flatMap((spot) => textOrNull(spot) ?? []),
  };
}

export async function loadAdminRouteUsage(
  params: AdminDeps & { readonly state: RouteUsageState; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminRouteUsage>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.routeUsage}?${routeUsageRequestQuery(params.state).toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const usage = decodeAdminRouteUsage(result.data);
  return usage === null ? unreadableFailure('Usage des routes') : { ok: true, data: usage };
}
