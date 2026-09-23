import { useCallback, useMemo } from 'react';
import { useStore } from 'zustand/react';

import { useStoryTray } from '@/lib/api/query';
import { storyViewedStore } from '@/lib/api/story-viewed-store';
import { authorStoryRing, type AuthorStoryRing } from '@/lib/view/author-story-ring';
import { groupStoriesByAuthor } from '@/lib/view/story-tray';

export type StoryRingOf = (authorId: string | undefined) => AuthorStoryRing | undefined;

/**
 * **L'ANNEAU DE STORY DES AUTEURS D'UN FIL** (#7528, directive porteur du
 * 2026-09-23) — toucher l'avatar ou le nom d'un expéditeur ouvre sa STORY
 * quand il en a une, son profil sinon. La loi de destination est
 * `identityTarget` ; ce hook ne fait que lui fournir l'anneau.
 *
 * Le corpus est celui du plateau (`STORY_TRAY_QUERY_KEY`, même `staleTime`) :
 * venu de la Lentille, le fil le trouve déjà en cache et n'émet aucune
 * requête. Le même regroupement que le rail (`groupStoriesByAuthor` + l'avance
 * optimiste de « vu par moi ») garantit qu'un avatar du fil et la tuile du
 * rail disent la même chose du même auteur.
 *
 * Un INVITÉ n'a pas de plateau (la passerelle le lui refuse) : la requête ne
 * part pas, et ses avatars mènent au profil — jamais à une story qu'il ne
 * pourrait pas ouvrir.
 */
export function useAuthorStoryRings(viewer: { readonly id: string | null | undefined; readonly isAnonymous: boolean }): StoryRingOf {
  const tray = useStoryTray({ enabled: !viewer.isAnonymous });
  const seenNow = useStore(storyViewedStore, (s) => s.ids);
  const viewerId = viewer.id ?? undefined;

  const groups = useMemo(
    () => (tray.data === undefined ? undefined : groupStoriesByAuthor(tray.data, { viewerId, viewedIds: seenNow })),
    [tray.data, viewerId, seenNow],
  );

  return useCallback((authorId: string | undefined) => authorStoryRing(groups, authorId) ?? undefined, [groups]);
}
