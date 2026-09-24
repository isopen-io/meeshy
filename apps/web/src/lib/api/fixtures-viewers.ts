import { VIEWER_ID, minutesAgo } from './fixtures-base';
import type { PostViewerRow } from './story-viewers';

/**
 * **LE BOUCHON DE `GET /posts/:postId/interactions`** (#7116) — mime
 * `PostService.getPostInteractions` (`services/gateway/src/services/PostService.ts:2181-2226`)
 * pour la SEULE story dont le corpus fait le viewer AUTEUR : `st-mienne`
 * (`fixtures-stories.ts`).
 *
 * Trois lignes, `viewedAt desc`, une avec une réaction posée, une avec
 * `displayName: null` (repli `username`, `interactions.ts:2214-2223` —
 * `authorSelect` sert `displayName` nullable). AUCUN auteur ne reprend
 * Kwame/Amina/Fatou/Bruno, mêmes raisons que `fixtures-comments.ts` : ce
 * sont les preuves « ceci est une fixture » du socle.
 */
const VIEWERS_OF_ST_MIENNE: readonly PostViewerRow[] = [
  {
    id: 'u-viewer-noor',
    username: 'noor.haddad',
    displayName: 'Noor Haddad',
    avatarUrl: null,
    viewedAt: minutesAgo(4).toISOString(),
    reaction: '❤️',
  },
  {
    id: 'u-viewer-elan',
    username: 'elan.roy',
    displayName: null,
    avatarUrl: null,
    viewedAt: minutesAgo(19).toISOString(),
    reaction: null,
  },
  {
    id: 'u-viewer-mika',
    username: 'mika.sorel',
    displayName: 'Mika Sorel',
    avatarUrl: null,
    viewedAt: minutesAgo(51).toISOString(),
    reaction: null,
  },
];

export type FixtureInteractionsPostId = 'st-mienne' | (string & {});

/**
 * `authorId` d'une story de fixtures — pour décider REFUSED vs NOT_FOUND
 * exactement comme la passerelle (`post.authorId !== userId ⇒ FORBIDDEN`,
 * `PostService.ts:2183`).
 */
const STORY_AUTHOR_OF: Readonly<Record<string, string>> = {
  'st-mienne': VIEWER_ID,
  /* UNE de MES stories SANS AUCUNE vue — id de test seulement (n'existe pas
     dans `fixtures-stories.ts`) : elle éprouve l'état VIDE de la feuille sans
     confondre « pas encore vue » et « je ne suis pas l'auteur » (403). */
  'st-mienne-sans-vue': VIEWER_ID,
  'st-amie-1': 'u-ines',
  'st-amie-2': 'u-ines',
  'st-video': 'u-ines',
};

export type FixtureInteractionsResult =
  | { readonly ok: true; readonly viewers: readonly PostViewerRow[] }
  | { readonly ok: false; readonly status: 403 | 404 };

/**
 * Le viewer de fixtures est TOUJOURS `VIEWER_ID` (aucune session bouchonnée
 * n'existe pour un autre compte) : seul `st-mienne` lui appartient, les
 * autres stories du corpus rendent le refus que `mayConsumePost`/`getPostInteractions`
 * rendrait à un lecteur qui n'en est pas l'auteur.
 */
export function fixturePostInteractions(postId: string): FixtureInteractionsResult {
  const author = STORY_AUTHOR_OF[postId];
  if (author === undefined) return { ok: false, status: 404 };
  if (author !== VIEWER_ID) return { ok: false, status: 403 };
  return { ok: true, viewers: postId === 'st-mienne' ? VIEWERS_OF_ST_MIENNE : [] };
}
