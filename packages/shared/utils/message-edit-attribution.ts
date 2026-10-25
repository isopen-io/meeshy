/**
 * QUI A MODIFIÉ CE MESSAGE, QUAND CE N'EST PAS SON AUTEUR (#11375).
 *
 * Décision porteur du 2026-10-24 : un modérateur de plateforme (MODERATOR,
 * ADMIN, BIGBOSS) qui modifie le message d'un autre le fait À VISAGE DÉCOUVERT.
 * La passerelle ENREGISTRE son `User.id` et son rôle global
 * (`Message.thirdPartyEditorId` / `Message.thirdPartyEditorRole`), et tous les
 * membres lisent « modifié par un modérateur ». L'auteur qui réécrit son
 * message remet les deux colonnes à `null` : la mention dit qui a écrit la
 * DERNIÈRE version.
 *
 * DEUX formes, nommées différemment à dessein :
 * - les COLONNES (`thirdPartyEditorId` / `thirdPartyEditorRole`), ce que la
 *   base garde. Aucun schéma de réponse ne les déclare : une ligne brute
 *   servie telle quelle ne les transporte jamais (fail-closed).
 * - les champs SERVIS (`editedById` / `editedByRole`), ce que le fil porte,
 *   produits par la seule `servedEditAttribution`. L'IDENTITÉ du modérateur
 *   et son rang ne partent qu'à qui doit en rendre compte (ADMIN, BIGBOSS) et
 *   au modérateur lui-même ; tout autre lecteur, et toute diffusion de room,
 *   reçoit la marque `MASKED_MODERATOR_EDITOR` — la mention, sans le nom.
 *
 * Aucun booléen « modifié par un tiers » : la présence de l'éditeur le dit.
 * @see schema.prisma — model Message
 */

/** Ce que l'écriture enregistre. */
export type MessageEditorColumns = {
  /** `User.id` du tiers qui a modifié en dernier ; `null` quand c'est l'auteur. */
  readonly thirdPartyEditorId: string | null;
  /** Son rôle GLOBAL au moment de la modification (`User.role`) ; `null` quand c'est l'auteur. */
  readonly thirdPartyEditorRole: string | null;
};

/** Ce que le fil porte. */
export type MessageEditAttribution = {
  /** L'éditeur tiers SERVI à ce lecteur : son `User.id`, ou la marque sans identité ; `null` quand c'est l'auteur. */
  readonly editedById: string | null;
  /** Son rôle global, servi aux seuls lecteurs qui reçoivent l'identité ; `null` sinon. */
  readonly editedByRole: string | null;
};

/** L'édition par l'auteur : aucune mention, les deux colonnes remises à `null`. */
export const AUTHOR_EDIT: MessageEditorColumns = Object.freeze({ thirdPartyEditorId: null, thirdPartyEditorRole: null });

/** La mention « modifié par un modérateur », sans identité ni rang. Jamais un ObjectId. */
export const MASKED_MODERATOR_EDITOR = 'moderator';

/** Le lecteur à qui la charge est servie ; absent pour une diffusion de room. */
export type EditAttributionReader = {
  readonly userId?: string | null;
  readonly globalRole?: string | null;
};

const ACCOUNTABLE_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'BIGBOSS']);

const mayReadEditorIdentity = (editorId: string, reader: EditAttributionReader | undefined): boolean =>
  reader !== undefined &&
  ((typeof reader.globalRole === 'string' && ACCOUNTABLE_ROLES.has(reader.globalRole.toUpperCase())) ||
    reader.userId === editorId);

/** Ce que CE lecteur reçoit de l'auteur de la modification. `null` explicite, jamais une clé absente. */
export function servedEditAttribution(
  columns: Partial<MessageEditorColumns>,
  reader?: EditAttributionReader,
): MessageEditAttribution {
  const editorId = columns.thirdPartyEditorId;
  if (typeof editorId !== 'string' || editorId === '') return { editedById: null, editedByRole: null };
  if (!mayReadEditorIdentity(editorId, reader)) return { editedById: MASKED_MODERATOR_EDITOR, editedByRole: null };
  return { editedById: editorId, editedByRole: columns.thirdPartyEditorRole ?? null };
}

/** Une ligne brute prête à servir : les colonnes retirées, les champs servis posés pour ce lecteur. */
export function withServedEditAttribution<Row extends Partial<MessageEditorColumns>>(
  row: Row,
  reader?: EditAttributionReader,
): Omit<Row, keyof MessageEditorColumns> & MessageEditAttribution {
  const { thirdPartyEditorId, thirdPartyEditorRole, ...rest } = row;
  return { ...rest, ...servedEditAttribution({ thirdPartyEditorId, thirdPartyEditorRole }, reader) };
}

export type EditAttributionSubject = {
  readonly isEdited?: boolean | null;
  readonly editedById?: string | null;
};

/** La loi des clients : ce message dit-il « modifié par un modérateur » plutôt que « modifié » ? */
export const editedByThirdParty = (message: EditAttributionSubject): boolean =>
  message.isEdited === true && typeof message.editedById === 'string' && message.editedById !== '';
