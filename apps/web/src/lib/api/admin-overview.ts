import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { asRecord, type AdminDeps } from './admin';
import type { ApiResult } from './http';

/**
 * **LES LECTURES ANALYTIQUES DU TABLEAU DE BORD** (#8876, § 4) — sept adresses
 * `GET /admin/analytics/*`, chacune avec SON chargeur et SON décodeur, champ
 * par champ. Les lectures de la file de travail, des personnes et du système
 * vivent dans `admin-overview-queue.ts` ; celles des compteurs de la
 * plateforme dans `admin-dashboard.ts`.
 *
 * ## Ce que ces décodeurs refusent de faire
 *
 * - **Fabriquer un zéro.** Un compteur illisible se décode en `null`, que
 *   `formatCount` dit « — » : un zéro inventé se lirait comme une MESURE.
 * - **Réparer une série.** Les séries servies avec des libellés français
 *   (`volume-timeline.date`, `user-distribution.name`) se lisent par POSITION
 *   ou par INDICE ; une ligne illisible y rend toute la série illisible, parce
 *   que la position EST le libellé — l'écarter décalerait tous les jours
 *   suivants. Celles dont chaque ligne se nomme elle-même (`hourly-activity`,
 *   `language-distribution`, `message-types`) écartent la ligne.
 * - **Garder ce qui ment.** `kpis.avgSessionTime` et `kpis.peakHours` sont
 *   codés en dur côté passerelle (« 2h 45m », « 18h-21h ») ; les couleurs
 *   servies sont celles d'un autre design. Aucun n'est décodé.
 */

export type AdminReadParams = AdminDeps & { readonly signal?: AbortSignal };

const UNREADABLE: ApiResult<never> = { ok: false, status: 502, error: 'Réponse d’administration illisible' };

/**
 * LE SITE UNIQUE d'une lecture décodée : le transport, puis le décodeur. Un
 * échec du transport est rendu TEL QUEL (statut et message : l'écran en fait un
 * refus pour un 403, une erreur pour le reste) ; une charge que le décodeur ne
 * peut pas lire devient un échec — jamais un succès vide qu'on dessinerait.
 */
export async function readAdmin<T>(params: AdminReadParams, path: string, decode: (raw: unknown) => T | null): Promise<ApiResult<T>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const data = decode(result.data);
  return data === null ? UNREADABLE : { ok: true, data };
}

/** Un compte servi : entier ou décimal fini, jamais négatif. Sinon `null` — « je ne sais pas ». */
export const servedCount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

export const servedText = (value: unknown): string | null => (typeof value === 'string' && value.trim() !== '' ? value : null);

export const listOf = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** Les lignes d'un tableau qui se décodent ; les autres sont écartées. */
export function rowsOf<T>(value: unknown, decodeRow: (raw: unknown) => T | null): readonly T[] {
  return listOf(value).flatMap((raw) => {
    const row = decodeRow(raw);
    return row === null ? [] : [row];
  });
}

// ---------------------------------------------------------------------------
// En ce moment
// ---------------------------------------------------------------------------

export type AdminRealtime = {
  readonly onlineUsers: number | null;
  readonly messagesLastHour: number | null;
  readonly activeConversations: number | null;
};

export function decodeAdminRealtime(raw: unknown): AdminRealtime | null {
  const payload = asRecord(raw);
  if (payload === null || Array.isArray(raw)) return null;
  return {
    onlineUsers: servedCount(payload.onlineUsers),
    messagesLastHour: servedCount(payload.messagesLastHour),
    activeConversations: servedCount(payload.activeConversations),
  };
}

export const loadAdminRealtime = (params: AdminReadParams): Promise<ApiResult<AdminRealtime>> =>
  readAdmin(params, adminEndpoints.analyticsRealtime, decodeAdminRealtime);

// ---------------------------------------------------------------------------
// Santé de l'usage
// ---------------------------------------------------------------------------

export type AdminKpis = {
  /** 0–100, arrondi par le serveur. */
  readonly engagementRate: number | null;
  /** 0–100. */
  readonly growthRate: number | null;
  /** Un nombre de messages, PAS un pourcentage. */
  readonly messagesPerUser: number | null;
  /** 0–100. */
  readonly activeUserRate: number | null;
};

export function decodeAdminKpis(raw: unknown): AdminKpis | null {
  const payload = asRecord(raw);
  if (payload === null || Array.isArray(raw)) return null;
  return {
    engagementRate: servedCount(payload.engagementRate),
    growthRate: servedCount(payload.growthRate),
    messagesPerUser: servedCount(payload.messagesPerUser),
    activeUserRate: servedCount(payload.activeUserRate),
  };
}

export const loadAdminKpis = (params: AdminReadParams): Promise<ApiResult<AdminKpis>> =>
  readAdmin(params, `${adminEndpoints.analyticsKpis}?period=30d`, decodeAdminKpis);

// ---------------------------------------------------------------------------
// Tendances
// ---------------------------------------------------------------------------

/** Les volumes de messages des jours servis, dans l'ordre du serveur — le dernier est aujourd'hui. */
export function decodeAdminVolumeTimeline(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw)) return null;
  const days = raw.map((entry) => servedCount(asRecord(entry)?.messages));
  return days.every((day): day is number => day !== null) ? days : null;
}

export const loadAdminVolumeTimeline = (params: AdminReadParams): Promise<ApiResult<readonly number[]>> =>
  readAdmin(params, adminEndpoints.analyticsVolumeTimeline, decodeAdminVolumeTimeline);

export type AdminHourBucket = {
  /** L'heure de DÉBUT de la tranche de trois heures, 0–23, telle que le serveur la compte. */
  readonly startHour: number;
  readonly messages: number;
};

const HOUR_LABEL = /^(\d{1,2})h$/;

function decodeHourBucket(raw: unknown): AdminHourBucket | null {
  const row = asRecord(raw);
  const match = typeof row?.hour === 'string' ? HOUR_LABEL.exec(row.hour) : null;
  const messages = servedCount(row?.activity);
  if (match?.[1] === undefined || messages === null) return null;
  const startHour = Number(match[1]);
  return startHour <= 23 ? { startHour, messages } : null;
}

export function decodeAdminHourlyActivity(raw: unknown): readonly AdminHourBucket[] | null {
  return Array.isArray(raw) ? rowsOf(raw, decodeHourBucket) : null;
}

export const loadAdminHourlyActivity = (params: AdminReadParams): Promise<ApiResult<readonly AdminHourBucket[]>> =>
  readAdmin(params, adminEndpoints.analyticsHourlyActivity, decodeAdminHourlyActivity);

/** Les quatre tranches d'activité ont un NOM par position (très actifs, actifs, occasionnels, inactifs). */
const ACTIVITY_BUCKETS = 4;

export function decodeAdminUserDistribution(raw: unknown): readonly number[] | null {
  if (!Array.isArray(raw)) return null;
  const buckets = raw.slice(0, ACTIVITY_BUCKETS).map((entry) => servedCount(asRecord(entry)?.value));
  return buckets.every((bucket): bucket is number => bucket !== null) ? buckets : null;
}

export const loadAdminUserDistribution = (params: AdminReadParams): Promise<ApiResult<readonly number[]>> =>
  readAdmin(params, adminEndpoints.analyticsUserDistribution, decodeAdminUserDistribution);

export type AdminLanguageShare = { readonly code: string; readonly count: number };

function decodeLanguageShare(raw: unknown): AdminLanguageShare | null {
  const row = asRecord(raw);
  const code = servedText(row?.name);
  const count = servedCount(row?.value);
  return code === null || count === null ? null : { code, count };
}

export function decodeAdminLanguageDistribution(raw: unknown): readonly AdminLanguageShare[] | null {
  return Array.isArray(raw) ? rowsOf(raw, decodeLanguageShare) : null;
}

export const loadAdminLanguageDistribution = (params: AdminReadParams): Promise<ApiResult<readonly AdminLanguageShare[]>> =>
  readAdmin(params, `${adminEndpoints.analyticsLanguageDistribution}?limit=6`, decodeAdminLanguageDistribution);

export type AdminMessageTypeShare = { readonly type: string; readonly count: number };

function decodeMessageTypeShare(raw: unknown): AdminMessageTypeShare | null {
  const row = asRecord(raw);
  const type = servedText(row?.type);
  const count = servedCount(row?.count);
  return type === null || count === null ? null : { type, count };
}

export function decodeAdminMessageTypes(raw: unknown): readonly AdminMessageTypeShare[] | null {
  return Array.isArray(raw) ? rowsOf(raw, decodeMessageTypeShare) : null;
}

export const loadAdminMessageTypes = (params: AdminReadParams): Promise<ApiResult<readonly AdminMessageTypeShare[]>> =>
  readAdmin(params, `${adminEndpoints.analyticsMessageTypes}?period=7d`, decodeAdminMessageTypes);
