import { describe, expect, test } from 'bun:test';

import { FEED_PAGE_SIZE, loadFeedPage } from './feed';
import type { ApiResult, HttpTransport } from './http';

/** Un transport qui ne doit JAMAIS être appelé — la garde `__FIXTURES__ &&
 * source === 'fixtures'` (`loadFeedPage`) doit court-circuiter avant lui. */
const transportJamaisAppele: HttpTransport = Object.assign(
  () => {
    throw new Error('le transport réseau ne doit pas être appelé en fixtures');
  },
  {
    request: (): Promise<ApiResult<never>> => {
      throw new Error('le transport réseau ne doit pas être appelé en fixtures');
    },
  },
) as unknown as HttpTransport;

describe('loadFeedPage — la source fixtures suit le MÊME port que la passerelle', () => {
  test('rend une page depuis FEED_POSTS, jamais le réseau', async () => {
    const result = await loadFeedPage({ source: 'fixtures', transport: transportJamaisAppele });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.posts).toHaveLength(FEED_PAGE_SIZE);
    expect(result.data.pagination.hasMore).toBe(true);
  });

  test('un curseur transmis TEL QUEL avance vers la page suivante', async () => {
    const first = await loadFeedPage({ source: 'fixtures', transport: transportJamaisAppele });
    if (!first.ok) throw new Error('la page 1 doit réussir');
    expect(first.data.pagination.nextCursor).not.toBeNull();

    const second = await loadFeedPage({
      source: 'fixtures',
      transport: transportJamaisAppele,
      cursor: first.data.pagination.nextCursor ?? undefined,
    });
    if (!second.ok) throw new Error('la page 2 doit réussir');
    const idsFirst = new Set(first.data.posts.map((p) => p.id));
    for (const post of second.data.posts) expect(idsFirst.has(post.id)).toBe(false);
  });
});

/**
 * LA BRANCHE RÉSEAU — celle qui part en production, et que la première forme
 * ne touchait PAS (revue-correction #5893) : tous les témoins du port
 * n'exerçaient que les fixtures. Ce qui s'y joue et que rien ne gardait :
 * l'adresse EXACTE (`scope=home&limit=20`), le curseur transmis TEL QUEL, et
 * le recadrage de l'enveloppe `pagination` — `CursorPaginationAvecForme`
 * (`services/gateway/src/routes/posts/feed.ts:148-155` :
 * `{ limit, hasMore, nextCursor, form: 'keyset' }`), jamais `PaginationMeta`.
 *
 * La charge de ces témoins est RECOPIÉE d'un relevé réel sur
 * `gate.staging.meeshy.me` du 2026-09-13 (`null` compris) — pas inventée.
 */
type Appel = { readonly method: string; readonly path: string };

function transportEnregistreur(reponse: ApiResult<unknown>): { readonly transport: HttpTransport; readonly appels: Appel[] } {
  const appels: Appel[] = [];
  const request = async <T,>(req: { method: string; path: string }): Promise<ApiResult<T>> => {
    appels.push({ method: req.method, path: req.path });
    return reponse as ApiResult<T>;
  };
  return { transport: { request } as unknown as HttpTransport, appels };
}

describe('loadFeedPage — la branche RÉSEAU parle à la route réelle', () => {
  const enveloppeReelle = {
    ok: true as const,
    data: [
      {
        id: '6a9db04c2e6c18ab595e3956',
        type: 'REEL',
        createdAt: '2026-09-06T18:26:20.090Z',
        content: '',
        originalLanguage: 'fr',
        translations: null,
        author: { id: '6a9c', username: 'demo-test-stagin', displayName: 'Demo Test Staging Loop', avatar: null },
      },
    ],
    pagination: { limit: 20, hasMore: true, nextCursor: 'eyJjcmVhdGVkQXQiOiIyMDI2In0=', form: 'keyset' },
  };

  test('sans curseur : `GET /api/v1/social/posts?scope=home&limit=20`, rien d’autre', async () => {
    const { transport, appels } = transportEnregistreur(enveloppeReelle as unknown as ApiResult<unknown>);
    const result = await loadFeedPage({ source: 'gateway', transport });
    expect(appels).toEqual([{ method: 'GET', path: '/api/v1/social/posts?scope=home&limit=20' }]);
    expect(result.ok).toBe(true);
  });

  test('le curseur OPAQUE est transmis tel quel, jamais réinterprété', async () => {
    const { transport, appels } = transportEnregistreur(enveloppeReelle as unknown as ApiResult<unknown>);
    await loadFeedPage({ source: 'gateway', transport, cursor: 'eyJjcmVhdGVkQXQiOiIyMDI2In0=' });
    const path = appels[0]?.path ?? '';
    expect(path.startsWith('/api/v1/social/posts?scope=home&limit=20&cursor=')).toBe(true);
    expect(decodeURIComponent(path.split('cursor=')[1] ?? '')).toBe('eyJjcmVhdGVkQXQiOiIyMDI2In0=');
  });

  test('`hasMore`/`nextCursor` viennent de l’enveloppe SERVIE, pas d’un défaut optimiste', async () => {
    const { transport } = transportEnregistreur(enveloppeReelle as unknown as ApiResult<unknown>);
    const result = await loadFeedPage({ source: 'gateway', transport });
    if (!result.ok) throw new Error('la page doit réussir');
    expect(result.data.pagination.hasMore).toBe(true);
    expect(result.data.pagination.nextCursor).toBe('eyJjcmVhdGVkQXQiOiIyMDI2In0=');
    expect(result.data.posts).toHaveLength(1);
  });

  /** Une route qui ne sert AUCUNE pagination (ou une forme inattendue) doit
   * arrêter la traversée, jamais la faire boucler sur un curseur inventé. */
  test('une enveloppe SANS pagination ⇒ `hasMore` faux et curseur nul, jamais une boucle', async () => {
    const { transport } = transportEnregistreur({ ok: true, data: [] } as unknown as ApiResult<unknown>);
    const result = await loadFeedPage({ source: 'gateway', transport });
    if (!result.ok) throw new Error('la page doit réussir');
    expect(result.data.pagination).toEqual({ limit: FEED_PAGE_SIZE, hasMore: false, nextCursor: null });
  });

  test('un échec de la passerelle (401 sans session) remonte INCHANGÉ à l’appelant', async () => {
    const echec = { ok: false as const, error: 'Authentication required', status: 401 };
    const { transport } = transportEnregistreur(echec as unknown as ApiResult<unknown>);
    const result = await loadFeedPage({ source: 'gateway', transport });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('Authentication required');
  });
});
