import type { Post } from '@meeshy/shared/types/post';

import { minutesAgo, VIEWER_ID } from './fixtures-base';

/**
 * LES FIXTURES DU RAIL DE STORIES (#5652) — la FORME BRUTE que la passerelle
 * sert (`trayStorySelect`, `services/gateway/src/services/posts/postIncludes.ts:275-296`),
 * pas le modèle décodé : ces objets traversent le MÊME `select`
 * (`decodeStoryGroups`/`decodeStatusMoods`) que le réseau, jamais un raccourci
 * qui les fabriquerait déjà groupés.
 *
 * `bruno` (`u-bruno`, `fixtures-base.ts`) porte une story NON VUE — c'est ce
 * qui exerce l'anneau ACCENTUÉ en fixtures, exactement ce que la recette
 * staging observe sur le compte semé « Bruno Bêta » (`targets/seed.md`).
 * `VIEWER_ID` porte SA PROPRE story ACTIVE, pour exercer l'entrée « moi ».
 */

/** `avatar` est ABSENT, jamais posé à `undefined` — `exactOptionalPropertyTypes`
 * (`tsconfig.json`) : une clé optionnelle s'OMET, elle ne se pose pas à `undefined`. */
const bruno = {
  id: 'u-bruno',
  username: 'bruno.beta',
  displayName: 'Bruno Bêta',
} as const;

const viewerAuthor = {
  id: VIEWER_ID,
  username: 'vous',
  displayName: 'Vous',
} as const;

const storyDefaults = {
  type: 'STORY',
  visibility: 'FRIENDS',
  content: null,
  likeCount: 0,
  commentCount: 0,
  repostCount: 0,
  bookmarkCount: 0,
  shareCount: 0,
  isPinned: false,
  isEdited: false,
  updatedAt: minutesAgo(10),
} as const;

export const STORY_TRAY_POSTS: readonly Post[] = [
  {
    ...storyDefaults,
    id: 's-bruno-1',
    authorId: bruno.id,
    author: bruno,
    createdAt: minutesAgo(35),
    expiresAt: minutesAgo(35 - 24 * 60),
    viewCount: 4,
    media: [{ id: 'm-bruno-1', mimeType: 'image/jpeg', fileUrl: '', order: 0 }],
    /** `isViewedByMe` — servi par `trayStorySelect` (§ 3.1 de la
     * spécification), absent du contrat `Post` partagé : le décodeur le lit
     * en `unknown` (`stories.ts#toStoryItem`). */
    isViewedByMe: false,
  } as unknown as Post & { readonly isViewedByMe: boolean },
  {
    ...storyDefaults,
    id: 's-viewer-1',
    authorId: viewerAuthor.id,
    author: viewerAuthor,
    createdAt: minutesAgo(10),
    expiresAt: minutesAgo(10 - 24 * 60),
    viewCount: 0,
    media: [{ id: 'm-viewer-1', mimeType: 'image/jpeg', fileUrl: '', order: 0 }],
    isViewedByMe: true,
  } as unknown as Post & { readonly isViewedByMe: boolean },
];

export const STATUS_POSTS: readonly Post[] = [
  {
    ...storyDefaults,
    type: 'STATUS',
    id: 'st-bruno-1',
    authorId: bruno.id,
    author: bruno,
    createdAt: minutesAgo(20),
    expiresAt: minutesAgo(20 - 12 * 60),
    viewCount: 0,
    media: [],
    moodEmoji: '🎉',
  },
];
