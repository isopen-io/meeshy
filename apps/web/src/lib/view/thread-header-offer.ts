import { canStartCall } from '@meeshy/shared/utils/call-permission';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';

/**
 * **CE QUE L'EN-TÊTE DU FIL OFFRE À SON LECTEUR** (#10205, #10207, #10114) —
 * deux lois pures, pour que l'en-tête ne décide rien lui-même.
 *
 * Le SOUS-TITRE dit l'effectif à un membre, jamais à un visiteur sans compte
 * (directive porteur du 2026-10-11) — décidé par le STATUT du lecteur, pas par
 * l'absence du champ : la passerelle cesse de le servir aux invités, mais un
 * ancien serveur le sert encore, et un champ absent ne se peint pas non plus.
 * Le CADENAS n'annonce que ce qui est vrai : une conversation chiffrée de bout
 * en bout (`e2ee`). `server` et `hybrid` sont chiffrés AU REPOS (décision
 * porteur du 2026-10-24, #11374, #11381) : le serveur les lit, l'en-tête le
 * dit — « Chiffré sur le serveur », jamais « de bout en bout ». World Wide
 * n'est ni l'un ni l'autre.
 *
 * L'APPEL suit `canStartCall` (`@meeshy/shared/utils/call-permission`), la loi
 * que la passerelle applique au démarrage — jamais une réimplémentation. Un
 * membre d'une conversation `public` qui ne peut pas lancer garde la porte
 * « Rejoindre » d'un appel déjà en cours ; une `global` n'a aucun appel.
 */

export type ThreadEncryptionBadge = 'end-to-end' | 'server';

const ENCRYPTION_BADGES: Readonly<Record<string, ThreadEncryptionBadge>> = {
  e2ee: 'end-to-end',
  server: 'server',
  hybrid: 'server',
};

export const THREAD_ENCRYPTION_LABEL_KEY = {
  'end-to-end': 'thread.header.encryption.endToEnd',
  server: 'thread.header.encryption.server',
} as const satisfies Record<ThreadEncryptionBadge, InterfaceCatalogKey>;

export function threadEncryptionBadge(encryptionMode: string | null | undefined): ThreadEncryptionBadge | null {
  return typeof encryptionMode === 'string' ? ENCRYPTION_BADGES[encryptionMode.toLowerCase()] ?? null : null;
}

export type ThreadHeaderSubtitle = {
  readonly locked: boolean;
  readonly encryption: ThreadEncryptionBadge | null;
  readonly label: string | null;
};

export function threadHeaderSubtitle(params: {
  readonly group: boolean;
  readonly guest: boolean;
  readonly memberCount: number | null | undefined;
  readonly encryptionMode: string | null | undefined;
}): ThreadHeaderSubtitle {
  const encryption = threadEncryptionBadge(params.encryptionMode);
  const locked = encryption === 'end-to-end';
  if (!params.group) return { locked, encryption, label: null };
  const count = params.memberCount;
  const readable = typeof count === 'number' && Number.isFinite(count) && count >= 0;
  return { locked, encryption, label: params.guest || !readable ? null : `${count} participants` };
}

export type ThreadCallOffer = 'start' | 'join-only' | 'none';

const JOINABLE_TYPES: ReadonlySet<string> = new Set(['direct', 'group', 'public']);

export function threadCallOffer(params: {
  readonly conversation: { readonly type: string; readonly createdBy?: string | null; readonly currentUserRole?: string | null };
  readonly viewerUserId: string | null;
  readonly viewerPlatformRole: string | null;
  readonly viewerIsGuest: boolean;
}): ThreadCallOffer {
  const { conversation } = params;
  const mayStart = canStartCall({
    conversationType: conversation.type,
    viewerIsCreator: params.viewerUserId !== null && params.viewerUserId !== '' && conversation.createdBy === params.viewerUserId,
    viewerConversationRole: conversation.currentUserRole ?? null,
    viewerPlatformRole: params.viewerPlatformRole,
    viewerIsGuest: params.viewerIsGuest,
  });
  if (mayStart) return 'start';
  if (params.viewerIsGuest) return 'none';
  return JOINABLE_TYPES.has(conversation.type.toLowerCase()) ? 'join-only' : 'none';
}

/**
 * **CE QU'OUVRE L'AVATAR D'UNE CONVERSATION** (#10300, directive porteur du
 * 2026-10-12) — même geste, même effet, dans l'en-tête du fil comme dans la
 * liste : un direct mène au profil de son pair, toute autre conversation
 * (groupe, public, global, communauté) ouvre sa fiche. Un visiteur sans compte
 * n'ouvre ni l'un ni l'autre (#10205) : son avatar garde la bascule de
 * l'en-tête, rien de plus. Sans porte vers les détails (un hôte qui ne sait
 * pas les ouvrir, un pair sans compte), l'avatar garde aussi la bascule.
 */
export type ConversationAvatarDoor =
  | { readonly kind: 'profile'; readonly username: string }
  | { readonly kind: 'details' }
  | { readonly kind: 'toggle' };

export function conversationAvatarDoor(params: {
  readonly group: boolean;
  readonly guest: boolean;
  readonly peerUsername: string | null | undefined;
  readonly detailsAvailable: boolean;
}): ConversationAvatarDoor {
  if (params.guest) return { kind: 'toggle' };
  const username = params.peerUsername;
  if (!params.group && typeof username === 'string' && username !== '') return { kind: 'profile', username };
  return params.detailsAvailable ? { kind: 'details' } : { kind: 'toggle' };
}
