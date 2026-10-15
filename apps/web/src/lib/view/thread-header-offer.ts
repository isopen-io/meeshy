import { canStartCall } from '@meeshy/shared/utils/call-permission';

/**
 * **CE QUE L'EN-TÊTE DU FIL OFFRE À SON LECTEUR** (#10205, #10207, #10114) —
 * deux lois pures, pour que l'en-tête ne décide rien lui-même.
 *
 * Le SOUS-TITRE dit l'effectif à un membre, jamais à un visiteur sans compte
 * (directive porteur du 2026-10-11) — décidé par le STATUT du lecteur, pas par
 * l'absence du champ : la passerelle cesse de le servir aux invités, mais un
 * ancien serveur le sert encore, et un champ absent ne se peint pas non plus.
 * Le CADENAS n'annonce que ce qui est vrai : une conversation chiffrée de bout
 * en bout (`e2ee`, ou `hybrid` qui en porte la couche). World Wide n'en est
 * pas une.
 *
 * L'APPEL suit `canStartCall` (`@meeshy/shared/utils/call-permission`), la loi
 * que la passerelle applique au démarrage — jamais une réimplémentation. Un
 * membre d'une conversation `public` qui ne peut pas lancer garde la porte
 * « Rejoindre » d'un appel déjà en cours ; une `global` n'a aucun appel.
 */

const END_TO_END_MODES: ReadonlySet<string> = new Set(['e2ee', 'hybrid']);

export type ThreadHeaderSubtitle = { readonly locked: boolean; readonly label: string | null };

export function threadHeaderSubtitle(params: {
  readonly group: boolean;
  readonly guest: boolean;
  readonly memberCount: number | null | undefined;
  readonly encryptionMode: string | null | undefined;
}): ThreadHeaderSubtitle {
  const locked = typeof params.encryptionMode === 'string' && END_TO_END_MODES.has(params.encryptionMode);
  if (!params.group) return { locked, label: locked ? 'Chiffré de bout en bout' : null };
  const count = params.memberCount;
  const readable = typeof count === 'number' && Number.isFinite(count) && count >= 0;
  return { locked, label: params.guest || !readable ? null : `${count} participants` };
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
