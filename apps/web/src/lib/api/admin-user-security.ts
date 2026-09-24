import { type AdminDeps, asRecord, asText, bornesDePage, pageServie, type PageServie } from './admin';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **SESSIONS ET ÉVÉNEMENTS DE SÉCURITÉ D'UN MEMBRE** (#7845, sur les portes de
 * #6821) — `GET /api/v1/admin/users/:userId/sessions`,
 * `DELETE …/sessions/:sessionId` et `GET …/security-events`, toutes trois sous
 * `canViewSensitiveData` (ADMIN+) ; la révocation tient en plus le rang sur la
 * cible.
 *
 * ## Le SEUL endroit où l'empreinte de connexion se montre
 *
 * Appareil, IP, ville : le détail d'un membre les REFUSE (sa clé est persistée,
 * voir `admin-user-detail.ts`). Ils se lisent ici, sous des clés qui descendent
 * de {@link ADMIN_SOUVERAIN_PREFIXE} — le seul préfixe que `persistableQuery`
 * n'écrit jamais sur le disque.
 *
 * ## Ce qui n'est PAS décodé, même ici
 *
 * - `deviceFingerprint` : un identifiant de SUIVI, que la passerelle elle-même
 *   refuse de servir pour les sessions ; il voyage encore sur les événements,
 *   et s'arrête à ce décodeur.
 * - `metadata` d'un événement : un sac libre, dont le contenu varie par type et
 *   qu'aucun geste de l'écran ne lit.
 * - `latitude` / `longitude` : la ville suffit à dire D'OÙ ; une coordonnée
 *   précise ne sert aucune décision d'administration.
 *
 * ## Une session révoquée RESTE listée
 *
 * La passerelle sert toutes les sessions, valides et révoquées : un historique
 * qui n'afficherait que les vivantes n'en serait pas un.
 */
export type AdminSession = {
  readonly id: string;
  readonly deviceType: string;
  readonly deviceVendor: string;
  readonly deviceModel: string;
  readonly osName: string;
  readonly osVersion: string;
  readonly browserName: string;
  readonly browserVersion: string;
  readonly isMobile: boolean;
  readonly ipAddress: string;
  readonly country: string;
  readonly city: string;
  readonly location: string;
  readonly timezone: string;
  readonly isTrusted: boolean;
  readonly isValid: boolean;
  readonly expiresAt: string | null;
  readonly invalidatedAt: string | null;
  readonly invalidatedReason: string | null;
  readonly createdAt: string | null;
  readonly lastActivityAt: string | null;
};

export type AdminSecurityEvent = {
  readonly id: string;
  readonly eventType: string;
  /** `LOW` · `MEDIUM` · `HIGH` · `CRITICAL`, tel que servi. */
  readonly severity: string;
  readonly status: string;
  readonly description: string;
  readonly ipAddress: string;
  readonly userAgent: string;
  readonly geoLocation: string;
  readonly createdAt: string | null;
};

export type AdminSessionPage = {
  readonly sessions: readonly AdminSession[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export type AdminSecurityEventPage = {
  readonly events: readonly AdminSecurityEvent[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export const ADMIN_SECURITY_PAGE_SIZE = 20;

export const adminUserSessionsQueryKey = (userId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'sessions', offset] as const;

export const adminUserSecurityEventsQueryKey = (userId: string, offset: number, severity: string, eventType: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'security-events', offset, severity, eventType] as const;

const asTextOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

function decodeSession(raw: unknown): AdminSession | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

  return {
    id: ligne.id,
    deviceType: asText(ligne.deviceType),
    deviceVendor: asText(ligne.deviceVendor),
    deviceModel: asText(ligne.deviceModel),
    osName: asText(ligne.osName),
    osVersion: asText(ligne.osVersion),
    browserName: asText(ligne.browserName),
    browserVersion: asText(ligne.browserVersion),
    isMobile: ligne.isMobile === true,
    ipAddress: asText(ligne.ipAddress),
    country: asText(ligne.country),
    city: asText(ligne.city),
    location: asText(ligne.location),
    timezone: asText(ligne.timezone),
    isTrusted: ligne.isTrusted === true,
    // Fail-closed : une session dont la charge ne DIT pas qu'elle est valide ne
    // se présente pas comme vivante.
    isValid: ligne.isValid === true,
    expiresAt: asTextOrNull(ligne.expiresAt),
    invalidatedAt: asTextOrNull(ligne.invalidatedAt),
    invalidatedReason: asTextOrNull(ligne.invalidatedReason),
    createdAt: asTextOrNull(ligne.createdAt),
    lastActivityAt: asTextOrNull(ligne.lastActivityAt),
  };
}

function decodeSecurityEvent(raw: unknown): AdminSecurityEvent | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

  return {
    id: ligne.id,
    eventType: asText(ligne.eventType),
    severity: asText(ligne.severity),
    status: asText(ligne.status),
    description: asText(ligne.description),
    ipAddress: asText(ligne.ipAddress),
    userAgent: asText(ligne.userAgent),
    geoLocation: asText(ligne.geoLocation),
    createdAt: asTextOrNull(ligne.createdAt),
  };
}

export function decodeAdminSessionPage(page: PageServie, offset: number): AdminSessionPage {
  const sessions = page.lignes.map(decodeSession).filter((s): s is AdminSession => s !== null);
  return { sessions, ...bornesDePage(sessions, page.meta, offset) };
}

export function decodeAdminSecurityEventPage(page: PageServie, offset: number): AdminSecurityEventPage {
  const events = page.lignes.map(decodeSecurityEvent).filter((e): e is AdminSecurityEvent => e !== null);
  return { events, ...bornesDePage(events, page.meta, offset) };
}

const cheminMembre = (userId: string) => `/api/v1/admin/users/${encodeURIComponent(userId)}`;

export async function loadAdminUserSessions(
  params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminSessionPage>> {
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(ADMIN_SECURITY_PAGE_SIZE) });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${cheminMembre(params.userId)}/sessions?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminSessionPage(pageServie(result), params.offset) };
}

export async function loadAdminUserSecurityEvents(
  params: AdminDeps & {
    readonly userId: string;
    readonly offset: number;
    readonly severity?: string;
    readonly eventType?: string;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminSecurityEventPage>> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(ADMIN_SECURITY_PAGE_SIZE),
    // Un filtre VIDE n'est pas un filtre : `where.severity = ''` ne rendrait rien.
    ...(params.severity === undefined || params.severity === '' ? {} : { severity: params.severity }),
    ...(params.eventType === undefined || params.eventType === '' ? {} : { eventType: params.eventType }),
  });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${cheminMembre(params.userId)}/security-events?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminSecurityEventPage(pageServie(result), params.offset) };
}

/**
 * Coupe CET appareil, et lui seul (`disconnectSession` côté passerelle). La
 * réponse ne porte qu'un message : on rend l'identifiant révoqué, ce dont
 * l'écran a besoin pour mettre sa liste à jour sans relire.
 */
export async function revokeAdminUserSession(
  params: AdminDeps & { readonly userId: string; readonly sessionId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<{ readonly sessionId: string }>> {
  const result = await params.transport.request<unknown>({
    method: 'DELETE',
    path: `${cheminMembre(params.userId)}/sessions/${encodeURIComponent(params.sessionId)}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: { sessionId: params.sessionId } };
}
