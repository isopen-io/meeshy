import * as z from 'zod/mini';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DE LA SÉCURITÉ DU COMPTE** (#6720) — les sessions ouvertes, les
 * appareils qui reçoivent les notifications, et l'état du second facteur.
 *
 * Trois familles, trois adresses, mesurées dans la passerelle :
 *
 *  - `GET /auth/sessions` (`routes/auth/magic-link.ts:513`) — la liste, avec
 *    `isCurrentSession` marqué depuis l'en-tête `x-session-token` que le
 *    transport pose déjà pour une session authentifiée ;
 *  - `DELETE /auth/sessions/:sessionId` (`:569`) — en fermer UNE ;
 *  - `DELETE /auth/sessions` (`:651`) — fermer TOUTES LES AUTRES (la courante
 *    est gardée), qui rend `revokedCount` ;
 *  - `GET /users/me/devices` (`routes/push-tokens.ts:355`) et
 *    `DELETE /users/me/devices/:deviceId` (`:427`) — les appareils de push ;
 *  - `GET /auth/2fa/status` (`routes/two-factor.ts:60`) — l'état du second
 *    facteur, sans jamais toucher à son activation.
 *
 * ## CE QUI N'ENTRE PAS DANS LA MÉMOIRE DU CLIENT
 *
 * La charge des sessions porte `ipAddress`, `country`, `city` et `location`.
 * **Le décodeur les JETTE**, et ce n'est pas de la prudence décorative : le
 * cache de requêtes est PERSISTÉ dans le `localStorage`
 * (`query-client.ts § persist` : `shouldDehydrateQuery` accepte TOUTE requête
 * réussie, sans exception possible). Les laisser passer écrirait durablement,
 * sur la machine du lecteur, l'adresse IP et la géolocalisation de chacune de
 * ses connexions — exactement ce que `session.ts` refuse de persister pour la
 * session courante (sa règle 1, doctrine du cycle 125 : « une protection se
 * mesure sur tout ce que la charge TRANSPORTE »).
 *
 * C'est le même remède que `friend-requests.ts` applique à la présence
 * d'autrui : on PROJETTE au décodage, on n'exempte pas la requête — il n'existe
 * aucun mécanisme d'exemption dans ce dépôt.
 *
 * **Ce qu'on garde suffit à RECONNAÎTRE un appareil** : son type, sa marque, son
 * modèle, son système, son navigateur, la date de sa première et de sa dernière
 * activité. C'est la question à laquelle cet écran répond — « est-ce moi ? » —
 * et elle ne demande pas de savoir d'où.
 *
 * ## AUCUNE BRANCHE `fixtures`
 *
 * Même raison que `admin.ts` : une démonstration afficherait des appareils
 * INVENTÉS, dont l'un se dirait « cet appareil ». Un écran dont le métier est de
 * dire la vérité sur qui est connecté ne peut pas mentir en démonstration. Sous
 * `source: 'fixtures'`, les lectures échouent proprement et l'écran rend son
 * état d'erreur.
 */

export type AccountSecurityDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const SESSIONS_QUERY_KEY = ['me', 'sessions'] as const;
export const DEVICES_QUERY_KEY = ['me', 'devices'] as const;
export const TWO_FACTOR_QUERY_KEY = ['me', 'two-factor'] as const;

/** Une session ouverte — SANS rien qui dise OÙ elle l'est. */
export type ActiveSession = {
  readonly id: string;
  readonly deviceType: string | null;
  readonly deviceVendor: string | null;
  readonly deviceModel: string | null;
  readonly osName: string | null;
  readonly osVersion: string | null;
  readonly browserName: string | null;
  readonly isMobile: boolean;
  readonly createdAt: string | null;
  readonly lastActivityAt: string | null;
  /** Marquée par la passerelle depuis l'en-tête `x-session-token`. C'est elle
   * qu'on ne doit PAS proposer de fermer sans le dire. */
  readonly isCurrent: boolean;
  readonly isTrusted: boolean;
};

export const DEVICE_KINDS = ['apns', 'fcm', 'voip'] as const;
export const DEVICE_PLATFORMS = ['ios', 'android', 'web'] as const;

export type DeviceKind = (typeof DEVICE_KINDS)[number];
export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];

export type PushDevice = {
  readonly id: string;
  /** Un genre hors de la liste servie ne s'invente pas : l'écran le tait. */
  readonly kind: DeviceKind | null;
  readonly platform: DevicePlatform | null;
  readonly deviceName: string | null;
  readonly appVersion: string | null;
  readonly isActive: boolean;
  readonly lastUsedAt: string | null;
  readonly createdAt: string | null;
};

export type TwoFactorStatus = {
  readonly enabled: boolean;
  readonly enabledAt: string | null;
  readonly hasBackupCodes: boolean;
  readonly backupCodesCount: number;
};

const optionalText = z.optional(z.nullable(z.string()));
const optionalFlag = z.optional(z.nullable(z.boolean()));

const textOrNull = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

/**
 * LA PROJECTION DES SESSIONS. Le schéma ne DÉCLARE pas `ipAddress`, `country`,
 * `city` ni `location` : `zod/mini` ignore ce qu'il ne déclare pas, et l'objet
 * rendu est construit champ par champ — deux gardes pour la même règle, parce
 * qu'une seule se contourne au premier `...wire` ajouté par distraction.
 */
const WireSession = z.object({
  id: z.string().check(z.minLength(1)),
  deviceType: optionalText,
  deviceVendor: optionalText,
  deviceModel: optionalText,
  osName: optionalText,
  osVersion: optionalText,
  browserName: optionalText,
  isMobile: optionalFlag,
  createdAt: optionalText,
  lastActivityAt: optionalText,
  isCurrentSession: optionalFlag,
  isTrusted: optionalFlag,
});

export function decodeSession(raw: unknown): ActiveSession | null {
  const parsed = WireSession.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    id: wire.id,
    deviceType: textOrNull(wire.deviceType),
    deviceVendor: textOrNull(wire.deviceVendor),
    deviceModel: textOrNull(wire.deviceModel),
    osName: textOrNull(wire.osName),
    osVersion: textOrNull(wire.osVersion),
    browserName: textOrNull(wire.browserName),
    isMobile: wire.isMobile === true,
    createdAt: textOrNull(wire.createdAt),
    lastActivityAt: textOrNull(wire.lastActivityAt),
    isCurrent: wire.isCurrentSession === true,
    isTrusted: wire.isTrusted === true,
  };
}

const WireDevice = z.object({
  id: z.string().check(z.minLength(1)),
  type: optionalText,
  platform: optionalText,
  deviceName: optionalText,
  appVersion: optionalText,
  isActive: optionalFlag,
  lastUsedAt: optionalText,
  createdAt: optionalText,
});

export function decodeDevice(raw: unknown): PushDevice | null {
  const parsed = WireDevice.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    id: wire.id,
    kind: DEVICE_KINDS.find((kind) => kind === wire.type) ?? null,
    platform: DEVICE_PLATFORMS.find((platform) => platform === wire.platform) ?? null,
    deviceName: textOrNull(wire.deviceName),
    appVersion: textOrNull(wire.appVersion),
    /* ABSENT ⇒ actif : la passerelle ne sert `isActive: false` que pour un
     * appareil qu'elle a désarmé, et supposer l'inverse ferait disparaître de
     * la liste des appareils bien vivants. */
    isActive: wire.isActive !== false,
    lastUsedAt: textOrNull(wire.lastUsedAt),
    createdAt: textOrNull(wire.createdAt),
  };
}

const WireTwoFactor = z.object({
  enabled: optionalFlag,
  enabledAt: optionalText,
  hasBackupCodes: optionalFlag,
  backupCodesCount: z.optional(z.nullable(z.number())),
});

/**
 * FAIL-CLOSED : `enabled` absent ⇒ NON activé, `hasBackupCodes` absent ⇒ aucun
 * code. Annoncer une protection qu'on n'a pas mesurée est pire que de la taire.
 */
export function decodeTwoFactorStatus(raw: unknown): TwoFactorStatus {
  const parsed = WireTwoFactor.safeParse(raw);
  const wire = parsed.success ? parsed.data : {};
  const count = wire.backupCodesCount;
  return {
    enabled: wire.enabled === true,
    enabledAt: textOrNull(wire.enabledAt),
    hasBackupCodes: wire.hasBackupCodes === true,
    backupCodesCount: typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0,
  };
}

const rowsOf = <T>(data: unknown, decode: (raw: unknown) => T | null): readonly T[] =>
  (Array.isArray(data) ? data : []).flatMap((raw) => {
    const row = decode(raw);
    return row === null ? [] : [row];
  });

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

const NOT_SERVED: ApiFailure = { ok: false, status: 501, error: 'La sécurité du compte n’a pas de démonstration' };

/** `{ sessions, totalCount }` — la liste est DANS `data`, pas à côté. */
export async function loadActiveSessions(
  params: AccountSecurityDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly ActiveSession[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') return NOT_SERVED;
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: '/api/v1/auth/sessions',
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const charge = result.data;
  const brut = charge !== null && typeof charge === 'object' ? (charge as { sessions?: unknown }).sessions : undefined;
  return { ok: true, data: rowsOf(brut, decodeSession) };
}

export async function revokeSession(deps: AccountSecurityDeps, sessionId: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return NOT_SERVED;
  return deps.transport.request<unknown>({
    method: 'DELETE',
    path: `/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`,
  });
}

/**
 * FERMER TOUTES LES AUTRES — la courante est GARDÉE par la passerelle, qui la
 * reconnaît à l'en-tête `x-session-token`. Rend le nombre réellement fermé :
 * « 3 sessions fermées » se dit, « des sessions ont été fermées » se devine.
 */
export async function revokeOtherSessions(deps: AccountSecurityDeps): Promise<ApiResult<number>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return NOT_SERVED;
  const result = await deps.transport.request<unknown>({ method: 'DELETE', path: '/api/v1/auth/sessions' });
  if (!result.ok) return result;
  const charge = result.data;
  const count = charge !== null && typeof charge === 'object' ? (charge as { revokedCount?: unknown }).revokedCount : undefined;
  return { ok: true, data: typeof count === 'number' && Number.isFinite(count) && count > 0 ? count : 0 };
}

export async function loadPushDevices(
  params: AccountSecurityDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<readonly PushDevice[]>> {
  if (__FIXTURES__ && params.source === 'fixtures') return NOT_SERVED;
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: '/api/v1/users/me/devices',
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  return { ok: true, data: rowsOf(result.data, decodeDevice) };
}

export async function forgetDevice(deps: AccountSecurityDeps, deviceId: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return NOT_SERVED;
  return deps.transport.request<unknown>({
    method: 'DELETE',
    path: `/api/v1/users/me/devices/${encodeURIComponent(deviceId)}`,
  });
}

export async function loadTwoFactorStatus(
  params: AccountSecurityDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<TwoFactorStatus>> {
  if (__FIXTURES__ && params.source === 'fixtures') return NOT_SERVED;
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: '/api/v1/auth/2fa/status',
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeTwoFactorStatus(result.data) };
}

/**
 * CE QUE L'ÉCRAN DIT D'UN REFUS — une cause, jamais un statut. `not-found` sur
 * une fermeture est un SUCCÈS déguisé (la session n'existe plus : elle est
 * fermée), et l'écran doit pouvoir le traiter comme tel plutôt que d'alarmer.
 */
export type SecurityFailure = 'signed-out' | 'not-found' | 'offline' | 'unavailable';

export function securityFailureOf(failure: Pick<ApiFailure, 'status'>): SecurityFailure {
  if (failure.status === 401) return 'signed-out';
  if (failure.status === 404) return 'not-found';
  if (failure.status === 0) return 'offline';
  return 'unavailable';
}
