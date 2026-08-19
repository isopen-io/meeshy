import { REFERENCE_VIEW_WINDOW_MS } from './referenceAccess';

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
  // 20 h de visibilité publique (2026-08-12, était 21 h). Miroirs iOS :
  // `StoryItem.defaultExpiryInterval`, `StoryModels.swift:toStoryGroups`,
  // `StoryViewModel.pinDeadline`.
  STORY: 20,
  STATUS: 1,
} as const;

export type EphemeralPostType = keyof typeof EPHEMERAL_POST_TTL_HOURS;

/**
 * Combien de temps un contenu éphémère PÉRIMÉ reste lisible par son AUTEUR
 * dans la requête du TRAY (`getStories`). Depuis 2026-08-12, ce n'est plus la
 * borne de l'archive : les stories ne sont JAMAIS détruites (cf.
 * `SWEPT_POST_TYPES`), l'auteur les retrouve toutes dans « Mes stories »
 * (carrousel personnel), les republie (`POST /posts/:id/republish`, date
 * fraîche) ou les recharge dans le composer. Cette fenêtre ne borne plus que
 * la présence des stories expirées de l'auteur DANS LA PAGE DU TRAY — un
 * historique illimité y noierait les amis hors de la première page de 50.
 */
export const EPHEMERAL_AUTHOR_ARCHIVE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Dérivée, jamais réécrite à la main : tout type de la table des durées
 * reçoit son échéance (`expiresAt`) à la création.
 */
export const EPHEMERAL_POST_TYPES = Object.keys(
  EPHEMERAL_POST_TTL_HOURS,
) as readonly EphemeralPostType[];

/**
 * Types éphémères que le balayeur a le droit de DÉTRUIRE, distincts de ceux
 * qui reçoivent une échéance. Les STORIES n'y figurent plus (2026-08-12) :
 * l'échéance ne fait que les MASQUER du public (filtres `expiresAt > now`),
 * l'auteur garde son archive pour toujours — republication, relecture des
 * vues, rechargement dans le composer. Détruire une story détruisait tout ça.
 * Les STATUS (1 h de vie, aucune surface d'archive) restent balayés.
 *
 * Liste SÉPARÉE et explicite — la dériver de `EPHEMERAL_POST_TTL_HOURS`
 * réintroduirait mécaniquement STORY dans le balayage au premier refactor.
 *
 * Coût assumé : les stories s'accumulent (storyViews/réactions embarquées,
 * PostMedia). C'est le choix produit « ne plus jamais supprimer » ; une
 * politique de rétention froide (troncature de storyViews très anciennes)
 * reste possible SANS toucher aux lignes Post.
 */
export const SWEPT_POST_TYPES = ['STATUS'] as const satisfies readonly EphemeralPostType[];

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

/**
 * Combien de temps un contenu éphémère RÉFÉRENCÉ survit à son échéance quand
 * personne n'ouvre jamais sa notification.
 *
 * Sans ce plafond, une seule référence suffirait à garder un statut en vie
 * pour toujours : le filtre n'épargne que les droits INTACTS, et un droit que
 * personne n'exerce reste intact indéfiniment.
 *
 * Aligné sur `EPHEMERAL_AUTHOR_ARCHIVE_MS` — même ordre de grandeur, même
 * intuition : au-delà d'une semaine, plus personne ne revient.
 */
export const REFERENCE_SWEEP_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Ce qu'un balayeur a le droit de détruire.
 *
 * Un statut RÉFÉRENCÉ porte une promesse — « vous le verrez au moins une
 * fois » — que sa destruction rendrait fausse dès la deuxième heure. Il est
 * donc épargné tant qu'au moins une de ses références garde un droit vivant :
 * jamais consommée, ou dans sa fenêtre de 24 h.
 *
 * Piège Prisma-Mongo : `{ expiredViewAt: null }` ne matche pas un champ ABSENT,
 * c'est-à-dire précisément les références jamais consommées — celles qu'il faut
 * le plus épargner. Les trois branches sont nécessaires.
 *
 * `cutoff` — le seuil d'échéance que l'APPELANT applique (`softDeleteCutoff`,
 * `hardDeleteCutoff`), par défaut `now`. La fenêtre de référence, elle, reste
 * TOUJOURS ancrée sur `now` : décaler `windowStart` avec le retard du
 * balayeur ferait paraître intacte une référence déjà éteinte depuis
 * longtemps du point de vue du lecteur.
 *
 * Nom de relation Prisma : `postMentions` (`Post.postMentions`), pas
 * `mentions` — le nom court n'existe que sur `PostComment` et `Message`.
 */
export function buildSweepableFilter(now: Date, cutoff: Date = now): Record<string, unknown> {
  const windowStart = new Date(now.getTime() - REFERENCE_VIEW_WINDOW_MS);

  return {
    expiresAt: { lt: cutoff },
    OR: [
      {
        postMentions: {
          none: {
            OR: [
              { expiredViewAt: { isSet: false } },
              { expiredViewAt: null },
              { expiredViewAt: { gt: windowStart } },
            ],
          },
        },
      },
      { expiresAt: { lt: new Date(now.getTime() - REFERENCE_SWEEP_GRACE_MS) } },
    ],
  };
}
