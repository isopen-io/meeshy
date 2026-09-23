import type { StoryTrayGroup } from './story-tray';

/**
 * CE QU'UN AVATAR DOIT SAVOIR DES STORIES DE SON AUTEUR (#7185) — et rien de
 * plus : y a-t-il une story à ouvrir, laquelle, et reste-t-il du non-vu.
 *
 * ## LE CORPUS EST DÉJÀ LÀ — aucune requête n'est ajoutée
 *
 * Le rail (`useStoryRailProps`) charge `STORY_TRAY_QUERY_KEY` sur les écrans
 * qui le montent — le Flux et la Lentille. Un avatar qui veut son anneau lit
 * donc ce CACHE, jamais le réseau : interroger « cet auteur a-t-il une
 * story ? » par avatar coûterait une requête par carte, pour une information
 * que l'écran tient déjà.
 *
 * Corollaire assumé : sur un écran qui ne monte PAS le rail, aucun avatar ne
 * porte d'anneau. C'est une dégradation gracieuse, pas un défaut — un anneau
 * absent ne ment pas, alors qu'un anneau qui apparaîtrait après un aller-retour
 * réseau ferait sauter la mise en page sous le doigt.
 *
 * ## UNE FONCTION PURE, PARCE QUE LA RÈGLE SE TESTE SANS REACT
 *
 * Le hook qui lit le cache est une enveloppe ; la règle — quel auteur, quelle
 * story d'entrée, quel état — vit ici et se mesure sans monter quoi que ce soit.
 */
export type AuthorStoryRing = {
  /** La story par laquelle OUVRIR — `entryStoryIdOf`, jamais recalculée ici. */
  readonly entryStoryId: string;
  /** Reste-t-il une story que le lecteur n'a pas vue. */
  readonly unseen: boolean;
};

/**
 * L'entrée de story d'un auteur, ou `null` s'il n'en a aucune.
 *
 * `null` est le cas NOMINAL, et c'est important : la plupart des auteurs n'ont
 * pas de story, et un anneau qui s'afficherait sans destination serait un
 * contrôle qui ment (loi 4). L'appelant ne peint QUE sur une valeur non nulle.
 *
 * Un groupe sans `entryStoryId` — une forme que le corpus ne produit pas, mais
 * qu'un cache périmé pourrait porter — est traité comme une absence plutôt que
 * comme une story ouvrable vers nulle part.
 */
export function authorStoryRing(
  groups: readonly StoryTrayGroup[] | undefined,
  authorId: string | undefined,
): AuthorStoryRing | null {
  if (groups === undefined || authorId === undefined || authorId === '') return null;

  const group = groups.find((candidate) => candidate.authorId === authorId);
  if (group === undefined) return null;

  const entryStoryId = group.entryStoryId;
  if (typeof entryStoryId !== 'string' || entryStoryId === '') return null;

  return { entryStoryId, unseen: group.hasUnseen };
}

/**
 * L'HUMEUR COURANTE D'UN AUTEUR (#7186, directive porteur du 2026-09-20), lue
 * du MÊME corpus que l'anneau — `withMoods` (`story-tray.ts:136`) l'a déjà
 * greffée sur les groupes du rail. Aucune requête n'est ajoutée ici non plus.
 *
 * ## CE QUE CETTE LECTURE NE PEUT PAS GARANTIR, ET QUI DOIT ÊTRE DIT
 *
 * Un mood est un `Post` de type `STATUS`, ÉPHÉMÈRE À UNE HEURE
 * (`schema.prisma:3435`, TTL posé par `ephemeralPosts.ts:28`). L'expiration est
 * filtrée par la PASSERELLE (`getStatuses` exige `expiresAt > now`) ; le corpus
 * en cache, lui, peut survivre à l'heure de ce qu'il porte.
 *
 * `StatusMoodPost` ne déclare pas `expiresAt` — mesuré
 * (`lib/api/stories.ts:141-146`) — donc cette fonction ne PEUT pas vérifier la
 * fenêtre, et elle ne fait pas semblant. C'est la limite EXACTE que le rail
 * porte déjà : il peint les mêmes moods depuis le même corpus, sans plus de
 * garantie. Ce lot ne l'aggrave pas et ne la corrige pas — l'élargir
 * demanderait de faire voyager `expiresAt` sur le fil, ce qui est un lot à soi.
 */
export function authorMoodEmoji(
  groups: readonly StoryTrayGroup[] | undefined,
  authorId: string | undefined,
): string | null {
  if (groups === undefined || authorId === undefined || authorId === '') return null;

  const mood = groups.find((candidate) => candidate.authorId === authorId)?.moodEmoji;
  return typeof mood === 'string' && mood !== '' ? mood : null;
}
