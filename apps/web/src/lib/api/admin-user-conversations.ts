import { type AdminDeps, asCount, asRecord, asText, pageServie, type PageServie } from './admin';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

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
 * 2. **`membership` est la ligne du membre visé, lue À PART** (#7845) — une
 *    requête dédiée par page, et non plus une extraction parmi les six
 *    participants servis : un membre entré septième a désormais la sienne.
 *    Elle reste typée `| null` pour une passerelle d'avant ce lot, ou un membre
 *    sorti entre deux lectures.
 * 3. **La pagination voyage à côté de `data`** (`sendPaginatedSuccess`), comme
 *    pour les médias, et à l'inverse de `GET /admin/users` qui sert la sienne
 *    DEDANS.
 *
 * ## Le tri est une LISTE BLANCHE, en miroir de la passerelle
 *
 * {@link ADMIN_CONVERSATION_SORTS}, {@link ADMIN_SORT_ORDERS} et
 * {@link ADMIN_MEMBER_ROLES} recopient `TRIS_MEMBRE`, `ORDRES` et
 * `ROLES_DE_MEMBRE` (`routes/admin/user-conversations.ts`), qui rend 400 sur
 * toute autre valeur. Aucun tri par effectif ni par nombre de messages : la
 * colonne `memberCount` est morte et la ligne de statistiques facultative —
 * trier dessus trierait des zéros (même raison que `conversations-sovereign.ts`).
 */
export type AdminConversationParticipant = {
  readonly userId: string;
  readonly displayName: string;
  readonly avatar: string | null;
  readonly role: string;
  readonly joinedAt: string | null;
  readonly isActive: boolean;
  /** Le surnom que le membre porte DANS cette conversation, s'il en a un. */
  readonly nickname: string | null;
};

/**
 * Les réglages d'écriture et de traduction, tels que servis. Une valeur non
 * servie se lit comme « inconnue » (`null`) là où l'absence n'a pas de sens
 * évident, et comme le DÉFAUT du schéma là où elle en a un (un canal n'est pas
 * d'annonces tant qu'il ne le dit pas ; le mode lent vaut 0).
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
  readonly communityId: string | null;
  readonly memberCount: number;
  /** `null` quand la conversation n'a pas de ligne de statistiques : un zéro
   * affirmerait une conversation muette. */
  readonly messageCount: number | null;
  readonly settings: AdminConversationSettings;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly lastMessageAt: string | null;
  /** Six au plus, actifs, servis par la passerelle. */
  readonly participants: readonly AdminConversationParticipant[];
  /** La ligne du membre visé, lue à part par la passerelle. */
  readonly membership: AdminConversationParticipant | null;
};

export type AdminConversationPage = {
  readonly conversations: readonly AdminConversation[];
  readonly total: number;
  readonly offset: number;
  readonly hasMore: boolean;
};

export const ADMIN_CONVERSATIONS_PAGE_SIZE = 20;

export const ADMIN_CONVERSATION_SORTS = ['lastMessageAt', 'createdAt', 'title', 'joinedAt'] as const;
export const ADMIN_SORT_ORDERS = ['asc', 'desc'] as const;
export const ADMIN_MEMBER_ROLES = ['creator', 'admin', 'moderator', 'member'] as const;

export type AdminConversationSort = (typeof ADMIN_CONVERSATION_SORTS)[number];
export type AdminSortOrder = (typeof ADMIN_SORT_ORDERS)[number];
export type AdminMemberRole = (typeof ADMIN_MEMBER_ROLES)[number];

/** Le tri et les filtres d'une page. `search` et `role` VIDES ne filtrent rien. */
export type AdminConversationCriteria = {
  readonly sort: AdminConversationSort;
  readonly order: AdminSortOrder;
  readonly search: string;
  readonly role: AdminMemberRole | '';
};

/** Le défaut de la passerelle, écrit une fois : dernière activité, récente d'abord. */
export const ADMIN_CONVERSATION_DEFAULT_CRITERIA: AdminConversationCriteria = {
  sort: 'lastMessageAt',
  order: 'desc',
  search: '',
  role: '',
};

/**
 * La RACINE que l'écran invalide après une configuration — toutes pages, tous tris.
 *
 * Sous le préfixe `admin-souverain` (#7845) : une page porte la description,
 * la bannière et le chiffrement de conversations PRIVÉES, et le surnom des
 * AUTRES membres. Rien de cela n'a à survivre sur le disque de
 * l'administrateur ; la liste se relit du réseau à chaque ouverture de
 * l'onglet de toute façon.
 */
export const adminUserConversationsRootKey = (userId: string) => [ADMIN_SOUVERAIN_PREFIXE, 'user', userId, 'conversations'] as const;

export const adminUserConversationsQueryKey = (
  userId: string,
  offset: number,
  type: string,
  criteres: AdminConversationCriteria = ADMIN_CONVERSATION_DEFAULT_CRITERIA,
) =>
  [
    ...adminUserConversationsRootKey(userId),
    offset,
    type,
    criteres.sort,
    criteres.order,
    criteres.search.trim(),
    criteres.role,
  ] as const;

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
    nickname: asTextOrNull(ligne.nickname),
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
    communityId: asTextOrNull(ligne.communityId),
    memberCount: asCount(ligne.memberCount),
    messageCount:
      typeof ligne.messageCount === 'number' && Number.isFinite(ligne.messageCount) && ligne.messageCount >= 0
        ? ligne.messageCount
        : null,
    settings: decodeSettings(ligne.settings),
    createdAt: asTextOrNull(ligne.createdAt),
    updatedAt: asTextOrNull(ligne.updatedAt),
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
    readonly sort?: AdminConversationSort;
    readonly order?: AdminSortOrder;
    readonly search?: string;
    readonly role?: AdminMemberRole | '';
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminConversationPage>> {
  const recherche = params.search?.trim() ?? '';
  const query = new URLSearchParams({
    offset: String(params.offset),
    limit: String(ADMIN_CONVERSATIONS_PAGE_SIZE),
    // Un filtre VIDE n'est pas un filtre : `where.type = ''` ne rendrait
    // aucune conversation, alors que l'appelant en voulait toutes. Même règle
    // pour la recherche et le rôle ; le tri absent laisse le défaut SERVEUR.
    ...(params.type === undefined || params.type === '' ? {} : { type: params.type }),
    ...(params.sort === undefined ? {} : { sort: params.sort }),
    ...(params.order === undefined ? {} : { order: params.order }),
    ...(recherche === '' ? {} : { search: recherche }),
    ...(params.role === undefined || params.role === '' ? {} : { role: params.role }),
  });

  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `/api/v1/admin/users/${encodeURIComponent(params.userId)}/conversations?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  return { ok: true, data: decodeAdminConversationPage(pageServie(result), params.offset) };
}
