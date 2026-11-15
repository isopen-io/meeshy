import type { QueryClient } from '@tanstack/react-query';

import { writeCardCache } from './card-caches';
import { STORY_FEED_QUERY_KEY, STORY_TRAY_QUERY_KEY, storyPostQueryKey, type StoryFeedPost, type StoryTrayPost } from './stories';

/**
 * **UNE STORY SUPPRIMÉE QUITTE SES TROIS CORPUS** (#6149) — le registre des
 * caisses de CARTES (`card-caches.ts`) ne connaît que `CardPages` (des pages
 * de `FeedPost`) : les deux corpus de stories sont des TABLEAUX PLATS
 * (`readonly StoryTrayPost[]` / `readonly StoryFeedPost[]`), qui n'entrent
 * donc dans AUCUNE de ses `CARD_LISTS`. Sans ce site, supprimer une story
 * depuis le listing « Mes stories » laissait sa rangée dans le rail
 * (`STORY_TRAY_QUERY_KEY`), dans le corpus complet du lecteur
 * (`STORY_FEED_QUERY_KEY`) et sur sa fiche unitaire (`storyPostQueryKey`)
 * jusqu'à la prochaine invalidation — un anneau, une vignette, une entrée de
 * rail qui survivraient à la story qu'ils annoncent.
 *
 * `writeCardCache` (déjà générique en `T`, pas seulement en `CardPages`) porte
 * la MÊME garde « rien à écrire » (`unlessSame`) que le registre des cartes :
 * une caisse qui ne montre pas la story n'est pas réécrite, et une caisse
 * absente reste absente — aucune requête n'est inventée par cet appel.
 */
function withoutStory<T extends { readonly id: string }>(
  data: readonly T[] | undefined,
  postId: string,
): readonly T[] | undefined {
  if (data === undefined) return data;
  const next = data.filter((story) => story.id !== postId);
  return next.length === data.length ? data : next;
}

/** Appelée par `deletePost` (`publication-actions.ts`) pour TOUTE
 * publication : un `postId` qui n'est la story d'AUCUNE de ces trois caisses
 * (le cas nominal d'une carte du Flux) n'y écrit rien. */
export function removeStoryFromCaches(queryClient: QueryClient, postId: string): void {
  writeCardCache<readonly StoryTrayPost[]>(queryClient, STORY_TRAY_QUERY_KEY, (data) => withoutStory(data, postId));
  writeCardCache<readonly StoryFeedPost[]>(queryClient, STORY_FEED_QUERY_KEY, (data) => withoutStory(data, postId));
  queryClient.removeQueries({ queryKey: storyPostQueryKey(postId) });
}
