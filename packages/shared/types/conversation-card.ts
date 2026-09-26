/**
 * Le contrat de la CARTE de conversation (#8099) — ce qu'un client affiche à la
 * place de l'aperçu de lien générique quand un message contient une URL Meeshy
 * de conversation.
 *
 * Deux portes, une seule forme :
 * - `GET /api/v1/links/:identifier/card` (auth optionnelle) — lien de PARTAGE
 *   ou d'invitation : la carte dit ce que le lien autorise déjà.
 * - `GET /api/v1/conversations/:id/card` (auth requise) — lien DIRECT : servi
 *   au seul MEMBRE ; un non-membre reçoit le même 404 qu'un id inexistant.
 *
 * Ce qui ne voyage JAMAIS : liste de participants, ids d'utilisateurs,
 * identifiant du créateur du lien, présence (`onlineCount` est toujours `null`).
 */

export type ConversationCardKind = 'share-link' | 'direct';

export const CONVERSATION_CARD_DESCRIPTION_MAX = 200;

export const CONVERSATION_CARD_INVITE_MESSAGE_MAX = 280;

/**
 * Le CRÉATEUR du lien de partage — ni son id, ni sa présence. `null` si le
 * créateur est supprimé, et toujours `null` sur une carte `direct`.
 */
export type ConversationCardInviter = {
  readonly displayName: string;
  readonly username: string | null;
  readonly avatarUrl: string | null;
};

export type ConversationCardStats = {
  readonly memberCount: number;
  /** Toujours `null` : la loi de visibilité de la présence ne s'ouvre pas ici. */
  readonly onlineCount: null;
  /** `null` sauf membre ou lien qui autorise l'historique (`allowViewHistory`). */
  readonly messageCount: number | null;
  readonly languages: readonly string[];
};

export type ConversationCardViewer = {
  readonly isMember: boolean;
  readonly canJoin: boolean;
  readonly requiresAccount: boolean;
  /** Lien actif, qui n'exige pas de compte, et viewer pas encore membre. */
  readonly canJoinAnonymously: boolean;
};

export type ConversationCardLink = {
  readonly identifier: string;
  readonly isActive: boolean;
  readonly expiresAt: string | null;
};

export type ConversationCard = {
  readonly kind: ConversationCardKind;
  /** `null` pour un non-membre sur lien de partage. */
  readonly conversationId: string | null;
  readonly title: string;
  /** ≤ 200 caractères, tronquée serveur ; `null` sur lien inactif. */
  readonly description: string | null;
  readonly avatarUrl: string | null;
  readonly bannerUrl: string | null;
  readonly conversationType: string;
  readonly stats: ConversationCardStats;
  readonly viewer: ConversationCardViewer;
  readonly link: ConversationCardLink | null;
  readonly inviter: ConversationCardInviter | null;
  /**
   * Le message propre au lien (`ConversationShareLink.description`), ≤ 280
   * caractères ; distinct de `description` (celle de la conversation). `null`
   * sur une carte `direct` ou un lien inactif.
   */
  readonly inviteMessage: string | null;
};
