/**
 * CE QUI VOYAGE AVEC UN POST, ET QUE LE BLOCAGE RETIRE AUSSI (#16894).
 *
 * Les fils écartent l'AUTEUR d'un post quand un blocage le sépare du lecteur,
 * dans un sens ou dans l'autre (`buildPostVisibilityOrFilter`). Deux contenus
 * d'autres auteurs voyagent pourtant DANS le post servi, et le filtre de liste
 * ne les voit pas : la source d'une republication (`repostOf`) et l'aperçu des
 * commentaires (`comments`, trois au plus). Un post lisible qui republie un
 * auteur bloqué, ou qui porte son commentaire en aperçu, servait donc ce
 * contenu au lecteur.
 *
 * La règle se pose sur le LECTEUR (`WireReader.separatedUserIds`), lue une
 * fois par requête par `readerSeparatedFrom` (`separatedReader.ts`), et s'applique dans
 * `withMentions`, par où passe chaque post servi : la source d'un auteur séparé
 * part en `repostOf: null` — la forme qu'a déjà un original disparu, que les
 * trois clients rendent « ce contenu n'est plus disponible » — et ses
 * commentaires sortent de l'aperçu. Une diffusion (`WIRE_BROADCAST`) n'a pas de
 * lecteur et ne porte AUCUNE séparation : le web fusionne la charge reçue par
 * dessus sa carte, donc une diffusion peut réinjecter ce que le REST a retiré —
 * dette ouverte, #20204.
 */
import type { WireReader } from './storyEffectsV3';

type WithAuthor = { readonly author?: { readonly id?: unknown } | null };

const authorOf = (row: unknown): unknown =>
  row !== null && typeof row === 'object' ? (row as WithAuthor).author?.id : undefined;

const snapshotOf = (row: unknown): unknown =>
  row !== null && typeof row === 'object' ? (row as { snapshotAuthorId?: unknown }).snapshotAuthorId : undefined;

/** `repostOf.snapshotAuthorId` sert la décision, jamais le fil. */
function withoutSnapshotColumn<T>(post: T): T {
  const source = (post as { repostOf?: unknown }).repostOf;
  if (source === null || typeof source !== 'object' || !('snapshotAuthorId' in source)) return post;
  const { snapshotAuthorId: _decision, ...served } = source as Record<string, unknown>;
  return { ...post, repostOf: served };
}

/**
 * Une source est séparée quand son auteur l'est, ou quand elle est la COPIE
 * d'un contenu dont l'auteur d'origine l'est (`snapshotAuthorId`).
 */
export function withoutSeparatedCompanions<T>(input: T, separated: ReadonlySet<string> | undefined): T {
  const isSeparated = (value: unknown) => typeof value === 'string' && separated !== undefined && separated.has(value);
  const source = (input as { repostOf?: unknown }).repostOf;
  const dropsRepost = isSeparated(authorOf(source)) || isSeparated(snapshotOf(source));
  const post = withoutSnapshotColumn(input);
  const comments = (post as { comments?: unknown }).comments;
  const listed = Array.isArray(comments) ? comments : undefined;
  const kept = listed?.filter((comment) => !isSeparated(authorOf(comment)));
  const dropsComments = listed !== undefined && kept !== undefined && kept.length !== listed.length;
  if (!dropsRepost && !dropsComments) return post;
  return {
    ...post,
    ...(dropsRepost ? { repostOf: null } : {}),
    ...(dropsComments ? { comments: kept } : {}),
  };
}

/**
 * La copie d'un contenu éphémère (`snapshotAuthorId`) porte les médias et le
 * canvas de son auteur d'ORIGINE, et survit au détachement de la source : elle
 * se retire par la requête, comme l'auteur lui-même. Le champ manque aux
 * lignes écrites avant lui (Mongo) : `null`, absent, ou d'un auteur non séparé.
 */
export function snapshotAuthorNotSeparated(ids: readonly string[]) {
  return {
    OR: [{ snapshotAuthorId: null }, { snapshotAuthorId: { isSet: false } }, { snapshotAuthorId: { notIn: [...ids] } }],
  };
}

/** Les identifiants séparés du lecteur, pour les filtres de liste qui les lisent déjà. */
export function separatedIdsOf(reader: WireReader): string[] {
  return [...(reader.separatedUserIds ?? [])];
}
