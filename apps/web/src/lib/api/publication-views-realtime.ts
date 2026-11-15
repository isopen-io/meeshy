import type { QueryClient } from '@tanstack/react-query';

import { STORY_FEED_QUERY_KEY, storyPostQueryKey, type StoryFeedPost } from './stories';
import { storyViewersQueryKey } from './publication-viewers';

/**
 * **`story:viewed` — « VUES » SUIT EN DIRECT** (#7116, revue ; spécification
 * Q8). La passerelle diffuse l'événement à l'AUTEUR seul
 * (`SocialEventsHandler.broadcastStoryViewed` → `emitToUser(authorId)`,
 * émetteur `services/gateway/src/routes/social/events.ts:340-366`), charge
 * `StoryViewedEventData` (`packages/shared/types/post.ts:371-376`). `socket.ts`
 * ne s'en servait que pour invalider le PLATEAU ; le compte du rail et la
 * feuille ouverte restaient figés sur l'état du chargement — iOS rafraîchit
 * les deux (`StoryViewersSheet`, `.onReceive(storyViewed)`,
 * `StoryViewerView+Content.swift:1485-1519`).
 *
 * **LE COMPTE EST ABSOLU** (`post.viewCount` relu APRÈS l'enregistrement de
 * la vue) : il REMPLACE, comme `post:liked.likeCount` — un `+1` local
 * diverge sous double livraison. L'APPARTENANCE du bouton, elle, reste figée
 * (gel D-88) : seul le chiffre bouge.
 *
 * **CHARGÉ PAR `import()`** (D-98, motif `reaction-realtime.ts`) : le lecteur
 * n'en paie rien, le chunk `realtime` non plus. Nommé HORS du préfixe
 * `story-` pour la même raison que `publication-viewers-sheet` : le motif du
 * plafond `story_reader` (`budgets.json`) compte tout chunk `story-…`, et y
 * aurait rangé un module que le lecteur ne télécharge jamais à l'ouverture
 * (mesuré : 11,94 Ko, dépassement FICTIF, sous l'ancien nom).
 */
function isStoryViewedEvent(payload: unknown): payload is { readonly storyId: string; readonly viewCount: number } {
  if (typeof payload !== 'object' || payload === null) return false;
  const p = payload as Record<string, unknown>;
  return typeof p.storyId === 'string' && typeof p.viewCount === 'number' && Number.isFinite(p.viewCount) && p.viewCount >= 0;
}

function withViewCount(story: StoryFeedPost, storyId: string, viewCount: number): StoryFeedPost {
  return story.id === storyId && story.viewCount !== viewCount ? { ...story, viewCount } : story;
}

/**
 * Une charge invalide ne change rien et ne lève pas ; un cache jamais chargé
 * n'est pas fabriqué ; un corpus que l'événement ne touche pas garde son
 * IDENTITÉ (aucun re-rendu pour la story d'un autre).
 */
export function applyStoryViewedEvent(queryClient: QueryClient, payload: unknown): void {
  if (!isStoryViewedEvent(payload)) return;
  const { storyId, viewCount } = payload;
  queryClient.setQueryData<readonly StoryFeedPost[]>(STORY_FEED_QUERY_KEY, (stories) => {
    if (stories === undefined) return stories;
    const next = stories.map((story) => withViewCount(story, storyId, viewCount));
    return next.every((story, index) => story === stories[index]) ? stories : next;
  });
  queryClient.setQueryData<StoryFeedPost>(storyPostQueryKey(storyId), (story) =>
    story === undefined ? story : withViewCount(story, storyId, viewCount),
  );
  void queryClient.invalidateQueries({ queryKey: storyViewersQueryKey(storyId) });
}
