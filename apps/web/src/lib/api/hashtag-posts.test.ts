import { describe, expect, test } from 'bun:test';

import type { FeedPost } from './feed-pages';
import { loadHashtagPage } from './hashtag-posts';
import type { HttpTransport } from './http';

/**
 * LA PAGE D'UN HASHTAG PORTE L'ÉTAT DU LECTEUR (#7396). La passerelle pose
 * `isLikedByMe` / `isBookmarkedByMe` / `isRepostedByMe` sur chaque publication
 * de `scope=hashtag` depuis ce lot, par la même fonction que le fil
 * (`services/gateway/src/services/posts/viewerPostState.ts`). Deux affirmations :
 * le port les REND tels qu'ils arrivent — une projection qui les jetterait
 * rallumerait le cœur éteint d'une publication aimée et son `POST` en 409 — et
 * la fixture les sert comme cas NOMINAL, jamais leur absence.
 */

const servie: FeedPost = {
  id: 'p-aimee',
  type: 'POST',
  createdAt: '2026-09-21T10:00:00.000Z',
  isLikedByMe: true,
  isBookmarkedByMe: true,
  isRepostedByMe: false,
};

const transportRendant = (data: readonly FeedPost[]): HttpTransport =>
  ({
    request: async () => ({ ok: true, status: 200, data, pagination: { limit: 20, hasMore: false, nextCursor: null } }),
  }) as unknown as HttpTransport;

describe('loadHashtagPage — l’état du lecteur traverse le port', () => {
  test('la passerelle sert le cœur et le favori du lecteur : la page les rend, sans les jeter', async () => {
    const result = await loadHashtagPage({ source: 'gateway', transport: transportRendant([servie]), tag: 'livraison' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const [post] = result.data.posts;
    expect([post?.isLikedByMe, post?.isBookmarkedByMe, post?.isRepostedByMe]).toEqual([true, true, false]);
  });

  test('la fixture du hashtag sert l’état du lecteur sur CHAQUE publication, comme la passerelle', async () => {
    const result = await loadHashtagPage({ source: 'fixtures', transport: {} as HttpTransport, tag: 'livraison' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.posts.length).toBeGreaterThan(0);
    for (const post of result.data.posts) {
      expect(typeof post.isLikedByMe).toBe('boolean');
      expect(typeof post.isBookmarkedByMe).toBe('boolean');
      expect(typeof post.isRepostedByMe).toBe('boolean');
    }
    expect(result.data.posts.some((post) => post.isLikedByMe === true)).toBe(true);
  });
});
