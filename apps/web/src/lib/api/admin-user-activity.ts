import { type AdminDeps, asCount, asRecord, asText, bornesDePage, pageServie, type PageServie } from './admin';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **L'ACTIVITÉ D'UN MEMBRE** (#7845) — trois lectures que la passerelle servait
 * et que la fiche ne consommait pas :
 *
 * | adresse | ce qu'elle sert | seuil |
 * |---|---|---|
 * | `GET /admin/users/:id/reports` | les signalements qu'il a ÉMIS | `canModerateContent` |
 * | `GET /admin/users/:id/reported-messages` | ses messages SIGNALÉS | `canViewUsers` ; `content` sous `canModerateContent` |
 * | `GET /admin/users/:id/activity` | liens créés, affiliations, demandes d'amis | `canViewUsers` |
 *
 * ## Des clés qui ne touchent pas le disque
 *
 * Un motif de signalement, l'extrait d'un message signalé, la liste nominative
 * de ses demandes d'amis : rien de cela n'est un agrégat. Les trois clés
 * descendent de {@link ADMIN_SOUVERAIN_PREFIXE}, le seul préfixe que
 * `persistableQuery` n'écrit pas dans `localStorage`.
 *
 * ## Ce qui n'est PAS décodé
 *
 * - `moderatorNotes` d'un signalement : la passerelle ne le sert pas ici, et ce
 *   type ne le déclare pas — il n'entrerait pas en silence le jour où elle le
 *   ferait.
 * - Les CLÉS DE JOINTURE d'un lien (`linkId`, `identifier` du lien, `token`) :
 *   elles ouvrent une porte. `shortUrl` suffit à désigner un lien de suivi, et
 *   l'`id` opaque un lien de partage.
 *
 * ## Un `content` nul n'est pas un message vide
 *
 * Pour qui n'a pas `canModerateContent`, la passerelle garde la LIGNE et met
 * `content` à `null` : un AUDIT constate qu'un message a été signalé, par qui,
 * pourquoi — sans le lire. `null` se dit donc « masqué », jamais « vide ».
 */
export type AdminReport = {
  readonly id: string;
  readonly reportedType: string;
  readonly reportedEntityId: string;
  readonly reportType: string;
  readonly reason: string;
  readonly status: string;
  readonly actionTaken: string | null;
  readonly createdAt: string | null;
  readonly resolvedAt: string | null;
};

export type AdminReportedMessage = {
  readonly id: string;
  readonly reportType: string;
  readonly reason: string;
  readonly status: string;
  readonly reporterId: string | null;
  readonly reporterName: string;
  readonly createdAt: string | null;
  readonly resolvedAt: string | null;
  readonly message: {
    readonly id: string;
    /** `null` = MASQUÉ par la passerelle (ou message sans texte), jamais « vide ». */
    readonly content: string | null;
    readonly conversationId: string | null;
    readonly messageType: string;
    readonly createdAt: string | null;
    readonly deletedAt: string | null;
  } | null;
};

export type AdminReportPage = {
  readonly reports: readonly AdminReport[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export type AdminReportedMessagePage = {
  readonly reports: readonly AdminReportedMessage[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export type AdminShareLink = {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** `null` = sans limite. */
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly isActive: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string | null;
  readonly conversationId: string | null;
  readonly conversationIdentifier: string | null;
};

export type AdminTrackingLink = {
  readonly id: string;
  readonly name: string;
  readonly campaign: string;
  readonly source: string;
  readonly medium: string;
  readonly originalUrl: string;
  readonly shortUrl: string;
  readonly totalClicks: number;
  readonly uniqueClicks: number;
  readonly isActive: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string | null;
  readonly lastClickedAt: string | null;
};

export type AdminAffiliateToken = {
  readonly id: string;
  readonly name: string;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly clickCount: number;
  readonly isActive: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string | null;
  readonly affiliations: number;
};

export type AdminFriendRequest = {
  readonly id: string;
  /** `sent` : le membre l'a envoyée ; `received` : il l'a reçue. */
  readonly direction: 'sent' | 'received';
  readonly status: string;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly other: {
    readonly id: string;
    readonly username: string;
    readonly displayName: string;
    readonly avatar: string | null;
  } | null;
};

export type AdminUserActivity = {
  readonly shareLinks: readonly AdminShareLink[];
  readonly trackingLinks: readonly AdminTrackingLink[];
  readonly affiliateTokens: readonly AdminAffiliateToken[];
  /** Envoyées puis reçues, chacune dans l'ordre servi (la plus récente d'abord). */
  readonly friendRequests: readonly AdminFriendRequest[];
};

export const ADMIN_ACTIVITY_PAGE_SIZE = 20;

export const adminUserReportsQueryKey = (userId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'reports', offset] as const;

export const adminUserReportedMessagesQueryKey = (userId: string, offset: number) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'reported-messages', offset] as const;

export const adminUserActivityQueryKey = (userId: string) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'activity'] as const;

const asTextOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

const asLimit = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

const lignesDe = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

function avecIdentifiant(raw: unknown): (Readonly<Record<string, unknown>> & { readonly id: string }) | null {
  const ligne = asRecord(raw);
  return ligne !== null && typeof ligne.id === 'string' && ligne.id !== '' ? (ligne as typeof ligne & { id: string }) : null;
}

const nonNul = <T>(valeur: T | null): valeur is T => valeur !== null;

function decodeReport(raw: unknown): AdminReport | null {
  const ligne = avecIdentifiant(raw);
  if (ligne === null) return null;
  return {
    id: ligne.id,
    reportedType: asText(ligne.reportedType),
    reportedEntityId: asText(ligne.reportedEntityId),
    reportType: asText(ligne.reportType),
    reason: asText(ligne.reason),
    status: asText(ligne.status),
    actionTaken: asTextOrNull(ligne.actionTaken),
    createdAt: asTextOrNull(ligne.createdAt),
    resolvedAt: asTextOrNull(ligne.resolvedAt),
  };
}

function decodeReportedMessage(raw: unknown): AdminReportedMessage | null {
  const ligne = avecIdentifiant(raw);
  if (ligne === null) return null;
  const message = avecIdentifiant(ligne.message);
  return {
    id: ligne.id,
    reportType: asText(ligne.reportType),
    reason: asText(ligne.reason),
    status: asText(ligne.status),
    reporterId: asTextOrNull(ligne.reporterId),
    reporterName: asText(ligne.reporterName),
    createdAt: asTextOrNull(ligne.createdAt),
    resolvedAt: asTextOrNull(ligne.resolvedAt),
    message:
      message === null
        ? null
        : {
            id: message.id,
            content: asTextOrNull(message.content),
            conversationId: asTextOrNull(message.conversationId),
            messageType: asText(message.messageType),
            createdAt: asTextOrNull(message.createdAt),
            deletedAt: asTextOrNull(message.deletedAt),
          },
  };
}

export function decodeAdminReportPage(page: PageServie, offset: number): AdminReportPage {
  const reports = page.lignes.map(decodeReport).filter(nonNul);
  return { reports, ...bornesDePage(reports, page.meta, offset) };
}

export function decodeAdminReportedMessagePage(page: PageServie, offset: number): AdminReportedMessagePage {
  const reports = page.lignes.map(decodeReportedMessage).filter(nonNul);
  return { reports, ...bornesDePage(reports, page.meta, offset) };
}

function decodeShareLink(raw: unknown): AdminShareLink | null {
  const ligne = avecIdentifiant(raw);
  if (ligne === null) return null;
  const conversation = asRecord(ligne.conversation);
  return {
    id: ligne.id,
    name: asText(ligne.name),
    description: asText(ligne.description),
    maxUses: asLimit(ligne.maxUses),
    currentUses: asCount(ligne.currentUses),
    isActive: ligne.isActive === true,
    expiresAt: asTextOrNull(ligne.expiresAt),
    createdAt: asTextOrNull(ligne.createdAt),
    conversationId: asTextOrNull(conversation?.id),
    conversationIdentifier: asTextOrNull(conversation?.identifier),
  };
}

function decodeTrackingLink(raw: unknown): AdminTrackingLink | null {
  const ligne = avecIdentifiant(raw);
  if (ligne === null) return null;
  return {
    id: ligne.id,
    name: asText(ligne.name),
    campaign: asText(ligne.campaign),
    source: asText(ligne.source),
    medium: asText(ligne.medium),
    originalUrl: asText(ligne.originalUrl),
    shortUrl: asText(ligne.shortUrl),
    totalClicks: asCount(ligne.totalClicks),
    uniqueClicks: asCount(ligne.uniqueClicks),
    isActive: ligne.isActive === true,
    expiresAt: asTextOrNull(ligne.expiresAt),
    createdAt: asTextOrNull(ligne.createdAt),
    lastClickedAt: asTextOrNull(ligne.lastClickedAt),
  };
}

function decodeAffiliateToken(raw: unknown): AdminAffiliateToken | null {
  const ligne = avecIdentifiant(raw);
  if (ligne === null) return null;
  return {
    id: ligne.id,
    name: asText(ligne.name),
    maxUses: asLimit(ligne.maxUses),
    currentUses: asCount(ligne.currentUses),
    clickCount: asCount(ligne.clickCount),
    isActive: ligne.isActive === true,
    expiresAt: asTextOrNull(ligne.expiresAt),
    createdAt: asTextOrNull(ligne.createdAt),
    affiliations: asCount(asRecord(ligne._count)?.affiliations),
  };
}

function decodeFriendRequest(raw: unknown, direction: AdminFriendRequest['direction']): AdminFriendRequest | null {
  const ligne = avecIdentifiant(raw);
  if (ligne === null) return null;
  // L'AUTRE personne : le destinataire d'une demande envoyée, l'expéditeur d'une reçue.
  const autre = avecIdentifiant(direction === 'sent' ? ligne.receiver : ligne.sender);
  const username = asText(autre?.username);
  return {
    id: ligne.id,
    direction,
    status: asText(ligne.status),
    createdAt: asTextOrNull(ligne.createdAt),
    updatedAt: asTextOrNull(ligne.updatedAt),
    other:
      autre === null
        ? null
        : { id: autre.id, username, displayName: asText(autre.displayName) || username, avatar: asTextOrNull(autre.avatar) },
  };
}

export function decodeAdminUserActivity(raw: unknown): AdminUserActivity {
  const charge = asRecord(raw) ?? {};
  const contacts = asRecord(charge.contacts) ?? {};
  return {
    shareLinks: lignesDe(charge.shareLinks).map(decodeShareLink).filter(nonNul),
    trackingLinks: lignesDe(charge.trackingLinks).map(decodeTrackingLink).filter(nonNul),
    affiliateTokens: lignesDe(charge.affiliateTokens).map(decodeAffiliateToken).filter(nonNul),
    friendRequests: [
      ...lignesDe(contacts.sent).map((r) => decodeFriendRequest(r, 'sent')),
      ...lignesDe(contacts.received).map((r) => decodeFriendRequest(r, 'received')),
    ].filter(nonNul),
  };
}

const cheminMembre = (userId: string) => `/api/v1/admin/users/${encodeURIComponent(userId)}`;

const pageDemandee = (offset: number) =>
  new URLSearchParams({ offset: String(offset), limit: String(ADMIN_ACTIVITY_PAGE_SIZE) }).toString();

export async function loadAdminUserReports(
  params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminReportPage>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${cheminMembre(params.userId)}/reports?${pageDemandee(params.offset)}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminReportPage(pageServie(result), params.offset) };
}

export async function loadAdminUserReportedMessages(
  params: AdminDeps & { readonly userId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminReportedMessagePage>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${cheminMembre(params.userId)}/reported-messages?${pageDemandee(params.offset)}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminReportedMessagePage(pageServie(result), params.offset) };
}

export async function loadAdminUserActivity(
  params: AdminDeps & { readonly userId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminUserActivity>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${cheminMembre(params.userId)}/activity`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: decodeAdminUserActivity(result.data) };
}
