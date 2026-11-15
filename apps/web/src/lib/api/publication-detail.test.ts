import { describe, expect, test } from 'bun:test';

import { FEED_QUERY_KEY } from './feed';
import { FEED_POSTS } from './fixtures-feed';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { loadPost, postQueryKey } from './publication-detail';

const recording = (response: ApiResult<unknown>) => {
  const requests: HttpRequest[] = [];
  const transport = {
    request: (req: HttpRequest) => {
      requests.push(req);
      return Promise.resolve(response);
    },
  } as unknown as HttpTransport;
  return { requests, transport };
};

describe('loadPost — le port du DÉTAIL d’une publication (#6278)', () => {
  test('passerelle : `GET /api/v1/posts/:id`, l’identifiant ENCODÉ dans le chemin', async () => {
    const { requests, transport } = recording({ ok: true, data: { id: 'a/b', type: 'POST', createdAt: '2026-09-13T10:00:00.000Z' } });

    const result = await loadPost({ source: 'gateway', transport, postId: 'a/b' });

    expect(requests).toHaveLength(1);
    expect(requests[0]?.method).toBe('GET');
    expect(requests[0]?.path).toBe('/api/v1/posts/a%2Fb');
    expect(result.ok).toBe(true);
  });

  /** `getPostById` applique l'ACL : « n'existe pas » et « hors audience »
   * rendent le MÊME 404 (D-6) — le port le remonte tel quel, il n'invente
   * aucune distinction que la passerelle refuse de faire. */
  /** #6514 — le détail monte la MÊME carte que le fil : il lit l'agencement de
   * l'auteur au même document canvas v3, donc il l'annonce aussi. */
  test('passerelle : annonce `X-Canvas-Caps: 3`, comme le fil', async () => {
    const { requests, transport } = recording({ ok: true, data: { id: 'p1', type: 'POST', createdAt: '2026-09-13T10:00:00.000Z' } });
    await loadPost({ source: 'gateway', transport, postId: 'p1' });
    expect(requests[0]?.headers).toEqual({ 'X-Canvas-Caps': '3' });
  });

  test('passerelle : un 404 remonte TEL QUEL', async () => {
    const refusal: ApiResult<unknown> = { ok: false, status: 404, error: 'Post not found', code: 'POST_NOT_FOUND' };
    const { transport } = recording(refusal);

    expect(await loadPost({ source: 'gateway', transport, postId: 'p-x' })).toEqual(refusal);
  });

  test('fixtures : une publication du corpus est servie sans toucher au transport', async () => {
    const target = FEED_POSTS[0];
    expect(target).toBeDefined();

    const result = await loadPost({ source: 'fixtures', transport: {} as HttpTransport, postId: target?.id ?? '' });

    expect(result).toEqual({ ok: true, data: target });
  });

  test('fixtures : un id inconnu rend le même 404 que la passerelle', async () => {
    const result = await loadPost({ source: 'fixtures', transport: {} as HttpTransport, postId: 'n-existe-pas' });
    expect(result).toEqual({ ok: false, status: 404, error: 'Post not found', code: 'POST_NOT_FOUND' });
  });

  test('la clé de cache nomme le post et ne recouvre JAMAIS celle du fil', () => {
    expect(postQueryKey('p1')).toEqual(['posts', 'p1']);
    expect(postQueryKey('p1')[0]).not.toBe(FEED_QUERY_KEY[0]);
  });
});
