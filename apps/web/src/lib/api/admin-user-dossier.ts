import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText, pageServie } from './admin';
import type { ApiResult } from './http';
import { acknowledged, type AdminLinkAck } from './admin-share-links-person';
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
  decode: (resultat: { readonly data: unknown; readonly pagination?: unknown; readonly meta?: Readonly<Record<string, unknown>> }) => T,
): Promise<ApiResult<T>> {
  const result = await deps.transport.request<unknown>({
    method: 'GET',
    path,
    ...(deps.signal === undefined ? {} : { signal: deps.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decode(result) };
}

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
  /**
   * Les TOTAUX servis (`totals`, audit du 2026-10-04) : chaque liste est bornée à
   * cinquante lignes, et sa longueur n'est pas le compte. `null` quand la passerelle
   * ne les sert pas (ancien serveur) — l'écran se rabat alors sur les compteurs de
   * la fiche, jamais sur la longueur d'une liste plafonnée.
   */
  readonly totals: { readonly contactsSent: number; readonly contactsReceived: number } | null;
};

/** Le plafond de chaque liste de `GET …/activity` (`take: 50`). */
export const ADMIN_ACTIVITY_LIST_CAP = 50;

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
  const totaux = asRecord(charge.totals);
  const compte = (cle: string, repli: number): number => (totaux !== null && typeof totaux[cle] === 'number' ? asCount(totaux[cle]) : repli);
  return {
    contacts: tous,
    shareLinks: compte('shareLinks', liste(charge.shareLinks).length),
    trackingLinks: compte('trackingLinks', liste(charge.trackingLinks).length),
    affiliateTokens: compte('affiliateTokens', liste(charge.affiliateTokens).length),
    totals:
      totaux === null || typeof totaux.contactsSent !== 'number' || typeof totaux.contactsReceived !== 'number'
        ? null
        : { contactsSent: asCount(totaux.contactsSent), contactsReceived: asCount(totaux.contactsReceived) },
  };
}

export const adminUserActivityQueryKey = (userId: string) => ['admin', 'user', userId, 'activity'] as const;

export function loadAdminUserActivity(params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal }) {
  return lire(params, adminEndpoints.usersByUserIdActivity(params.userId), (r) => decodeAdminActivity(r.data));
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
  return lire(params, `${adminEndpoints.usersByUserIdCommunities(params.userId)}?${pagine(params.offset)}`, (r) => decodeAdminCommunities(r, params.offset));
}

// ---------------------------------------------------------------------------
// LE PROFIL VOCAL — GET /admin/users/:userId/voice-profile (souverain)
// ---------------------------------------------------------------------------

export type AdminVoiceProfile = {
  readonly profile: {
    readonly audioCount: number;
    readonly totalDurationMs: number;
    readonly model: string;
    /** Le score de qualité du modèle, de 0 à 1 (`VoiceModel.qualityScore`) — `null` s'il n'est pas servi. */
    readonly qualityScore: number | null;
    /** La dernière analyse de la voix, et la date où le membre l'a rendue publique. */
    readonly analysisAt: string | null;
    readonly publicAt: string | null;
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
            qualityScore: typeof profil.qualityScore === 'number' && Number.isFinite(profil.qualityScore) ? profil.qualityScore : null,
            analysisAt: dateOuNull(profil.voiceAnalysisAt),
            publicAt: dateOuNull(profil.voicePublicAt),
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
  return lire(params, adminEndpoints.usersByUserIdVoiceProfile(params.userId), (r) => decodeAdminVoiceProfile(r.data));
}

// ---------------------------------------------------------------------------
// LES SESSIONS ET LES ÉVÉNEMENTS DE SÉCURITÉ (souverains, canViewSensitiveData)
// ---------------------------------------------------------------------------

export type AdminSession = {
  readonly id: string;
  readonly device: string;
  /** Le nom lisible DÉCLARÉ par le client (« Pixel 7 ») — la chaîne vide quand il manque. */
  readonly deviceName: string;
  readonly ipAddress: string;
  readonly place: string;
  /** Ce que le client déclare et ce que le serveur pose (#9610) — des CODES pour la plateforme et le moyen, à interpréter. */
  readonly appVersion: string;
  readonly appBuild: string;
  readonly platform: string;
  readonly loginMethod: string;
  readonly timezone: string;
  /** L'agent BRUT, montré en détail : l'appareil composé en est la lecture. */
  readonly userAgent: string;
  readonly isValid: boolean;
  readonly isTrusted: boolean;
  readonly createdAt: string | null;
  readonly lastActivityAt: string | null;
  /** L'échéance de la session : passée, une session encore `isValid` est EXPIRÉE, pas valide. */
  readonly expiresAt: string | null;
  /** Quand et pourquoi elle a été fermée (`logout`, `admin_revoke`, `expired`…) — un CODE, à interpréter. */
  readonly invalidatedAt: string | null;
  readonly invalidatedReason: string | null;
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
    deviceName: asText(ligne.deviceName),
    ipAddress: asText(ligne.ipAddress),
    place: [asText(ligne.city), asText(ligne.country)].filter((v) => v !== '').join(', ') || asText(ligne.location),
    appVersion: asText(ligne.appVersion),
    appBuild: asText(ligne.appBuild),
    platform: asText(ligne.platform),
    loginMethod: asText(ligne.loginMethod),
    timezone: asText(ligne.timezone),
    userAgent: asText(ligne.userAgent),
    isValid: ligne.isValid === true,
    isTrusted: ligne.isTrusted === true,
    createdAt: dateOuNull(ligne.createdAt),
    lastActivityAt: dateOuNull(ligne.lastActivityAt),
    expiresAt: dateOuNull(ligne.expiresAt),
    invalidatedAt: dateOuNull(ligne.invalidatedAt),
    invalidatedReason: dateOuNull(ligne.invalidatedReason),
  };
}

/** L'état d'une session À `now` : fermée, expirée (échéance passée sans fermeture écrite), ou valide. */
export function sessionStateOf(session: Pick<AdminSession, 'isValid' | 'expiresAt'>, now: Date): 'valid' | 'expired' | 'closed' {
  if (!session.isValid) return 'closed';
  if (session.expiresAt === null) return 'valid';
  const fin = new Date(session.expiresAt).getTime();
  return !Number.isNaN(fin) && fin <= now.getTime() ? 'expired' : 'valid';
}

/**
 * RÉVOQUER UNE SESSION NOMMÉE — `DELETE /admin/users/:userId/sessions/:sessionId` (exige
 * `canViewSensitiveData` et le rang sur le membre visé). La passerelle ferme CET appareil et
 * consigne le geste ; rien de la charge rendue ne sert, la vérité se relit par invalidation.
 */
export async function revokeAdminUserSession(params: AdminDeps & { readonly userId: string; readonly sessionId: string }): Promise<ApiResult<AdminLinkAck>> {
  return acknowledged(
    await params.transport.request<unknown>({
      method: 'DELETE',
      path: adminEndpoints.usersByUserIdSessionsBySessionId(params.userId, params.sessionId),
    }),
  );
}

/**
 * TOUT FERMER (#9613) — `DELETE /admin/users/:userId/sessions` : toutes les
 * sessions du membre en base, toutes ses sockets, `REVOKE_SESSION` journalisé
 * (`scope: 'all'`), le membre informé au nom de « l'équipe Meeshy ». La route
 * ne lit AUCUN corps : aucun motif ne s'y écrit. Rend le nombre réellement
 * fermé.
 */
export async function revokeAllAdminUserSessions(
  params: AdminDeps & { readonly userId: string },
): Promise<ApiResult<{ readonly revokedCount: number }>> {
  const result = await params.transport.request<unknown>({ method: 'DELETE', path: adminEndpoints.usersByUserIdSessions(params.userId) });
  if (!result.ok) return result;
  return { ok: true, data: { revokedCount: asCount(asRecord(result.data)?.revokedCount) } };
}

/** L'effet IMMÉDIAT de « tout fermer » : chaque session ouverte de la page se dit fermée par l'administration. */
export function withAllSessionsClosed(before: unknown, nowIso: string): unknown {
  const current = asRecord(before);
  const rows = current?.rows;
  if (current === null || !Array.isArray(rows)) return before;
  return {
    ...current,
    rows: rows.map((row) => {
      const ligne = asRecord(row);
      return ligne === null || ligne.isValid !== true ? row : { ...ligne, isValid: false, invalidatedAt: nowIso, invalidatedReason: 'admin_revoke' };
    }),
  };
}

/**
 * L'effet IMMÉDIAT de la révocation sur la page de sessions en cache : la ligne s'en va, le total
 * baisse d'autant. Une charge qui n'a pas la forme d'une page est rendue telle quelle.
 */
export function withoutSession(before: unknown, sessionId: string): unknown {
  const current = asRecord(before);
  const rows = current?.rows;
  if (current === null || !Array.isArray(rows)) return before;
  const kept = rows.filter((row) => asRecord(row)?.id !== sessionId);
  return { ...current, rows: kept, total: Math.max(0, asCount(current.total) - (rows.length - kept.length)) };
}

export type AdminSecurityEvent = {
  readonly id: string;
  readonly eventType: string;
  readonly severity: string;
  readonly status: string;
  readonly description: string;
  readonly ipAddress: string;
  /** « Ville, Pays », tel que servi — la chaîne vide quand il manque. */
  readonly geoLocation: string;
  /** L'agent utilisateur BRUT : l'écran le lit (`deviceLabel`), il ne l'affiche jamais tel quel. */
  readonly userAgent: string;
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
    geoLocation: asText(ligne.geoLocation),
    userAgent: asText(ligne.userAgent),
    createdAt: dateOuNull(ligne.createdAt),
  };
}

export const adminUserSessionsQueryKey = (userId: string, offset: number) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'sessions', offset] as const;
export const adminUserSecurityQueryKey = (userId: string, offset: number) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'security', offset] as const;

/** L'attribution que la licence de la base de lieux exige (DB-IP, CC-BY 4.0), telle que SERVIE en `meta.geolocation`. */
export type AdminGeolocation = { readonly text: string; readonly url: string; readonly approximate: boolean };

export type AdminSessionsPage = AdminDossierPage<AdminSession> & { readonly geolocation: AdminGeolocation | null };

/** Une adresse qui n'est pas `https:` n'est pas un lien ; absente, rien n'est attribué à sa place. */
function decodeGeolocation(brut: unknown): AdminGeolocation | null {
  const servie = asRecord(brut);
  const text = asText(servie?.text);
  const url = asText(servie?.url);
  if (text === '' || !url.startsWith('https://')) return null;
  return { text, url, approximate: servie?.approximate !== false };
}

export function loadAdminUserSessions(
  params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminSessionsPage>> {
  return lire(params, `${adminEndpoints.usersByUserIdSessions(params.userId)}?${pagine(params.offset)}`, (r) => {
    const servie = pageServie(r);
    return { ...page(servie.lignes.map(decodeSession).filter(garder), servie.meta, params.offset), geolocation: decodeGeolocation(r.meta?.geolocation) };
  });
}

export function loadAdminUserSecurityEvents(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${adminEndpoints.usersByUserIdSecurityEvents(params.userId)}?${pagine(params.offset)}`, (r) => {
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
  /** Pour un signalement REÇU : le texte du message, `null` quand la passerelle le retient (#4494) ou qu'il a disparu. */
  readonly excerpt: string | null;
  /**
   * Ce qu'est devenu le message visé (signalement REÇU) : `shown` (texte servi),
   * `withheld` (la passerelle retient le texte à ce rôle), `deleted` (`message: null`
   * — introuvable — ou `deletedAt` posé). Un message disparu n'est pas un contenu
   * retenu (audit 2026-10-04). `null` pour un signalement FAIT.
   */
  readonly messageState: 'shown' | 'withheld' | 'deleted' | null;
  /** La conversation du message signalé, nommée (`conversation.title`) ; `null` quand elle n'est pas servie. */
  readonly conversation: { readonly id: string; readonly title: string | null } | null;
  readonly resolvedAt: string | null;
  /** La suite donnée (`warning_sent`, `content_removed`…) — un CODE, à interpréter. */
  readonly actionTaken: string | null;
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
    messageState: null,
    conversation: null,
    resolvedAt: dateOuNull(ligne.resolvedAt),
    actionTaken: dateOuNull(ligne.actionTaken),
  };
}

function decodeReportReceived(brut: unknown): AdminReport | null {
  const ligne = asRecord(brut);
  if (ligne === null || typeof ligne.id !== 'string') return null;
  const message = asRecord(ligne.message);
  const supprime = message === null || dateOuNull(message.deletedAt) !== null;
  const contenu = message === null || supprime ? null : typeof message.content === 'string' ? message.content : null;
  const conversation = asRecord(ligne.conversation);
  return {
    id: ligne.id,
    subject: asText(ligne.reporterName),
    reportType: asText(ligne.reportType),
    reason: asText(ligne.reason),
    status: asText(ligne.status),
    createdAt: dateOuNull(ligne.createdAt),
    excerpt: contenu,
    messageState: supprime ? 'deleted' : contenu === null ? 'withheld' : 'shown',
    conversation:
      conversation === null || typeof conversation.id !== 'string' || conversation.id === ''
        ? null
        : { id: conversation.id, title: dateOuNull(typeof conversation.title === 'string' ? conversation.title.trim() : null) },
    resolvedAt: dateOuNull(ligne.resolvedAt),
    actionTaken: dateOuNull(ligne.actionTaken),
  };
}

export const adminUserReportsFiledQueryKey = (userId: string, offset: number) => ['admin', 'user', userId, 'reports', offset] as const;
export const adminUserReportsReceivedQueryKey = (userId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'reported-messages', offset] as const;

export function loadAdminUserReportsFiled(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${adminEndpoints.usersByUserIdReports(params.userId)}?${pagine(params.offset)}`, (r) => {
    const servie = pageServie(r);
    return page(servie.lignes.map(decodeReportFiled).filter(garder), servie.meta, params.offset);
  });
}

export function loadAdminUserReportsReceived(params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal }) {
  return lire(params, `${adminEndpoints.usersByUserIdReportedMessages(params.userId)}?${pagine(params.offset)}`, (r) => {
    const servie = pageServie(r);
    return page(servie.lignes.map(decodeReportReceived).filter(garder), servie.meta, params.offset);
  });
}
