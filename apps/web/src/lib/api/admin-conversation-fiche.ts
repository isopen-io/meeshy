import * as adminEndpoints from '@meeshy/shared/api/endpoints/admin';

import { type AdminDeps, asCount, asRecord, asText } from './admin';
import { adminPageOf, type AdminPage } from './admin-page';
import {
  decodeAdminInstanceParticipant,
  type AdminInstanceParticipant,
  type AdminParticipantKind,
} from './admin-conversations';
import { decodeAdminConversation, type AdminConversationSettings } from './admin-user-conversations';
import type { ApiResult } from './http';
import { ADMIN_SOUVERAIN_PREFIXE } from './souverain';

/**
 * **LA FICHE D'UNE CONVERSATION ET SES MEMBRES** (#8876) — les deux lectures que
 * `/admin/conversations/$conversation` ajoute à l'inventaire :
 *
 * | adresse | ce qu'elle sert | garde |
 * |---|---|---|
 * | `GET /admin/conversations/:id` | la FICHE : métadonnées, communauté, qui l'a fermée, six premiers membres, liens de partage, agent | `canManageConversations` + rang d'administration |
 * | `GET /admin/conversations/:id/participants` | TOUS les participants, par offset | `canViewUsers` |
 *
 * **Des métadonnées, jamais un contenu** : lire ce qui s'y dit reste le geste
 * souverain à part (`admin-conversations.ts`, motif écrit, trace). Rien de ce
 * module ne décode un message.
 *
 * ## Ce qui est décodé, champ par champ
 *
 * La fiche REPREND le décodeur des réglages de `admin-user-conversations.ts`
 * (défauts du schéma compris) plutôt que de le recopier : deux lectures des mêmes
 * cinq réglages divergeraient à la première valeur par défaut ajustée. Tout le
 * reste est écrit champ par champ — aucun spread d'une charge que le schéma de
 * réponse ne gouverne pas.
 *
 * ## Les membres sont NOMMÉS, jamais désignés par leur identifiant
 *
 * Un membre est un compte (`user`, dont le nom d'affichage courant prime sur la
 * copie gardée à l'arrivée), un invité anonyme (sans compte), ou un robot. La
 * PRÉSENCE n'est servie qu'aux rangs qui la voient (la passerelle rabat
 * `isOnline` à `false` pour les autres) : c'est le rang d'administration que
 * cette section exige déjà.
 *
 * ## Rien de ce qui est lu ici ne touche le disque
 *
 * Les clés descendent d'`ADMIN_SOUVERAIN_PREFIXE` : elles nomment qui parle à
 * qui, et `query-client.ts` ne déshydrate pas ce préfixe.
 */

export const adminConversationFicheKey = (conversationId: string) =>
  [ADMIN_SOUVERAIN_PREFIXE, 'conversation', conversationId] as const;

export const adminConversationMembersKey = (conversationId: string, offset: number, limit: number) =>
  [...adminConversationFicheKey(conversationId), 'members', offset, limit] as const;

/** Les pages de membres d'UNE conversation — ce qu'un geste sur un membre invalide. */
export const adminConversationMembersRootKey = (conversationId: string) =>
  [...adminConversationFicheKey(conversationId), 'members'] as const;

export const ADMIN_CONVERSATION_MEMBERS_PAGE_SIZES = [20, 50, 100] as const;

const asTextOrNull = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

// ---------------------------------------------------------------------------
// LA FICHE — GET /admin/conversations/:id
// ---------------------------------------------------------------------------

/** Une personne telle que la passerelle la NOMME (`A` : identifiant, pseudo, nom affiché, image). */
export type AdminConversationPerson = {
  readonly id: string;
  readonly username: string | null;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type AdminConversationCommunityRef = {
  readonly id: string;
  readonly name: string;
  /** L'identifiant PUBLIC de la communauté (son adresse lisible), jamais son ObjectId. */
  readonly identifier: string | null;
};

export type AdminConversationFiche = {
  readonly id: string;
  /** L'identifiant PUBLIC de la conversation (son adresse lisible). */
  readonly identifier: string | null;
  /** `null` sur un direct, qui porte le nom de l'autre et non un titre stocké (D-75). */
  readonly title: string | null;
  readonly description: string | null;
  readonly type: string;
  readonly avatar: string | null;
  readonly banner: string | null;
  readonly isActive: boolean;
  /** Fermée à l'écriture depuis cette date — `null` si ouverte. */
  readonly closedAt: string | null;
  readonly closedBy: AdminConversationPerson | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
  readonly lastMessageAt: string | null;
  /** Les participants ACTIFS, recalculés par la passerelle — jamais la colonne morte. */
  readonly memberCount: number;
  /** `null` quand la conversation n'a pas de ligne de statistiques : un zéro affirmerait un fil vide. */
  readonly messageCount: number | null;
  readonly settings: AdminConversationSettings;
  readonly community: AdminConversationCommunityRef | null;
  /** Six au plus, actifs, du plus ancien au plus récent. */
  readonly participantsPreview: readonly AdminInstanceParticipant[];
  readonly shareLinkCount: number;
  readonly agentEnabled: boolean;
};

function decodePerson(raw: unknown): AdminConversationPerson | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;
  return {
    id: ligne.id,
    username: asTextOrNull(ligne.username),
    displayName: asTextOrNull(ligne.displayName),
    avatar: asTextOrNull(ligne.avatar),
  };
}

function decodeCommunityRef(raw: unknown): AdminConversationCommunityRef | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;
  return { id: ligne.id, name: asText(ligne.name), identifier: asTextOrNull(ligne.identifier) };
}

export function decodeAdminConversationFiche(raw: unknown): AdminConversationFiche | null {
  const base = decodeAdminConversation(raw);
  const ligne = asRecord(raw);
  if (base === null || ligne === null) return null;

  return {
    id: base.id,
    identifier: base.identifier,
    title: base.title,
    description: base.description,
    type: base.type,
    avatar: base.avatar,
    banner: base.banner,
    isActive: base.isActive,
    closedAt: base.closedAt,
    closedBy: decodePerson(ligne.closedBy),
    createdAt: base.createdAt,
    updatedAt: asTextOrNull(ligne.updatedAt),
    lastMessageAt: base.lastMessageAt,
    memberCount: base.memberCount,
    messageCount: base.messageCount,
    settings: base.settings,
    community: decodeCommunityRef(ligne.community),
    participantsPreview: (Array.isArray(ligne.participantsPreview) ? ligne.participantsPreview : [])
      .map(decodeAdminInstanceParticipant)
      .filter((participant): participant is AdminInstanceParticipant => participant !== null),
    shareLinkCount: asCount(ligne.shareLinkCount),
    agentEnabled: ligne.agentEnabled === true,
  };
}

export async function loadAdminConversationFiche(
  params: AdminDeps & { readonly conversationId: string; readonly signal?: AbortSignal },
): Promise<ApiResult<AdminConversationFiche>> {
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: adminEndpoints.conversationsByConversationId(params.conversationId),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;

  const fiche = decodeAdminConversationFiche(result.data);
  return fiche === null ? { ok: false, status: 0, error: 'Conversation illisible' } : { ok: true, data: fiche };
}

// ---------------------------------------------------------------------------
// LES MEMBRES — GET /admin/conversations/:id/participants
// ---------------------------------------------------------------------------

export type AdminConversationMember = {
  /** L'identifiant de la LIGNE de participation — la clé de la rangée, jamais un libellé. */
  readonly id: string;
  /** `null` pour un invité anonyme ou un robot : pas de compte, donc aucun geste de membre possible. */
  readonly userId: string | null;
  readonly kind: AdminParticipantKind;
  readonly displayName: string | null;
  readonly username: string | null;
  readonly avatar: string | null;
  /** Rabattu en minuscules : des rôles historiques sont stockés en capitales (`CREATOR`). */
  readonly role: string;
  /** `false` : le membre a quitté la conversation (ou en a été retiré). */
  readonly isActive: boolean;
  readonly isOnline: boolean;
  readonly joinedAt: string | null;
};

const KINDS: readonly AdminParticipantKind[] = ['user', 'anonymous', 'bot'];

export function decodeAdminConversationMember(raw: unknown): AdminConversationMember | null {
  const ligne = asRecord(raw);
  if (ligne === null || typeof ligne.id !== 'string' || ligne.id === '') return null;

  const user = asRecord(ligne.user) ?? {};
  return {
    id: ligne.id,
    userId: asTextOrNull(ligne.userId),
    kind: KINDS.find((kind) => kind === ligne.type) ?? 'user',
    displayName: asTextOrNull(user.displayName) ?? asTextOrNull(ligne.displayName),
    username: asTextOrNull(user.username),
    avatar: asTextOrNull(user.avatar) ?? asTextOrNull(ligne.avatar),
    role: asText(ligne.role).toLowerCase(),
    isActive: ligne.isActive !== false,
    isOnline: ligne.isOnline === true,
    joinedAt: asTextOrNull(ligne.joinedAt),
  };
}

export async function loadAdminConversationMembers(
  params: AdminDeps & {
    readonly conversationId: string;
    readonly offset: number;
    readonly limit: number;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<AdminPage<AdminConversationMember>>> {
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(params.limit) });

  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${adminEndpoints.conversationsByConversationIdParticipants(params.conversationId)}?${query.toString()}`,
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });

  return adminPageOf(result, decodeAdminConversationMember, { kind: 'top' });
}
