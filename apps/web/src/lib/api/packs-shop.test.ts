import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from './conversations';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeShopPack, loadShop, newPurchaseRequestId, purchasePack } from './packs-shop';

type Answer = (request: HttpRequest) => ApiResult<unknown>;

const depsAnswering = (answer: Answer): { deps: ConversationsDeps; calls: HttpRequest[] } => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, calls };
};

const row = (slug: string, extra: Record<string, unknown> = {}) => ({ slug, name: slug, installed: false, ...extra });
const notFound = { ok: false, status: 404, error: 'Not found' } as const;

describe('le décodeur de la vitrine', () => {
  test('sans prix le pack est gratuit et possédé ; avec prix, seul `owned` du serveur compte', () => {
    expect(decodeShopPack('wallpaper')(row('a'))).toMatchObject({ price: null, owned: true });
    expect(decodeShopPack('wallpaper')(row('a', { price: 40 }))).toMatchObject({ price: 40, owned: false });
    expect(decodeShopPack('wallpaper')(row('a', { price: 40, owned: true }))?.owned).toBe(true);
  });
  test('un pack malformé tombe', () => {
    expect(decodeShopPack('banner')({ slug: 1 })).toBe(null);
  });
});

describe('loadShop', () => {
  test('lit /packs/shop filtré par domaines, avec le solde', async () => {
    const { deps, calls } = depsAnswering(() => ({
      ok: true,
      data: { domains: [{ domain: 'banner', packs: [row('b1', { price: 10 }), { bad: true }] }], balance: 12 },
    }));
    const result = await loadShop(deps, ['banner', 'wallpaper']);
    expect(calls[0]?.path).toBe('/api/v1/packs/shop?domains=banner,wallpaper');
    expect(result.ok && result.data.balance).toBe(12);
    expect(result.ok && result.data.packs.map((p) => p.slug)).toEqual(['b1']);
  });

  test('404 sur la vitrine : retombe sur les boutiques par domaine, un domaine absent est vide', async () => {
    const { deps, calls } = depsAnswering((request) => {
      if (request.path === '/api/v1/sticker-packs') return { ok: true, data: [row('s1')] };
      if (request.path === '/api/v1/packs/glory-frame') return { ok: true, data: [row('g1')] };
      return notFound;
    });
    const result = await loadShop(deps);
    expect(calls[0]?.path).toBe('/api/v1/packs/shop');
    expect(result.ok && result.data.packs.map((p) => `${p.domain}:${p.slug}`)).toEqual(['sticker:s1', 'glory-frame:g1']);
    expect(result.ok && result.data.balance).toBe(null);
  });

  test('une autre erreur est rendue telle quelle', async () => {
    const { deps } = depsAnswering(() => ({ ok: false, status: 500, error: 'boom' }));
    expect((await loadShop(deps)).ok).toBe(false);
  });
});

describe('purchasePack', () => {
  test('POST /<domaine>/<slug>/purchase avec le seul requestId, rend le pack et le solde', async () => {
    const { deps, calls } = depsAnswering(() => ({ ok: true, data: { pack: row('w1', { price: 30, owned: true, installed: true }), balance: 7 } }));
    const result = await purchasePack(deps, 'wallpaper', 'w1', 'buy-12345678');
    expect(calls[0]).toMatchObject({ method: 'POST', path: '/api/v1/packs/wallpaper/w1/purchase', body: { requestId: 'buy-12345678' } });
    expect(result.ok && result.data.balance).toBe(7);
    expect(result.ok && result.data.pack.owned).toBe(true);
  });
  test('409 INSUFFICIENT_MEESHES est rendu tel quel', async () => {
    const { deps } = depsAnswering(() => ({ ok: false, status: 409, error: 'x', code: 'INSUFFICIENT_MEESHES' }));
    const result = await purchasePack(deps, 'banner', 'b', 'buy-12345678');
    expect(!result.ok && result.code).toBe('INSUFFICIENT_MEESHES');
  });
  test('un requestId généré respecte 8–64 [A-Za-z0-9_-]', () => {
    expect(newPurchaseRequestId()).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
