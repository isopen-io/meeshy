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
 * lecteur : elle ne porte pas de séparation, et chaque client relit le post par
 * le REST, qui la porte.
 */
import type { WireReader } from './storyEffectsV3';

type WithAuthor = { readonly author?: { readonly id?: unknown } | null };

const authorOf = (row: unknown): unknown =>
  row !== null && typeof row === 'object' ? (row as WithAuthor).author?.id : undefined;

export function withoutSeparatedCompanions<T>(post: T, separated: ReadonlySet<string> | undefined): T {
  if (separated === undefined || separated.size === 0) return post;
  const row = post as { repostOf?: unknown; comments?: unknown };
  const isSeparated = (value: unknown) => typeof value === 'string' && separated.has(value);
  const dropsRepost = isSeparated(authorOf(row.repostOf));
  const comments = Array.isArray(row.comments) ? row.comments : undefined;
  const kept = comments?.filter((comment) => !isSeparated(authorOf(comment)));
  const dropsComments = comments !== undefined && kept !== undefined && kept.length !== comments.length;
  if (!dropsRepost && !dropsComments) return post;
  return {
    ...post,
    ...(dropsRepost ? { repostOf: null } : {}),
    ...(dropsComments ? { comments: kept } : {}),
  };
}

/** Les identifiants séparés du lecteur, pour les filtres de liste qui les lisent déjà. */
export function separatedIdsOf(reader: WireReader): string[] {
  return [...(reader.separatedUserIds ?? [])];
}
