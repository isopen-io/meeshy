import {
  isReactionAllowed,
  REACTION_LIMIT_REACHED_MESSAGE,
} from '@meeshy/shared/utils/reaction-limit';
import { ConflictError } from '../errors/custom-errors.js';

/**
 * Garde « cette personne peut-elle encore poser une réaction DIFFÉRENTE sur cet
 * objet, sinon jette » — la loi, écrite une fois.
 *
 * Cinq services de réaction voisins la portaient chacun VERBATIM :
 * `ReactionService` (message), `PostReactionService` (post / story / statut),
 * `CommentReactionService` (commentaire, chemin socket),
 * `AttachmentReactionService` (pièce jointe) et `PostCommentService.likeComment`
 * (commentaire, fallback REST) écrivaient tous, mot pour mot :
 *
 * ```ts
 * if (!isReactionAllowed(existingReactionCount)) {
 *   throw new ConflictError(REACTION_LIMIT_REACHED_MESSAGE, 'REACTION_LIMIT_REACHED');
 * }
 * ```
 *
 * Le prédicat pur ({@link isReactionAllowed}) et le message
 * ({@link REACTION_LIMIT_REACHED_MESSAGE}) ont déjà une source unique dans
 * `@meeshy/shared/utils/reaction-limit`. Ce qui restait dupliqué était le
 * COUPLAGE prédicat → jet : le choix de `ConflictError` (dont dépend le tri REST
 * 409/500, jamais une `Error` nue), le code `'REACTION_LIMIT_REACHED'`, et leur
 * ordre. `packages/shared` ne peut pas porter ce jet — `ConflictError` est un type
 * GATEWAY — d'où ce maillon gateway, exact miroir de {@link assertValidObjectId}
 * (`utils/object-id.ts`) : le prédicat vit en shared, le jet vit au gateway.
 *
 * Comportement rigoureusement inchangé vis-à-vis des cinq copies : même type
 * d'erreur, même code, même message, même prédicat. L'appelant reste responsable
 * de COMPTER (`existingReactionCount`) et de n'invoquer cette garde que pour une
 * création réellement nouvelle — un `upsert`/`findFirst` de confirmation (emoji
 * déjà posé) ne consomme aucune place et ne doit jamais l'atteindre.
 */
export function assertReactionAllowed(existingReactionCount: number): void {
  if (!isReactionAllowed(existingReactionCount)) {
    throw new ConflictError(REACTION_LIMIT_REACHED_MESSAGE, 'REACTION_LIMIT_REACHED');
  }
}
