import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeRegistryRow, loadPacksRegistry, registryFailureOf, resetPackRegistry, updatePackRegistry } from './admin-packs-registry';

/**
 * W17 (#11323) — LE PORT DE L'ADMINISTRATION DU REGISTRE DES PACKS, sur les
 * routes de S20 (#11275) : `GET /admin/packs/registry`, `PUT` et `DELETE
 * /admin/packs/registry/:domain/:slug`, garde `canManageGame` (BIGBOSS, ADMIN).
 * Chaque écriture porte la révision lue (compare-and-set) ; chaque refus a son
 * mot (révision périmée, loi du registre, journal indisponible).
 */
const editable = (extra: Record<string, unknown> = {}) => ({ hidden: false, order: 10, price: null, availability: null, targeting: null, ...extra });
const row = (extra: Record<string, unknown> = {}) => ({
  domain: 'wallpaper',
  slug: 'aurore',
  origin: 'official',
  revision: 2,
  base: editable(),
  override: { hidden: true },
  effective: editable({ hidden: true }),
  ...extra,
});

const transportAnswering = (answer: (request: HttpRequest) => ApiResult<unknown>) => {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest) => {
      calls.push(request);
      return answer(request) as ApiResult<T>;
    },
  } as unknown as HttpTransport;
  return { calls, deps: { source: 'gateway' as const, transport } };
};

describe('decodeRegistryRow', () => {
  test('une ligne servie se décode champ par champ', () => {
    expect(decodeRegistryRow(row({ effective: editable({ price: 30, availability: { startsAt: '2026-11-01T00:00:00.000Z' }, targeting: { countries: ['FR'] } }) }))).toEqual({
      domain: 'wallpaper',
      slug: 'aurore',
      origin: 'official',
      revision: 2,
      base: { hidden: false, order: 10, price: null, availability: null, targeting: null },
      overridden: true,
      effective: { hidden: false, order: 10, price: 30, availability: { startsAt: '2026-11-01T00:00:00.000Z' }, targeting: { countries: ['FR'] } },
    });
  });

  test('un domaine inconnu ou une ligne incomplète est écartée', () => {
    expect(decodeRegistryRow(row({ domain: 'inconnu' }))).toBeNull();
    expect(decodeRegistryRow({ domain: 'wallpaper' })).toBeNull();
  });
});

describe('les trois routes', () => {
  test('lire : GET /admin/packs/registry, les lignes illisibles écartées', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: [row(), { domain: 'x' }] }));
    const result = await loadPacksRegistry(deps);
    expect(calls[0]).toMatchObject({ method: 'GET', path: '/api/v1/admin/packs/registry' });
    expect(result.ok && result.data.map((entry) => entry.slug)).toEqual(['aurore']);
  });

  test('surcharger : PUT avec la révision lue et le seul correctif', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: row({ revision: 3 }) }));
    const result = await updatePackRegistry(deps, { domain: 'wallpaper', slug: 'aurore', expectedRevision: 2, patch: { hidden: false, price: null } });
    expect(calls[0]).toMatchObject({ method: 'PUT', path: '/api/v1/admin/packs/registry/wallpaper/aurore', body: { expectedRevision: 2, hidden: false, price: null } });
    expect(result.ok && result.data.revision).toBe(3);
  });

  test('revenir au dépôt : DELETE avec la révision en requête', async () => {
    const { calls, deps } = transportAnswering(() => ({ ok: true, data: { domain: 'wallpaper', slug: 'aurore' } }));
    const result = await resetPackRegistry(deps, { domain: 'wallpaper', slug: 'aurore', expectedRevision: 2 });
    expect(calls[0]).toMatchObject({ method: 'DELETE', path: '/api/v1/admin/packs/registry/wallpaper/aurore?expectedRevision=2' });
    expect(result.ok).toBe(true);
  });
});

describe('registryFailureOf — chaque refus a son mot', () => {
  test('409 révision périmée, 422 loi du registre, 500 journal indisponible, le reste générique', () => {
    expect(registryFailureOf({ ok: false, status: 409, error: 'revision-conflict' })).toBe('conflict');
    expect(registryFailureOf({ ok: false, status: 422, error: 'PACK_OVERRIDE_UNLAWFUL' })).toBe('unlawful');
    expect(registryFailureOf({ ok: false, status: 500, error: 'audit-unavailable' })).toBe('audit');
    expect(registryFailureOf({ ok: false, status: 403, error: 'forbidden' })).toBe('forbidden');
    expect(registryFailureOf({ ok: false, status: 0, error: 'offline' })).toBe('failed');
  });
});
