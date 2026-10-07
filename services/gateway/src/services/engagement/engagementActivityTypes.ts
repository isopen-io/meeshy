/**
 * Les ENTRÉES d'un crédit d'engagement — ce qu'un geste et une visite de lien disent au service. Extraites
 * d'`EngagementService.ts` (budget de taille, #9635) ; le service les ré-exporte, aucun appelant ne change.
 */

/**
 * Ce que le GESTE sait de plus que l'axe : qui l'a déclenché quand ce n'est
 * pas le crédité lui-même (`social.invite_joined` crédite l'inviteur pour
 * l'inscription d'un AUTRE).
 */
export type EngagementActivityOptions = {
  readonly actorId?: string;
  /**
   * La conversation où le geste a eu lieu (#8906). Présente ⇒ le plafond
   * journalier par conversation s'applique AVANT tout crédit, puis l'état
   * « N (M) 🔥 » de cette conversation avance et s'annonce au crédité.
   */
  readonly conversationId?: string;
  /**
   * Le POST où le geste a eu lieu (#9569). Présent ⇒ les points crédités
   * s'ajoutent à ce que ce post a rapporté au crédité, qui en est prévenu.
   */
  readonly postId?: string;
  /**
   * La CIBLE du geste (post, appel, communauté, personne) — elle porte les
   * plafonds par cible et l'unicité d'un contenu lourd.
   */
  readonly targetId?: string;
  /**
   * L'auteur de la cible. Égal au crédité ⇒ rien n'est crédité : réagir à son
   * propre post, écouter son propre vocal ne rapporte rien.
   */
  readonly targetOwnerId?: string | null;
  /** La variante de points (visibilité d'une publication, position en direct ou statique). */
  readonly variant?: string;
  /** Le contenu qui produit ce crédit (#9584) — une source ne crédite un post qu'une fois, et la retirer le reprend. */
  readonly receipt?: string;
};

/** Ce qu'une visite de lien fait savoir au crédit. */
export type EngagementLinkVisit = {
  /** Le créateur du lien — le crédité. */
  readonly creatorId: string;
  /** Le lien, préfixé par sa sorte (`tracked:…`, `affiliate:…`, `conversation:…`). */
  readonly linkKey: string;
  /** Le visiteur : son compte s'il est connecté, sinon une empreinte stable. */
  readonly visitorKey: string;
  /** Le compte du visiteur quand il est connecté — le créateur ne se crédite pas lui-même. */
  readonly visitorUserId?: string | null;
};
