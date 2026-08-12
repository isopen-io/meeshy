/**
 * Les types de post ÉPHÉMÈRES et leur durée de vie — source unique.
 *
 * Deux chemins en dépendent, et chacun portait sa propre copie de la liste :
 * la CRÉATION (`PostService`, qui pose `expiresAt`) et le BALAYAGE
 * (`ExpiredStoriesCleanupService`, qui détruit ce que l'échéance a périmé).
 * Le second ne connaissait que `STORY`. Les `STATUS` recevaient bien leur
 * échéance à la création, disparaissaient bien des lectures au bout d'une
 * heure (`getStatuses`/`getDiscoverStatuses` filtrent `expiresAt > now`), et
 * leurs lignes vivaient pour TOUJOURS — avec les médias, les usages de sons et
 * les notifications que le balayage aurait dû emporter.
 *
 * Ce n'est donc pas une constante d'agrément : c'est la forme même du défaut.
 * Une liste dupliquée entre celui qui POSE l'échéance et celui qui l'HONORE ne
 * peut que diverger, et elle avait divergé. La liste se DÉRIVE désormais de la
 * table des durées : un type éphémère ajouté ici reçoit son échéance ET son
 * balayage, sans qu'aucune des deux listes puisse oublier l'autre.
 *
 * Les valeurs sont celles qui étaient en vigueur — 21 h pour une story, 1 h
 * pour un statut — et le schéma les documente au même endroit
 * (`Post.expiresAt` : « null = permanent (POST), auto-set: STORY = now+21h,
 * STATUS = now+1h »).
 */
export const EPHEMERAL_POST_TTL_HOURS = {
  STORY: 21,
  STATUS: 1,
} as const;

export type EphemeralPostType = keyof typeof EPHEMERAL_POST_TTL_HOURS;

/**
 * Combien de temps un contenu éphémère PÉRIMÉ reste lisible par son AUTEUR.
 *
 * `getStories` renvoie à un auteur ses propres stories expirées pendant cette
 * fenêtre, pour que « Mes stories » puisse les archiver (la vignette voilée) —
 * sans quoi un pull-to-refresh écraserait le cache du client avec une réponse
 * serveur qui les a oubliées. Au-delà, une story n'est plus un contenu qu'on
 * republie ou dont on relit les vues, et la réponse doit rester bornée.
 *
 * Elle vit ici, et non plus seulement sur `PostFeedService`, parce qu'elle
 * borne DEUX choses qui doivent s'accorder : jusqu'où l'archive lit, et à
 * partir de quand le balayage a le droit de masquer. La requête d'archive est
 * gardée par `deletedAt: NOT_DELETED` ; un soft-delete posé à l'échéance la
 * viderait donc en une heure. Le balayage attend la fin de cette fenêtre —
 * il est le lecteur suivant, pas le concurrent.
 */
export const EPHEMERAL_AUTHOR_ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dérivée, jamais réécrite à la main : c'est ce qui interdit à un type
 * éphémère d'exister sans balayage.
 */
export const EPHEMERAL_POST_TYPES = Object.keys(
  EPHEMERAL_POST_TTL_HOURS,
) as readonly EphemeralPostType[];

function isEphemeral(type: string): type is EphemeralPostType {
  return Object.prototype.hasOwnProperty.call(EPHEMERAL_POST_TTL_HOURS, type);
}

/**
 * L'échéance d'un post à sa création — `undefined` pour un type permanent,
 * ce que `post.create` traduit par un champ ABSENT (et non `null`).
 *
 * `from` est passé par l'appelant plutôt que lu ici : le chemin de création
 * horodate déjà toute son écriture depuis un `now` unique, et deux lectures
 * d'horloge dans la même transaction produiraient deux instants différents.
 */
export function ephemeralExpiresAt(type: string, from: Date): Date | undefined {
  if (!isEphemeral(type)) return undefined;
  return new Date(from.getTime() + EPHEMERAL_POST_TTL_HOURS[type] * 3600_000);
}
