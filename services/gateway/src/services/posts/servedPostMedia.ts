import { servedAttachmentTranslations } from '../attachments/servedAttachmentTranslations';

/**
 * Les médias d'une publication tels qu'ils ont le droit de SORTIR (#19750) :
 * `PostMedia.translations` a la forme de `MessageAttachment.translations` et
 * porte le même `path`, chemin disque ABSOLU (`/app/uploads/translated/…`) que
 * la base garde et qu'aucun client ne lit. Chaque piste perd ce `path` par
 * `servedAttachmentTranslations`, le site de #19672 ; le reste du média, la
 * légende et ses traductions comprises, traverse inchangé.
 *
 * Une publication porte des médias à trois étages — les siens, ceux de
 * l'original d'une republication (`repostOf`), ceux de ses commentaires en
 * aperçu (`comments`) ; un commentaire n'en a qu'un. Une valeur qui n'a pas la
 * forme attendue traverse telle quelle : la projection retire, elle ne devine
 * jamais.
 *
 * Les sorties : `withMentions` (toute réponse REST d'une publication et ses
 * diffusions composées), `SocialEventsHandler` (le socket, sans schéma de
 * réponse), `hoistCommentCarriers` (les commentaires) et la fiche de
 * modération (`GET /admin/posts/:postId`). Idempotente : deux
 * passages servent la même charge.
 */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const carriesTranslations = (row: unknown): boolean => isRecord(row) && 'translations' in row;

const servedMediaRow = (row: unknown): unknown =>
  isRecord(row) && carriesTranslations(row)
    ? { ...row, translations: servedAttachmentTranslations(row.translations) }
    : row;

/**
 * Le `T` rendu est celui reçu : seule une clé d'une valeur JSON (`Prisma.JsonValue`
 * côté Prisma, `unknown` côté type partagé) disparaît, ce qu'aucun type de ligne
 * ne déclare. Sans carte à servir, le porteur est rendu tel quel (même référence).
 */
export function withServedCarrierMedia<T>(carrier: T): T {
  if (!isRecord(carrier) || !Array.isArray(carrier.media) || !carrier.media.some(carriesTranslations)) return carrier;
  return { ...carrier, media: carrier.media.map(servedMediaRow) } as T;
}

export function withServedPostMedia<T>(post: T): T {
  const own = withServedCarrierMedia(post);
  if (!isRecord(own)) return own;
  const { repostOf, comments } = own;
  const servedRepost = withServedCarrierMedia(repostOf);
  const servedComments = Array.isArray(comments) ? comments.map(withServedCarrierMedia) : comments;
  const commentsChanged = Array.isArray(comments) && comments.some((comment, index) => comment !== (servedComments as unknown[])[index]);
  if (servedRepost === repostOf && !commentsChanged) return own;
  return {
    ...own,
    ...(servedRepost === repostOf ? {} : { repostOf: servedRepost }),
    ...(commentsChanged ? { comments: servedComments } : {}),
  } as T;
}
