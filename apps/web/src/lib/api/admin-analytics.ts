import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import type { AdminDeps } from './admin';
import { countEntries, decoded, nonNegative, recordOf, textOf, withQuery } from './admin-analytics-decode';
import type { ApiResult } from './http';

/**
 * **LES STATISTIQUES D'ACTIVITÉ ET D'APPELS** (#8876, #6728) — sept lectures de
 * `GET /admin/analytics/*`, chacune décodée CHAMP PAR CHAMP : ce que l'écran
 * n'affiche pas ne traverse pas le décodeur.
 *
 * ## Ce que la passerelle sert, et que ce port ne lit délibérément pas
 *
 * - `kpis.avgSessionTime` (« 2h 45m ») et `kpis.peakHours` (« 18h-21h ») sont
 *   CODÉS EN DUR côté serveur : les afficher serait mentir. L'heure de pointe
 *   vient de `messagesTrends`.
 * - `volume-timeline.date`, `hourly-activity.hour`, `user-distribution.name`
 *   sont des libellés FRANÇAIS fabriqués par le serveur : on lit la POSITION
 *   (ou l'heure numérique) et l'écran re-libelle dans la langue d'interface.
 *   Les couleurs `color` servies sont ignorées (le kit a ses jetons).
 *
 * ## Une série POSITIONNELLE est tout ou rien
 *
 * Le jour d'un point se déduit de sa position ; écarter une ligne illisible
 * décalerait tous les libellés suivants, et la remplacer par zéro affirmerait
 * « aucune activité ce jour-là ». Une seule ligne illisible rend donc la série
 * entière illisible (un échec avec « Réessayer »).
 *
 * Clés sous `['admin', 'analytics']` : jamais persistées sur le disque.
 */
export type KpiPeriod = '7d' | '30d' | '90d';
export type MessageTypesPeriod = '24h' | '7d' | '30d';
export type CallsWindow = 7 | 30 | 90;

export const analyticsKeys = {
  realtime: () => ['admin', 'analytics', 'realtime'] as const,
  kpis: (period: KpiPeriod) => ['admin', 'analytics', 'kpis', period] as const,
  volume: () => ['admin', 'analytics', 'volume'] as const,
  hourly: () => ['admin', 'analytics', 'hourly'] as const,
  distribution: () => ['admin', 'analytics', 'distribution'] as const,
  messageTypes: (period: MessageTypesPeriod) => ['admin', 'analytics', 'message-types', period] as const,
  calls: (days: CallsWindow) => ['admin', 'analytics', 'calls', days] as const,
};

type Request = AdminDeps & { readonly signal?: AbortSignal };

const read = (params: Request, path: string): Promise<ApiResult<unknown>> =>
  params.transport.request<unknown>({ method: 'GET', path, ...(params.signal === undefined ? {} : { signal: params.signal }) });

const rows = (raw: unknown): readonly unknown[] | null => (Array.isArray(raw) ? raw : null);

// --- Le temps réel -----------------------------------------------------------

export type AnalyticsRealtime = {
  readonly onlineUsers: number | null;
  readonly messagesLastHour: number | null;
  readonly activeConversations: number | null;
  readonly timestamp: string | null;
};

export function decodeAnalyticsRealtime(raw: unknown): AnalyticsRealtime | null {
  const payload = recordOf(raw);
  if (payload === null) return null;
  return {
    onlineUsers: nonNegative(payload.onlineUsers),
    messagesLastHour: nonNegative(payload.messagesLastHour),
    activeConversations: nonNegative(payload.activeConversations),
    timestamp: textOf(payload.timestamp),
  };
}

export async function loadAnalyticsRealtime(params: Request): Promise<ApiResult<AnalyticsRealtime>> {
  return decoded(await read(params, adminEndpoints.analyticsRealtime), decodeAnalyticsRealtime, 'Temps réel');
}

// --- Les indicateurs de la période ---------------------------------------------

/** Les quatre taux que la passerelle CALCULE : les deux taux en pourcentage (0–100), la moyenne en messages par compte. */
export type AnalyticsKpis = {
  readonly engagementRate: number | null;
  readonly growthRate: number | null;
  readonly messagesPerUser: number | null;
  readonly activeUserRate: number | null;
};

export function decodeAnalyticsKpis(raw: unknown): AnalyticsKpis | null {
  const payload = recordOf(raw);
  if (payload === null) return null;
  return {
    engagementRate: nonNegative(payload.engagementRate),
    growthRate: nonNegative(payload.growthRate),
    messagesPerUser: nonNegative(payload.messagesPerUser),
    activeUserRate: nonNegative(payload.activeUserRate),
  };
}

export async function loadAnalyticsKpis(params: Request & { readonly period: KpiPeriod }): Promise<ApiResult<AnalyticsKpis>> {
  return decoded(await read(params, withQuery(adminEndpoints.analyticsKpis, { period: params.period })), decodeAnalyticsKpis, 'Indicateurs');
}

// --- Les séries positionnelles ------------------------------------------------

/** Les messages des 7 derniers jours, du plus ancien à aujourd'hui — le libellé du jour est calculé par l'écran, depuis la POSITION. */
export function decodeVolumeTimeline(raw: unknown): readonly number[] | null {
  const list = rows(raw);
  if (list === null) return null;
  const values = list.map((row) => nonNegative(recordOf(row)?.messages));
  return values.every((value): value is number => value !== null) ? values : null;
}

export async function loadAnalyticsVolumeTimeline(params: Request): Promise<ApiResult<readonly number[]>> {
  return decoded(await read(params, adminEndpoints.analyticsVolumeTimeline), decodeVolumeTimeline, 'Volume');
}

/** Les quatre tranches d'engagement, dans l'ordre servi (très actifs, actifs, occasionnels, inactifs) : le NOM vient de la position. */
export function decodeUserDistribution(raw: unknown): readonly number[] | null {
  const list = rows(raw);
  if (list === null) return null;
  const values = list.map((row) => nonNegative(recordOf(row)?.value));
  return values.every((value): value is number => value !== null) ? values : null;
}

export async function loadAnalyticsUserDistribution(params: Request): Promise<ApiResult<readonly number[]>> {
  return decoded(await read(params, adminEndpoints.analyticsUserDistribution), decodeUserDistribution, 'Distribution');
}

// --- L'activité par tranche de trois heures -------------------------------------

/** `hour` est l'heure de DÉBUT de la tranche (0–23) ; le serveur la sert « 14h », on la lit en nombre. */
export type HourlyBucket = { readonly hour: number; readonly messages: number };

const HOUR_LABEL = /^(\d{1,2})h$/;

export function decodeHourlyActivity(raw: unknown): readonly HourlyBucket[] | null {
  const list = rows(raw);
  if (list === null) return null;
  return list.flatMap((row) => {
    const record = recordOf(row);
    const match = HOUR_LABEL.exec(textOf(record?.hour) ?? '');
    const messages = nonNegative(record?.activity);
    const hour = match === null ? null : Number(match[1]);
    return hour === null || hour > 23 || messages === null ? [] : [{ hour, messages }];
  });
}

export async function loadAnalyticsHourlyActivity(params: Request): Promise<ApiResult<readonly HourlyBucket[]>> {
  return decoded(await read(params, adminEndpoints.analyticsHourlyActivity), decodeHourlyActivity, 'Activité horaire');
}

// --- Les types de messages -----------------------------------------------------

/** `percentage` est en 0–100 (arrondi par le serveur) ; `type` est le code de l'énumération, nommé par l'écran. */
export type MessageTypeShare = { readonly type: string; readonly count: number; readonly percentage: number };

export function decodeMessageTypes(raw: unknown): readonly MessageTypeShare[] | null {
  const list = rows(raw);
  if (list === null) return null;
  return list.flatMap((row) => {
    const record = recordOf(row);
    const type = textOf(record?.type);
    const count = nonNegative(record?.count);
    const percentage = nonNegative(record?.percentage);
    return type === null || count === null || percentage === null ? [] : [{ type, count, percentage }];
  });
}

export async function loadAnalyticsMessageTypes(params: Request & { readonly period: MessageTypesPeriod }): Promise<ApiResult<readonly MessageTypeShare[]>> {
  return decoded(await read(params, withQuery(adminEndpoints.analyticsMessageTypes, { period: params.period })), decodeMessageTypes, 'Types de messages');
}

// --- Les appels ----------------------------------------------------------------

/** La répartition moyenne des mesures de qualité, en PARTS (0–1) : excellente, bonne, moyenne, mauvaise. */
export type CallQualityShares = {
  readonly excellent: number;
  readonly good: number;
  readonly fair: number;
  readonly poor: number;
};

export type CountEntry = { readonly key: string; readonly count: number };

export type CallsFeedback = {
  readonly ratedCalls: number;
  readonly avgRating: number | null;
  /** Les cinq notes, dans l'ordre : l'indice 0 est la note 1. */
  readonly ratingDistribution: readonly number[];
  readonly byIssue: readonly CountEntry[];
};

/**
 * Les mesures d'appel. **Échelles** : `videoShare`, `connectSuccessRate`,
 * `callFailureRate`, `reconnectionRate` sont des PARTS (0–1) ; `avgPacketLoss` et
 * `maxPacketLoss` sont des POURCENTAGES (0–100, la perte que les clients
 * mesurent) ; les délais sont en millisecondes, la durée en secondes.
 *
 * `totalCalls` compte des RELEVÉS — un par participant qui a envoyé sa télémétrie
 * — pas des appels. Les moyennes de délai, de latence et de perte sont `null`
 * quand aucun appel n'a abouti : la passerelle refuse de moyenner le
 * « jamais connecté ».
 */
export type AnalyticsCalls = {
  readonly sampled: boolean;
  readonly totalCalls: number;
  readonly videoShare: number | null;
  readonly connectSuccessRate: number | null;
  readonly callFailureRate: number | null;
  readonly avgSetupTimeMs: number | null;
  readonly avgNegotiationTimeMs: number | null;
  readonly avgDurationSeconds: number | null;
  readonly avgReconnectionCount: number | null;
  readonly reconnectionRate: number | null;
  readonly avgNetworkTransitions: number | null;
  readonly avgRtt: number | null;
  readonly avgPacketLoss: number | null;
  readonly maxPacketLoss: number | null;
  readonly qualityDistribution: CallQualityShares;
  readonly byPlatform: readonly CountEntry[];
  readonly byEndReason: readonly CountEntry[];
  readonly feedback: CallsFeedback;
};

const ZERO_QUALITY: CallQualityShares = { excellent: 0, good: 0, fair: 0, poor: 0 };

function decodeQuality(raw: unknown): CallQualityShares {
  const record = recordOf(raw);
  if (record === null) return ZERO_QUALITY;
  return {
    excellent: nonNegative(record.excellent) ?? 0,
    good: nonNegative(record.good) ?? 0,
    fair: nonNegative(record.fair) ?? 0,
    poor: nonNegative(record.poor) ?? 0,
  };
}

function decodeFeedback(raw: unknown): CallsFeedback {
  const record = recordOf(raw);
  const distribution = recordOf(record?.ratingDistribution);
  return {
    ratedCalls: nonNegative(record?.ratedCalls) ?? 0,
    avgRating: nonNegative(record?.avgRating),
    ratingDistribution: [1, 2, 3, 4, 5].map((rating) => nonNegative(distribution?.[String(rating)]) ?? 0),
    byIssue: countEntries(record?.byIssue),
  };
}

export function decodeAnalyticsCalls(raw: unknown): AnalyticsCalls | null {
  const payload = recordOf(raw);
  const totalCalls = nonNegative(payload?.totalCalls);
  if (payload === null || totalCalls === null) return null;
  return {
    sampled: payload.sampled === true,
    totalCalls,
    videoShare: nonNegative(payload.videoShare),
    connectSuccessRate: nonNegative(payload.connectSuccessRate),
    callFailureRate: nonNegative(payload.callFailureRate),
    avgSetupTimeMs: nonNegative(payload.avgSetupTimeMs),
    avgNegotiationTimeMs: nonNegative(payload.avgNegotiationTimeMs),
    avgDurationSeconds: nonNegative(payload.avgDurationSeconds),
    avgReconnectionCount: nonNegative(payload.avgReconnectionCount),
    reconnectionRate: nonNegative(payload.reconnectionRate),
    avgNetworkTransitions: nonNegative(payload.avgNetworkTransitions),
    avgRtt: nonNegative(payload.avgRtt),
    avgPacketLoss: nonNegative(payload.avgPacketLoss),
    maxPacketLoss: nonNegative(payload.maxPacketLoss),
    qualityDistribution: decodeQuality(payload.qualityDistribution),
    byPlatform: countEntries(payload.byPlatform),
    byEndReason: countEntries(payload.byEndReason),
    feedback: decodeFeedback(payload.feedback),
  };
}

export async function loadAnalyticsCalls(params: Request & { readonly days: CallsWindow }): Promise<ApiResult<AnalyticsCalls>> {
  return decoded(await read(params, withQuery(adminEndpoints.analyticsCalls, { days: String(params.days) })), decodeAnalyticsCalls, 'Appels');
}
