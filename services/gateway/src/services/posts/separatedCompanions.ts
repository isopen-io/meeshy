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
 * commentaires sortent de l'aperçu.
 *
 * **Une DIFFUSION n'a pas de lecteur** (`WIRE_BROADCAST`), et c'est par là que
 * la règle fuyait jusqu'à #20711 : le web fusionne la charge reçue par-dessus
 * sa carte, donc la diffusion réinjectait ce que le REST venait de retirer, sur
 * un déclencheur fait par un TIERS. Une diffusion ne reçoit donc plus UNE
 * charge : `SocialEmissionCore.companionSeparation` résout la séparation des
 * COMPAGNONS pour toute l'audience en deux lectures
 * ({@link companionSubjectsOf} → `pairsAround`), puis sert à chaque lecteur
 * séparé sa propre charge, par CETTE loi — jamais par une forme à part.
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
 * CE POST A-T-IL UN COMPAGNON QU'UN BLOCAGE POURRAIT RETIRER ? (#20204)
 *
 * Dérivé des MÊMES accesseurs que {@link withoutSeparatedCompanions}, et c'est
 * tout l'intérêt : un prédicat recopié à la main dériverait au premier
 * compagnon ajouté, et il dériverait du bon côté — en répondant « rien à
 * filtrer » sur une forme qui porte désormais un tiers.
 *
 * Il sert aux portes UNITAIRES, qui doivent LIRE les blocages pour servir leur
 * lecteur (`servedWireReader`) : quand la charge ne porte ni source republiée
 * ni commentaire, cette lecture ne décide de RIEN, et c'est le cas nominal
 * d'une porte de CRÉATION — un post qu'on vient d'écrire n'a pas de
 * commentaire, et `repostOf` n'existe que sur une republication.
 *
 * Ce n'est pas un raccourci de garde : le prédicat porte sur la charge SORTANTE,
 * jamais sur une autorisation. S'il répond `false`, il n'y a rien à taire —
 * pas « rien à vérifier ».
 */
/**
 * LES AUTEURS DES COMPAGNONS D'UN POST — les sujets dont la séparation décide
 * (#20711).
 *
 * Dérivé des MÊMES accesseurs que {@link withoutSeparatedCompanions} et
 * {@link hasSeparableCompanions}, pour la raison que le doc-comment du second
 * écrit déjà : un relevé recopié à la main dériverait au premier compagnon
 * ajouté, et il dériverait du bon côté — en rendant une liste INCOMPLÈTE, donc
 * une séparation qu'on ne lit pas, donc une fuite.
 *
 * Il rend des SUJETS, pas un verdict : c'est l'ensemble à passer à la loi de
 * séparation. Vide ⇒ il n'y a RIEN à taire, donc aucune lecture à payer — et
 * c'est le cas nominal d'une publication neuve (aucun commentaire, pas de
 * `repostOf`).
 *
 * `snapshotAuthorId` y entre à côté de l'auteur de la source : la COPIE d'un
 * contenu éphémère porte les médias de son auteur d'ORIGINE et lui survit.
 */
export function companionSubjectsOf(post: unknown): readonly string[] {
  const subjects = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.length > 0) subjects.add(value);
  };
  const source = (post as { repostOf?: unknown } | null)?.repostOf;
  add(authorOf(source));
  add(snapshotOf(source));
  const comments = (post as { comments?: unknown } | null)?.comments;
  if (Array.isArray(comments)) for (const comment of comments) add(authorOf(comment));
  return [...subjects];
}

export function hasSeparableCompanions(post: unknown): boolean {
  const source = (post as { repostOf?: unknown } | null)?.repostOf;
  if (authorOf(source) !== undefined || snapshotOf(source) !== undefined) return true;
  const comments = (post as { comments?: unknown } | null)?.comments;
  return Array.isArray(comments) && comments.some((comment) => authorOf(comment) !== undefined);
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
