import { hoistLocationOnto } from '../../services/location/sharedPlace';
import { hoistStickerOnto } from '../../services/stickers/messageSticker';
import { servedPerson } from '../../services/appearance/authorProfileDecor';
import { withServedCarrierMedia } from '../../services/posts/servedPostMedia';

/**
 * Hisse `metadata.location` et `metadata.sticker` (#9080) en top-level
 * `location` / `sticker` sur un commentaire — appliqué à la liste (GET), aux
 * réponses (GET replies), à la création (POST) et à l'édition (PATCH), donc
 * aussi aux payloads socket qui en partent. Mêmes sources UNIQUES que les
 * messages (`hoistLocationOnto`, `hoistStickerOnto`) et que l'aperçu embarqué
 * dans un post (`hoistLocationDeep`) — pas de copie locale de la logique.
 * Ses médias sortent sans le chemin disque de leurs pistes traduites (#19750).
 */
export function hoistCommentCarriers<T extends Record<string, unknown>>(comment: T): T {
  return withServedCarrierMedia(withServedCommentAuthor(hoistStickerOnto(hoistLocationOnto(comment))));
}

/** #10945 — l'auteur part avec son contour résolu (`profileDecor`), jamais avec la colonne brute. */
function withServedCommentAuthor<T extends Record<string, unknown>>(comment: T): T {
  const author = comment.author as { equippedAvatarRing?: string | null } | null | undefined;
  return author === null || author === undefined ? comment : { ...comment, author: servedPerson(author) };
}
