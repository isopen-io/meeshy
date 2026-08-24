import { isValidMongoId } from '@meeshy/shared/utils/conversation-helpers';

/**
 * Garde « cet identifiant est-il un ObjectId Mongo bien formé, sinon jette » —
 * la loi, écrite une fois.
 *
 * Trois services de réaction voisins la portaient chacun VERBATIM :
 * `ReactionService.validateMessageId`, `PostReactionService.validatePostId` et
 * `CommentReactionService.validateCommentId` déclaraient tous
 * `private static readonly OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/` puis
 * `if (!id || !OBJECT_ID_REGEX.test(id)) throw new Error(\`Invalid <noun> ID
 * format: ${id.substring(0, 20)}\`)`. Seul le NOM du domaine (« message », « post »,
 * « comment ») changeait — le prédicat, la borne de troncature et le gabarit du
 * message étaient identiques, synchronisés à la main sur trois fichiers.
 *
 * Le prédicat lui-même a déjà une source unique : {@link isValidMongoId}
 * (`@meeshy/shared`), la MÊME regex ancrée, déjà consommée par
 * `routes/users/blocking.ts`. Cette garde relie le gabarit de rejet du gateway à
 * ce prédicat et paramètre le seul axe qui varie — le libellé du domaine.
 *
 * Comportement rigoureusement inchangé vis-à-vis des trois copies : `isValidMongoId`
 * EST `/^[0-9a-fA-F]{24}$/.test`, la garde `!id` court-circuite en amont, et le
 * message conserve son préfixe `Invalid <label> ID format: ` et sa troncature à
 * 20 caractères.
 */
export function assertValidObjectId(id: string, label: string): void {
  if (!id || !isValidMongoId(id)) {
    throw new Error(`Invalid ${label} ID format: ${id.substring(0, 20)}`);
  }
}
