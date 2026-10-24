/**
 * QUI A MODIFIÉ CE MESSAGE, QUAND CE N'EST PAS SON AUTEUR (#11375).
 *
 * Décision porteur du 2026-10-24 : un modérateur de plateforme (MODERATOR,
 * ADMIN, BIGBOSS) qui modifie le message d'un autre le fait À VISAGE DÉCOUVERT.
 * La passerelle enregistre son `User.id` et son rôle global
 * (`Message.editedById` / `Message.editedByRole`), et tous les membres lisent
 * « modifié par un modérateur ». L'auteur qui réécrit son message remet les deux
 * colonnes à `null` : la mention dit qui a écrit la DERNIÈRE version.
 *
 * Aucun booléen « modifié par un tiers » : la présence de `editedById` le dit.
 * @see schema.prisma — model Message
 */

export type MessageEditAttribution = {
  /** `User.id` du tiers qui a modifié en dernier ; `null` quand c'est l'auteur. */
  readonly editedById: string | null;
  /** Son rôle GLOBAL au moment de la modification (`User.role`) ; `null` quand c'est l'auteur. */
  readonly editedByRole: string | null;
};

/** L'édition par l'auteur : aucune mention, les deux colonnes remises à `null`. */
export const AUTHOR_EDIT: MessageEditAttribution = Object.freeze({ editedById: null, editedByRole: null });

export type EditAttributionSubject = {
  readonly isEdited?: boolean | null;
  readonly editedById?: string | null;
};

/** La loi des clients : ce message dit-il « modifié par un modérateur » plutôt que « modifié » ? */
export const editedByThirdParty = (message: EditAttributionSubject): boolean =>
  message.isEdited === true && typeof message.editedById === 'string' && message.editedById !== '';
