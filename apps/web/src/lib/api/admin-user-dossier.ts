import { type AdminDeps, asCount, asRecord, asText, pageServie } from './admin';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **LE DOSSIER D'UN MEMBRE** (#7845, #7873) — ce que la fiche montre au-delà
 * de son identité : ses contacts, ses communautés, son profil vocal, ses
 * sessions et événements de sécurité, les signalements qu'il a faits et ceux
 * qui le visent.
 *
 * ## Deux régimes de cache, selon ce que la charge PORTE
 *
 * Le cache des requêtes est persisté sur le disque du navigateur de
 * l'administrateur (`query-client.ts`). Ce qui y survit ne doit pas être une
 * empreinte de traçage d'un tiers :
 *
 * - les SESSIONS et les ÉVÉNEMENTS DE SÉCURITÉ portent des adresses IP, des
 *   lieux, des appareils ; le PROFIL VOCAL est une donnée biométrique (même
 *   sans ses octets) ; le texte d'un MESSAGE SIGNALÉ est le contenu d'un
 *   tiers. Leurs clés descendent d'`ADMIN_SOUVERAIN_PREFIXE`, que le filtre
 *   de déshydratation exclut ;
 * - les contacts, communautés et signalements faits sont des métadonnées que
 *   la fiche et la liste montrent déjà ailleurs.
 *
 * Chaque décodeur construit sa ligne champ par champ — jamais de `...spread`
 * de la charge, qui recopierait en silence ce que la passerelle ajoutera.
 */

const dateOuNull = (valeur: unknown): string | null => (typeof valeur === 'string' && valeur !== '' ? valeur : null);

export const ADMIN_DOSSIER_PAGE_SIZE = 20;

export type AdminDossierPage<T> = {
  readonly rows: readonly T[];
  readonly total: number;
  readonly hasMore: boolean;
};

function page<T>(lignes: readonly T[], meta: Readonly<Record<string, unknown>>, offset: number): AdminDossierPage<T> {
  const total = asCount(meta.total) || lignes.length;
  const hasMore = typeof meta.hasMore === 'boolean' ? meta.hasMore : offset + lignes.length < total;
  return { rows: lignes, total, hasMore };
}

const garder = <T>(valeur: T | null): valeur is T => valeur !== null;

async function lire<T>(
  deps: AdminDeps & { readonly signal?: AbortSignal },
  path: string,
  decode: (resultat: { readonly data: unknown; readonly pagination?: unknown }) => T,
): Promise<ApiResult<T>> {
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path,
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decode(result) };
}

const cheminMembre = (userId: string, suite: string) => `/api/v1/admin/users/${encodeURIComponent(userId)}/${suite}`;

const pagine = (offset: number) =>
  new URLSearchParams({ offset: String(offset), limit: String(ADMIN_DOSSIER_PAGE_SIZE) }).toString();

// ---------------------------------------------------------------------------
// LES CONTACTS — GET /admin/users/:userId/activity (`contacts.sent|received`)
// ---------------------------------------------------------------------------

export type AdminContact = {
  readonly id: string;
  readonly direction: 'sent' | 'received';
  readonly status: string;
  readonly createdAt: string | null;
  readonly other: { readonly id: string; readonly username: string; readonly displayName: string; readonly avatar: string };
};

export type AdminActivity = {
  readonly contacts: readonly AdminContact[];
  readonly shareLinks: number;
  readonly trackingLinks: number;
  readonly affiliateTokens: number;
};

function decodeContact(brut: unknown, direction: AdminContact['direction']): AdminContact | null {
  const ligne = asRecord(brut);
  const autre = asRecord(direction === 'sent' ? ligne?.receiver : ligne?.sender);
  if (ligne === null || typeof ligne.id !== 'string' || autre === null || typeof autre.id !== 'string') return null;
  const username = asText(autre.username);
  return {
    id: ligne.id,
    direction,
    status: asText(ligne.status) || 'pending',
    createdAt: dateOuNull(ligne.createdAt),
    other: { id: autre.id, username, displayName: asText(autre.displayName) || username, avatar: asText(autre.avatar) },
  };
}

export function decodeAdminActivity(raw: unknown): AdminActivity {
  const charge = asRecord(raw) ?? {};
  const contacts = asRecord(charge.contacts) ?? {};
  const liste = (valeur: unknown): readonly unknown[] => (Array.isArray(valeur) ? valeur : []);
  const tous = [
    ...liste(contacts.sent).map((c) => decodeContact(c, 'sent')),
    ...liste(contacts.received).map((c) => decodeContact(c, 'received')),
  ]
    .filter(garder)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return {
    contacts: tous,
    shareLinks: liste(charge.shareLinks).length,
    trackingLinks: liste(charge.trackingLinks).length,
    affiliateTokens: liste(charge.affiliateTokens).length,
  };
}

export const adminUserActivityQueryKey = (userId: string) => ['admin', 'user', userId, 'activity'] as const;

export function loadAdminUserActivity(params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal }) {
  return lire(params, cheminMembre(params.userId, 'activity'), (r) => decodeAdminActivity(r.data));
}

// ---------------------------------------------------------------------------
// LES COMMUNAUTÉS — GET /admin/users/:userId/communities
// ---------------------------------------------------------------------------

export type AdminCommunity = {
  readonly id: string;
  readonly name: string;
  readonly identifier: string;
  readonly avatar: string;
  readonly isPrivate: boolean;
  readonly memberCount: number;
  readonly role: string;
  readonly joinedAt: string | null;
  readonly isActive: boolean;
  readonly leftAt: string | null;
  readonly isCreator: boolean;
};

function decodeCommunity(brut: unknown): AdminCommunity | null {
  const ligne = asRecord(brut);
  if (ligne === null) return null;
  const communaute = asRecord(ligne.community) ?? ligne;
  const adhesion = asRecord(ligne.membership) ?? ligne;
  const id = typeof communaute.id === 'string' ? communaute.id : null;
  if (id === null) return null;
  return {
    id,
    name: asText(communaute.name) || asText(communaute.identifier) || '—',
    identifier: asText(communaute.identifier),
    avatar: asText(communaute.avatar),
    isPrivate: communaute.isPrivate === true,
    memberCount: asCount(communaute.memberCount),
    role: asText(adhesion.role) || asText(adhesion.memberRole) || 'member',
    joinedAt: dateOuNull(adhesion.joinedAt),
    isActive: adhesion.isActive !== false,
    leftAt: dateOuNull(adhesion.leftAt),
    isCreator: ligne.isCreator === true || communaute.isCreator === true,
  };
}

export function decodeAdminCommunities(resultat: { readonly data: unknown; readonly pagination?: unknown }, offset: number) {
  const charge = asRecord(resultat.data);
  const servie = pageServie(resultat);
  const lignes = Array.isArray(charge?.communities) ? charge.communities : servie.lignes;
  const meta = asRecord(charge?.pagination) ?? servie.meta;
  return page(lignes.map(decodeCommunity).filter(garder), meta, offset);
}

export const adminUserCommunitiesQueryKey = (userId: string, offset: number) => ['admin', 'user', userId, 'communities', offset] as const;

export function loadAdminUserCommunities(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${cheminMembre(params.userId, 'communities')}?${pagine(params.offset)}`, (r) => decodeAdminCommunities(r, params.offset));
}

// ---------------------------------------------------------------------------
// LE PROFIL VOCAL — GET /admin/users/:userId/voice-profile (souverain)
// ---------------------------------------------------------------------------

export type AdminVoiceProfile = {
  readonly profile: {
    readonly audioCount: number;
    readonly totalDurationMs: number;
    readonly model: string;
    readonly createdAt: string | null;
    readonly updatedAt: string | null;
  } | null;
  readonly consents: {
    readonly voiceProfile: string | null;
    readonly voiceData: string | null;
    readonly voiceCloning: string | null;
  };
};

export function decodeAdminVoiceProfile(raw: unknown): AdminVoiceProfile {
  const charge = asRecord(raw) ?? {};
  const profil = asRecord(charge.voiceProfile);
  const consentements = asRecord(charge.consents) ?? {};
  return {
    profile:
      profil === null
        ? null
        : {
            audioCount: asCount(profil.audioCount),
            totalDurationMs: asCount(profil.totalDurationMs),
            model: asText(profil.embeddingModel),
            createdAt: dateOuNull(profil.createdAt),
            updatedAt: dateOuNull(profil.updatedAt),
          },
    consents: {
      voiceProfile: dateOuNull(consentements.voiceProfileConsentAt),
      voiceData: dateOuNull(consentements.voiceDataConsentAt),
      voiceCloning: dateOuNull(consentements.voiceCloningEnabledAt),
    },
  };
}

export const adminUserVoiceQueryKey = (userId: string) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'voice'] as const;

export function loadAdminUserVoice(params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal }) {
  return lire(params, cheminMembre(params.userId, 'voice-profile'), (r) => decodeAdminVoiceProfile(r.data));
}

// ---------------------------------------------------------------------------
// LES SESSIONS ET LES ÉVÉNEMENTS DE SÉCURITÉ (souverains, canViewSensitiveData)
// ---------------------------------------------------------------------------

export type AdminSession = {
  readonly id: string;
  readonly device: string;
  readonly ipAddress: string;
  readonly place: string;
  readonly isValid: boolean;
  readonly isTrusted: boolean;
  readonly createdAt: string | null;
  readonly lastActivityAt: string | null;
};

function decodeSession(brut: unknown): AdminSession | null {
  const ligne = asRecord(brut);
  if (ligne === null || typeof ligne.id !== 'string') return null;
  const morceaux = (valeurs: readonly unknown[]) => valeurs.map(asText).filter((v) => v !== '').join(' ');
  const appareil = [
    morceaux([ligne.browserName, ligne.browserVersion]),
    morceaux([ligne.osName, ligne.osVersion]),
    morceaux([ligne.deviceVendor, ligne.deviceModel]),
  ].filter((v) => v !== '');
  return {
    id: ligne.id,
    device: appareil.join(' · ') || asText(ligne.deviceType) || '—',
    ipAddress: asText(ligne.ipAddress),
    place: [asText(ligne.city), asText(ligne.country)].filter((v) => v !== '').join(', ') || asText(ligne.location),
    isValid: ligne.isValid === true,
    isTrusted: ligne.isTrusted === true,
    createdAt: dateOuNull(ligne.createdAt),
    lastActivityAt: dateOuNull(ligne.lastActivityAt),
  };
}

export type AdminSecurityEvent = {
  readonly id: string;
  readonly eventType: string;
  readonly severity: string;
  readonly status: string;
  readonly description: string;
  readonly ipAddress: string;
  readonly createdAt: string | null;
};

function decodeSecurityEvent(brut: unknown): AdminSecurityEvent | null {
  const ligne = asRecord(brut);
  if (ligne === null || typeof ligne.id !== 'string') return null;
  return {
    id: ligne.id,
    eventType: asText(ligne.eventType),
    severity: asText(ligne.severity),
    status: asText(ligne.status),
    description: asText(ligne.description),
    ipAddress: asText(ligne.ipAddress),
    createdAt: dateOuNull(ligne.createdAt),
  };
}

export const adminUserSessionsQueryKey = (userId: string, offset: number) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'sessions', offset] as const;
export const adminUserSecurityQueryKey = (userId: string, offset: number) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'security', offset] as const;

export function loadAdminUserSessions(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${cheminMembre(params.userId, 'sessions')}?${pagine(params.offset)}`, (r) => {
    const servie = pageServie(r);
    return page(servie.lignes.map(decodeSession).filter(garder), servie.meta, params.offset);
  });
}

export function loadAdminUserSecurityEvents(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${cheminMembre(params.userId, 'security-events')}?${pagine(params.offset)}`, (r) => {
    const servie = pageServie(r);
    return page(servie.lignes.map(decodeSecurityEvent).filter(garder), servie.meta, params.offset);
  });
}

// ---------------------------------------------------------------------------
// LES SIGNALEMENTS — faits par le membre, et ceux qui visent ses messages
// ---------------------------------------------------------------------------

export type AdminReport = {
  readonly id: string;
  readonly subject: string;
  readonly reportType: string;
  readonly reason: string;
  readonly status: string;
  readonly createdAt: string | null;
  /** Pour un signalement REÇU : le texte du message, `null` quand la passerelle le retient (#4494). */
  readonly excerpt: string | null;
};

function decodeReportFiled(brut: unknown): AdminReport | null {
  const ligne = asRecord(brut);
  if (ligne === null || typeof ligne.id !== 'string') return null;
  return {
    id: ligne.id,
    subject: asText(ligne.reportedType),
    reportType: asText(ligne.reportType),
    reason: asText(ligne.reason),
    status: asText(ligne.status),
    createdAt: dateOuNull(ligne.createdAt),
    excerpt: null,
  };
}

function decodeReportReceived(brut: unknown): AdminReport | null {
  const ligne = asRecord(brut);
  if (ligne === null || typeof ligne.id !== 'string') return null;
  const message = asRecord(ligne.message);
  const contenu = message === null ? null : typeof message.content === 'string' ? message.content : null;
  return {
    id: ligne.id,
    subject: asText(ligne.reporterName),
    reportType: asText(ligne.reportType),
    reason: asText(ligne.reason),
    status: asText(ligne.status),
    createdAt: dateOuNull(ligne.createdAt),
    excerpt: contenu,
  };
}

export const adminUserReportsFiledQueryKey = (userId: string, offset: number) => ['admin', 'user', userId, 'reports', offset] as const;
export const adminUserReportsReceivedQueryKey = (userId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'reported-messages', offset] as const;

export function loadAdminUserReportsFiled(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${cheminMembre(params.userId, 'reports')}?${pagine(params.offset)}`, (r) => {
    const servie = pageServie(r);
    return page(servie.lignes.map(decodeReportFiled).filter(garder), servie.meta, params.offset);
  });
}

export function loadAdminUserReportsReceived(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${cheminMembre(params.userId, 'reported-messages')}?${pagine(params.offset)}`, (r) => {
    const servie = pageServie(r);
    return page(servie.lignes.map(decodeReportReceived).filter(garder), servie.meta, params.offset);
  });
}
