/**
 * L'unique énoncé de « ce qu'une édition a le droit d'ÉCRIRE ».
 *
 * Jumeau de `messageEditAdmission`, qui dit QUI peut éditer et jusqu'à quand.
 * Celui-ci dit ce que l'édition peut mettre à la place — et la règle est
 * courte : un message ne peut pas devenir vide, à moins qu'une pièce jointe ne
 * le porte à elle seule (retrait de légende).
 *
 * Elle a vécu recopiée à TROIS endroits sur QUATRE transports d'édition, et le
 * quatrième — `PATCH /messages/:messageId` — ne la portait pas du tout :
 *
 * | entrée                                  | garde de vacuité | vide + pièce jointe |
 * |-----------------------------------------|------------------|---------------------|
 * | socket `message:edit` (PRIMAIRE)        | oui              | admis               |
 * | `PUT /conversations/:id/messages/:mid`  | oui              | admis               |
 * | `PUT /messages/:messageId` (iOS)        | oui              | admis               |
 * | `PATCH /messages/:messageId` (ANDROID)  | **aucune**       | **refusé**          |
 *
 * Le PATCH se reposait sur le `minLength: 1` de son schéma JSON, qui se trompe
 * dans les deux sens à la fois :
 *
 * - trois espaces le satisfont, et le `.trim()` de la ligne suivante les réduit
 *   à la chaîne vide — le message partait en base VIDÉ, et un `message:edited`
 *   vide s'en allait vers tous les clients de la conversation. Le texte
 *   d'origine, lui, était déjà écrasé ;
 * - il refuse en même temps la chaîne vide LÉGITIME, celle qui retire la
 *   légende d'un message à pièce jointe — que les trois autres transports
 *   acceptent.
 *
 * Une garde qui compte les caractères BRUTS ne décide donc jamais de ce qu'elle
 * croit décider : c'est le contenu APRÈS `trim` qui part en base, et c'est donc
 * lui, et lui seul, que la règle doit regarder.
 *
 * L'unité rend le contenu à écrire en même temps que le verdict. C'est
 * délibéré : le `.trim()` recopié chez chaque appelant est exactement l'endroit
 * où le transport iOS a déjà jeté un `TypeError` sur un `content` absent. Un
 * appelant qui obtient son texte de l'unité ne peut plus diverger d'elle.
 */

export type EditedContentRefusal = 'empty-without-attachments';

export type EditedContentAdmission =
  | { readonly admitted: true; readonly content: string }
  | { readonly admitted: false; readonly reason: EditedContentRefusal };

export type EditedContentRefused = Extract<EditedContentAdmission, { admitted: false }>;

/**
 * Le motif rendu aux quatre transports. Une seule formulation : les trois
 * copies en portaient deux, à un mot près, pour la même règle.
 */
export const EMPTY_EDIT_REFUSAL_MESSAGE =
  'Message content cannot be empty (unless attachments are included)';

/**
 * Le gateway compile en `strict: false`, où TypeScript ne rétrécit PAS une
 * union sur un discriminant littéral booléen. Ce prédicat rend le
 * rétrécissement explicite — même raison, même forme que `isEditRefused`.
 */
export const isEditedContentRefused = (
  admission: EditedContentAdmission
): admission is EditedContentRefused => !admission.admitted;

export type EditedContentParams = {
  /**
   * Le contenu revendiqué par l'édition. Optionnel : `UpdateMessageBodySchema`
   * (transport iOS) le laisse absent, et l'unité doit encaisser l'absence
   * plutôt que de la laisser jeter chez l'appelant.
   */
  readonly content?: string | null;
  /** Le message porte-t-il au moins une pièce jointe ? */
  readonly hasAttachments: boolean;
};

export function admitEditedContent(params: EditedContentParams): EditedContentAdmission {
  const content = params.content?.trim() ?? '';

  if (content.length === 0 && !params.hasAttachments) {
    return { admitted: false, reason: 'empty-without-attachments' };
  }

  return { admitted: true, content };
}
