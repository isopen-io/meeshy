import { describe, expect, test } from 'bun:test';

import type { ConversationsDeps } from './conversations';
import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { putProfileDecor, readProfileDecor } from './profile-decor';

const depsAnswering = (answer: (request: HttpRequest) => ApiResult<unknown>): { deps: ConversationsDeps; seen: HttpRequest[] } => {
  const seen: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      seen.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway', transport }, seen };
};

const served = { pack: 'contours-essentiels', item: 'filet', origin: 'builtin', contract: null };

describe('la lecture du décor de profil', () => {
  test('un ancien serveur qui ne sert pas profileDecor donne undefined, pas un décor vide', () => {
    expect(readProfileDecor({ id: 'u1' })).toBeUndefined();
    expect(readProfileDecor(null)).toBeUndefined();
  });

  test('un décor servi se lit côté par côté : un contour illisible n’emporte pas la bannière', () => {
    const decor = readProfileDecor({ profileDecor: { avatarRing: { pack: 'x' }, banner: { ...served, pack: 'bannieres-essentielles', item: 'aurore' } } });
    expect(decor?.avatarRing).toBeNull();
    expect(decor?.banner?.item).toBe('aurore');
  });

  test('un décor servi vide est un décor vide, distinct de « non servi »', () => {
    expect(readProfileDecor({ profileDecor: { avatarRing: null, banner: null } })).toEqual({ avatarRing: null, banner: null, bannerFrame: null });
  });
});

describe('équiper un contour ou une bannière', () => {
  test('part en PUT /me/profile-decor avec les seuls champs demandés', async () => {
    const { deps, seen } = depsAnswering(() => ({ ok: true, data: { avatarRing: served, banner: null } }));
    const result = await putProfileDecor(deps, { avatarRing: { pack: 'contours-essentiels', item: 'filet' } });
    expect(seen).toEqual([{ method: 'PUT', path: '/api/v1/me/profile-decor', body: { avatarRing: { pack: 'contours-essentiels', item: 'filet' } } }]);
    expect(result.ok && result.data.avatarRing?.item).toBe('filet');
  });

  test('un refus du serveur est rendu tel quel, avec son code', async () => {
    const { deps } = depsAnswering(() => ({ ok: false, status: 403, error: 'Pack not owned', code: 'PACK_NOT_OWNED' }));
    const result = await putProfileDecor(deps, { banner: { pack: 'p', item: 'i' } });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.code).toBe('PACK_NOT_OWNED');
  });
});
