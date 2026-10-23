import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { setShopPackInstalled, shopPackPort } from './packs-shop';

/**
 * W16 (#11322) — LA LENS DANS LA VITRINE UNIQUE : la boutique du domaine
 * `lens`, ses installées, son détail et son installation lisent les routes de
 * S16 (`/packs/lens`, `/installed`, `/:slug`, `/:slug/install` en PUT et DELETE).
 */
const gateway = () => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return { ok: true, data: { slug: 'aurore', name: 'Aurore', installed: request.method === 'PUT' } } as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { calls, deps: { source: 'gateway' as const, transport } };
};

describe('la lens dans la vitrine unique', () => {
  test('les routes du domaine lens', () => {
    const port = shopPackPort('lens');
    expect(port.catalogue).toBe('/api/v1/packs/lens');
    expect(port.installed).toBe('/api/v1/packs/lens/installed');
    expect(port.bySlug('aurore')).toBe('/api/v1/packs/lens/aurore');
  });

  test('installer en PUT, désinstaller en DELETE', async () => {
    const { calls, deps } = gateway();
    expect((await setShopPackInstalled(deps, 'lens', 'aurore', true)).ok).toBe(true);
    expect((await setShopPackInstalled(deps, 'lens', 'aurore', false)).ok).toBe(true);
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual(['PUT /api/v1/packs/lens/aurore/install', 'DELETE /api/v1/packs/lens/aurore/install']);
  });
});
