import { type AdminDeps, asCount, asRecord, asText, pageServie, type PageServie } from './admin';
import type { ApiResult } from './http';

/**
 * **LES CONVERSATIONS D'UN MEMBRE** (#6819) —
 * `GET /api/v1/admin/users/:userId/conversations`, sous `canViewUsers`.
 *
 * **Métadonnées seules : aucun contenu de message.** La route sert le CADRE
 * d'une conversation — titre, type, effectif, dates — jamais ce qui s'y dit.
 * Ce décodeur n'invente donc aucun champ qui laisserait croire le contraire :
 * un écran d'administration qui afficherait un aperçu de message ici ouvrirait
 * une lecture que la passerelle n'accorde pas.
 *
 * ## Trois traits mesurés du contrat
 *
 * 1. **`memberCount` est RECALCULÉ** par la passerelle depuis `_count` — la
 *    colonne du même nom n'est écrite par personne (même règle que
 *    `GET /conversations`). On lit donc la valeur SERVIE, sans jamais
 *    retomber sur une colonne morte.
 * 2. **`membership` est la ligne du membre, lue À PART** par la passerelle
 *    (#7999) : l'aperçu `participants` est plafonné à SIX, et y chercher le
 *    membre rendait `null` dès qu'il était entré septième.
 * 3. **La pagination voyage à côté de `data`** (`sendPaginatedSuccess`), comme
 *    pour les médias, et à l'inverse de `GET /admin/users` qui sert la sienne
 *    DEDANS.
 */
export type AdminConversationParticipant = {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly role: string;
  readonly joinedAt: string | null;
  readonly isActive: boolean;
};

/**
 * Les réglages d'écriture et de traduction, tels que servis (#7999) — ce que la
 * feuille « Configurer » pré-remplit. Une valeur non servie se lit comme
 * « inconnue » (`null`) là où l'absence n'a pas de sens évident, et comme le
 * DÉFAUT du schéma là où elle en a un (un canal n'est pas d'annonces tant qu'il
 * ne le dit pas ; le mode lent vaut 0).
 */
export type AdminConversationSettings = {
  readonly defaultWriteRole: string | null;
  readonly isAnnouncementChannel: boolean;
  readonly slowModeSeconds: number;
  readonly autoTranslateEnabled: boolean | null;
  readonly encryptionMode: string | null;
};

export type AdminConversation = {
  readonly id: string;
  readonly identifier: string | null;
  /** `null` quand la conversation n'a pas de titre propre — un direct, par
   * exemple, qui porte le nom de l'autre et non un titre stocké (D-75). */
  readonly title: string | null;
  readonly description: string | null;
  readonly type: string;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly isActive: boolean;
  /** Fermée à l'écriture depuis cette date — `null` si ouverte. */
  readonly closedAt: string | null;
  readonly memberCount: number;
  /** `null` quand la conversation n'a pas de ligne de statistiques : un zéro
   * affirmerait une conversation muette. */
  readonly messageCount: number | null;
  readonly settings: AdminConversationSettings;
  readonly createdAt: string | null;
  readonly lastMessageAt: string | null;
  /** Six au plus, actifs, servis par la passerelle. */
  readonly participants: readonly AdminConversationParticipant[];
  /** La ligne du membre visé, lue à part par la passerelle — `null` s'il n'y est plus actif. */
  readonly membership: AdminConversationParticipant | null;
};

export type AdminConversationPage = {
  readonly conversations: readonly AdminConversation[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export const ADMIN_CONVERSATIONS_PAGE_SIZE = 20;

/** Les tris que la passerelle sert (#7845) — `joinedAt` n'en est pas : Prisma ne trie pas une conversation par une colonne de la participation. */
export const ADMIN_USER_CONVERSATION_SORTS = ['lastMessageAt', 'createdAt'] as const;
export type AdminUserConversationSort = (typeof ADMIN_USER_CONVERSATION_SORTS)[number];

/** La RACINE que la fiche invalide après une configuration — toutes pages, tous tris. */
export const adminUserConversationsRootKey = (userId: string) => ['admin', 'user', userId, 'conversations'] as const;

export const adminUserConversationsQueryKey = (
  userId: string,
  offset: number,
  type: string,
  sortBy: AdminUserConversationSort = 'lastMessageAt',
  sortOrder: 'asc' | 'desc' = 'desc',
) => [...adminUserConversationsRootKey(userId), offset, type, sortBy, sortOrder] as const;

const asTextOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

function decodeParticipant(raw: unknown): AdminConversationParticipant | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.userId !== 'string' || ligne.userId === '') return null;

  return {
    userId: ligne.userId,
    displayName: asText(ligne.displayName),
    avatar: asTextOrNull(ligne.avatar),
    /* Des rôles historiques sont stockés en CAPITALES (`CREATOR`, `ADMIN`) :
       la passerelle les rabat déjà (`memberRoleCasings`, `isMemberCreator`).
       Sans le même rabattement ici, la feuille de configuration offrirait de
       rétrograder un `CREATOR` que le serveur refuse ensuite. */
    role: asText(ligne.role).toLowerCase(),
    joinedAt: asTextOrNull(ligne.joinedAt),
    isActive: ligne.isActive !== false,
  };
}

function decodeSettings(raw: unknown): AdminConversationSettings {
  const reglages = asRecord(raw) ?? {};
  return {
    defaultWriteRole: asTextOrNull(reglages.defaultWriteRole),
    isAnnouncementChannel: reglages.isAnnouncementChannel === true,
    slowModeSeconds: asCount(reglages.slowModeSeconds),
    autoTranslateEnabled: typeof reglages.autoTranslateEnabled === 'boolean' ? reglages.autoTranslateEnabled : null,
    encryptionMode: asTextOrNull(reglages.encryptionMode),
  };
}

/**
 * UNE ligne — exportée parce que la configuration souveraine
 * (`admin-conversation-settings.ts`) rend la MÊME forme, sans participants : un
 * second décodeur divergerait sur la première valeur par défaut ajustée.
 */
export function decodeAdminConversation(raw: unknown): AdminConversation | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

  const participants = (Array.isArray(ligne.participants) ? ligne.participants : [])
    .map(decodeParticipant)
    .filter((p): p is AdminConversationParticipant => p !== null);

  return {
    id: ligne.id,
    identifier: asTextOrNull(ligne.identifier),
    title: asTextOrNull(ligne.title),
    description: asTextOrNull(ligne.description),
    type: asText(ligne.type),
    avatar: asTextOrNull(ligne.avatar),
    banner: asTextOrNull(ligne.banner),
    isActive: ligne.isActive !== false,
    closedAt: asTextOrNull(ligne.closedAt),
    memberCount: asCount(ligne.memberCount),
    messageCount:
      typeof ligne.messageCount === 'number' && Number.isFinite(ligne.messageCount) && ligne.messageCount >= 0
        ? ligne.messageCount
        : null,
    settings: decodeSettings(ligne.settings),
    createdAt: asTextOrNull(ligne.createdAt),
    lastMessageAt: asTextOrNull(ligne.lastMessageAt),
    participants,
    membership: decodeParticipant(ligne.membership),
  };
}

export function decodeAdminConversationPage(page: PageServie, offset: number): AdminConversationPage {
  const conversations = page.lignes
    .map(decodeAdminConversation)
    .filter((conversation): conversation is AdminConversation => conversation !== null);

  const total = asCount(page.meta.total);
  const hasMore = typeof page.meta.hasMore === 'boolean' ? page.meta.hasMore : offset + conversations.length < total;

  return { conversations, total: total || conversations.length, offset, hasMore };
}

export async function loadAdminUserConversations(
  params: AdminDeps & {
    readonly userId: string;
    readonly offset: number;
    readonly type?: string;
    readonly sortBy?: AdminUserConversationSort;
    readonly sortOrder?: 'asc' | 'desc';
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminConversationPage>> {
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(ADMIN_CONVERSATIONS_PAGE_SIZE),
    // Un filtre VIDE n'est pas un filtre : `where.type = ''` ne rendrait
    // aucune conversation, alors que l'appelant en voulait toutes.
    ...(params.type === undefined || params.type === '' ? {} : { type: params.type }),
    ...(params.sortBy === undefined ? {} : { sortBy: params.sortBy }),
    ...(params.sortOrder === undefined ? {} : { sortOrder: params.sortOrder }),
  });

  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/conversations?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminConversationPage(pageServie(result), params.offset) };
}
