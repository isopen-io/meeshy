import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from './conversations';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { loadAvatarRingCatalogue, loadInstalledAvatarRingPacks, decodeAvatarRingPackSummary } from './packs-avatar-ring';
import { loadBannerCatalogue, loadInstalledBannerPacks, decodeBannerPackSummary } from './packs-banner';

const summary = (slug: string, overrides: Record<string, unknown> = {}) => ({
  slug,
  name: 'Essentiels',
  description: 'Six',
  author: 'Meeshy',
  installed: true,
  origin: 'builtin',
  removable: false,
  ...overrides,
});

const depsAnswering = (answer: (request: HttpRequest) => ApiResult<unknown>): { deps: ConversationsDeps; paths: string[] } => {
  const paths: string[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      paths.push(request.path);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, paths };
};

describe('les packs de contours et de bannières', () => {
  test('le domaine est celui du port, jamais celui de la charge', () => {
    expect(decodeAvatarRingPackSummary(summary('contours-essentiels'))?.domain).toBe('avatar-ring');
    expect(decodeBannerPackSummary(summary('bannieres-essentielles'))?.domain).toBe('banner');
  });

  test('un pack malformé tombe seul, la liste reste', async () => {
    const { deps, paths } = depsAnswering(() => ({ ok: true, data: [summary('ok'), { slug: 3 }] }));
    const result = await loadInstalledAvatarRingPacks(deps);
    expect(paths).toEqual(['/api/v1/packs/avatar-ring/installed']);
    expect(result.ok && result.data.map((pack) => pack.slug)).toEqual(['ok']);
  });

  test('un ancien serveur (404) donne une boutique vide, sans erreur', async () => {
    const { deps } = depsAnswering(() => ({ ok: false, status: 404, error: 'Not found' }));
    expect(await loadBannerCatalogue(deps)).toEqual({ ok: true, data: [] });
    expect(await loadAvatarRingCatalogue(deps)).toEqual({ ok: true, data: [] });
  });

  test('les bannières lisent /packs/banner/installed', async () => {
    const { deps, paths } = depsAnswering(() => ({ ok: true, data: [] }));
    await loadInstalledBannerPacks(deps);
    expect(paths).toEqual(['/api/v1/packs/banner/installed']);
  });

  test('prix et possession sont additifs : absents, le pack est gratuit', () => {
    const free = decodeBannerPackSummary(summary('p'));
    expect(free?.price).toBeUndefined();
    expect(decodeBannerPackSummary(summary('p', { price: 40, owned: false }))).toMatchObject({ price: 40, owned: false });
  });
});
