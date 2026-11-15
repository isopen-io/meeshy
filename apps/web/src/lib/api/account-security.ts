import * as z from 'zod/mini';
import * as authEndpoints from '@meeshy/shared/api/endpoints/auth';
import * as usersEndpoints from '@meeshy/shared/api/endpoints/users';

import { CLIENT_PLATFORMS, SESSION_LOGIN_METHODS, type ClientPlatform, type SessionLoginMethod } from '@meeshy/shared/utils/client-session';

import type { DataSource } from './config';
import type { ApiFailure, ApiResult, HttpTransport } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

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
 * ## TOUT EST MONTRÉ, RIEN NE TOUCHE LE DISQUE
 *
 * Décision du porteur du 2026-10-08 (#6720, #9609) : l'écran Sécurité >
 * Sessions montre TOUT ce que la passerelle sait d'une session — version et
 * build de Meeshy, plateforme, appareil, système, navigateur, adresse IP, pays,
 * ville (approximative, tirée de l'adresse par une base LOCALE), fuseau,
 * ouverture, dernière activité, moyen de connexion. Elle REMPLACE la décision
 * antérieure de ce port, qui jetait l'adresse et le lieu au décodage.
 *
 * Ce qui reste vrai de l'ancienne raison : le cache de requêtes est PERSISTÉ
 * dans le `localStorage` (`query-client.ts`), et le service worker range les
 * réponses `/api/**` dans son seau `api`. Montrer n'oblige pas à GARDER :
 *
 *  - la clé descend d'`ADMIN_SOUVERAIN_PREFIXE`, que la déshydratation exclut
 *    (`souverain.ts`, dont c'est le titre : « ce qui ne doit pas toucher le
 *    disque ») — cache-first EN MÉMOIRE, d'un écran à l'autre, jamais sur le
 *    disque ; la préfixer coûte zéro octet au socle, là où étendre le prédicat
 *    en coûterait à la première peinture ;
 *  - `GET /auth/sessions` est hors du seau du service worker
 *    (`net/api-runtime-cache.ts`).
 *
 * L'attribution « IP Geolocation by DB-IP » (CC-BY 4.0) voyage avec la liste
 * (`data.geolocation`) et n'est montrée que SERVIE : un serveur antérieur
 * situait par un autre fournisseur, et l'attribuer à DB-IP mentirait.
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

export const SESSIONS_QUERY_KEY = [ADMIN_SOUVERAIN_PREFIXE, 'me', 'sessions'] as const;
export const DEVICES_QUERY_KEY = ['me', 'devices'] as const;
export const TWO_FACTOR_QUERY_KEY = ['me', 'two-factor'] as const;

/** Une session ouverte, telle que la passerelle la connaît (#9609, #9610). */
export type ActiveSession = {
  readonly id: string;
  readonly deviceType: string | null;
  readonly deviceVendor: string | null;
  readonly deviceModel: string | null;
  /** Le nom lisible que le client a déclaré (« iPhone 15 Pro », « Pixel 7 »). */
  readonly deviceName: string | null;
  readonly osName: string | null;
  readonly osVersion: string | null;
  readonly browserName: string | null;
  readonly browserVersion: string | null;
  readonly isMobile: boolean;
  readonly appVersion: string | null;
  readonly appBuild: string | null;
  /** Hors contrat ⇒ `null` : une plateforme ne s'invente pas. */
  readonly platform: ClientPlatform | null;
  /** Posé par le SERVEUR à l'ouverture, jamais déclaré par le client. */
  readonly loginMethod: SessionLoginMethod | null;
  readonly ipAddress: string | null;
  /** Code de pays tel que servi (ISO 3166-1, « SN ») — l'écran le nomme. */
  readonly country: string | null;
  readonly city: string | null;
  readonly location: string | null;
  readonly timezone: string | null;
  readonly createdAt: string | null;
  readonly lastActivityAt: string | null;
  /** Marquée par la passerelle depuis le `sid` du jeton. C'est elle qu'on ne
   * propose PAS de fermer. */
  readonly isCurrent: boolean;
  readonly isTrusted: boolean;
};

/** L'attribution que la licence de la base de lieux exige, telle que SERVIE. */
export type GeolocationAttribution = { readonly text: string; readonly url: string; readonly approximate: boolean };

export type ActiveSessions = {
  readonly sessions: readonly ActiveSession[];
  /** `null` : le serveur n'en sert pas — rien n'est attribué à sa place. */
  readonly geolocation: GeolocationAttribution | null;
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
 * LA LECTURE DES SESSIONS — l'objet rendu est construit champ par champ :
 * jamais un `...wire`, qui recopierait en silence ce que la passerelle
 * ajoutera (un jeton, une empreinte).
 */
const WireSession = z.object({
  id: z.string().check(z.minLength(1)),
  deviceType: optionalText,
  deviceVendor: optionalText,
  deviceModel: optionalText,
  deviceName: optionalText,
  osName: optionalText,
  osVersion: optionalText,
  browserName: optionalText,
  browserVersion: optionalText,
  isMobile: optionalFlag,
  appVersion: optionalText,
  appBuild: optionalText,
  platform: optionalText,
  loginMethod: optionalText,
  ipAddress: optionalText,
  country: optionalText,
  city: optionalText,
  location: optionalText,
  timezone: optionalText,
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
    deviceName: textOrNull(wire.deviceName),
    osName: textOrNull(wire.osName),
    osVersion: textOrNull(wire.osVersion),
    browserName: textOrNull(wire.browserName),
    browserVersion: textOrNull(wire.browserVersion),
    isMobile: wire.isMobile === true,
    appVersion: textOrNull(wire.appVersion),
    appBuild: textOrNull(wire.appBuild),
    platform: CLIENT_PLATFORMS.find((platform) => platform === wire.platform) ?? null,
    loginMethod: SESSION_LOGIN_METHODS.find((method) => method === wire.loginMethod) ?? null,
    ipAddress: textOrNull(wire.ipAddress),
    country: textOrNull(wire.country),
    city: textOrNull(wire.city),
    location: textOrNull(wire.location),
    timezone: textOrNull(wire.timezone),
    createdAt: textOrNull(wire.createdAt),
    lastActivityAt: textOrNull(wire.lastActivityAt),
    isCurrent: wire.isCurrentSession === true,
    isTrusted: wire.isTrusted === true,
  };
}

const WireAttribution = z.object({ text: z.string().check(z.minLength(1)), url: z.string(), approximate: optionalFlag });

/** L'attribution servie ; une adresse qui n'est pas `https:` n'est pas un lien. */
export function decodeGeolocation(raw: unknown): GeolocationAttribution | null {
  const parsed = WireAttribution.safeParse(raw);
  if (!parsed.success || !parsed.data.url.startsWith('https://')) return null;
  return { text: parsed.data.text, url: parsed.data.url, approximate: parsed.data.approximate !== false };
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

/** `{ sessions, totalCount, geolocation }` — la liste est DANS `data`, pas à côté. */
export async function loadActiveSessions(
  params: AccountSecurityDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<ActiveSessions>> {
  if (__FIXTURES__ && params.source === 'fixtures') return NOT_SERVED;
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: authEndpoints.sessions,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const charge = result.data !== null && typeof result.data === 'object' ? (result.data as { sessions?: unknown; geolocation?: unknown }) : {};
  return { ok: true, data: { sessions: rowsOf(charge.sessions, decodeSession), geolocation: decodeGeolocation(charge.geolocation) } };
}

export async function revokeSession(deps: AccountSecurityDeps, sessionId: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return NOT_SERVED;
  return deps.transport.request<unknown>({
    method: 'DELETE',
    path: authEndpoints.sessionsBySessionId(sessionId),
  });
}

/**
 * FERMER TOUTES LES AUTRES — la courante est GARDÉE par la passerelle, qui la
 * reconnaît à l'en-tête `x-session-token`. Rend le nombre réellement fermé :
 * « 3 sessions fermées » se dit, « des sessions ont été fermées » se devine.
 */
export async function revokeOtherSessions(deps: AccountSecurityDeps): Promise<ApiResult<number>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return NOT_SERVED;
  const result = await deps.transport.request<unknown>({ method: 'DELETE', path: authEndpoints.sessions });
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
    path: usersEndpoints.meDevices,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  return { ok: true, data: rowsOf(result.data, decodeDevice) };
}

export async function forgetDevice(deps: AccountSecurityDeps, deviceId: string): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return NOT_SERVED;
  return deps.transport.request<unknown>({
    method: 'DELETE',
    path: usersEndpoints.meDevicesByDeviceId(deviceId),
  });
}

export async function loadTwoFactorStatus(
  params: AccountSecurityDeps & { readonly signal?: AbortSignal },
): Promise<ApiResult<TwoFactorStatus>> {
  if (__FIXTURES__ && params.source === 'fixtures') return NOT_SERVED;
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: authEndpoints.n2FaStatus,
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
