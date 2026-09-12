import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpTransport } from './http';
import { searchUsers } from './users-search';

function fakeTransport(result: ApiResult<unknown>): HttpTransport & { lastRequest?: unknown } {
  const transport = (async () => result) as unknown as HttpTransport & { lastRequest?: unknown };
  transport.request = (async (req) => {
    transport.lastRequest = req;
    return result;
  }) as HttpTransport['request'];
  return transport;
}

describe('searchUsers — GET /api/v1/directory/people (§ 3.4)', () => {
  test('en fixtures, filtre le corpus local', async () => {
    const result = await searchUsers({ source: 'fixtures', transport: fakeTransport({ ok: false, status: 0, error: 'jamais appelé' }) }, 'amina');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.some((u) => u.displayName === 'Amina Diallo')).toBe(true);
  });

  test('en fixtures, une requête sous 2 caractères rend un corpus vide', async () => {
    const result = await searchUsers({ source: 'fixtures', transport: fakeTransport({ ok: false, status: 0, error: 'jamais appelé' }) }, 'a');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual([]);
  });

  /**
   * LA ROUTE CIBLE, JAMAIS L'ALIAS EN SURSIS (revue #5652) —
   * `/users/search` est déclarée alias de celle-ci par la passerelle
   * elle-même, et son schéma ne sert pas `avatar`. Voir le doc-comment du
   * port.
   */
  test('en gateway, appelle GET /api/v1/directory/people?q=…&limit=20', async () => {
    const transport = fakeTransport({ ok: true, data: [] });
    await searchUsers({ source: 'gateway', transport }, 'ami na');
    const req = transport.lastRequest as { readonly method: string; readonly path: string };
    expect(req.method).toBe('GET');
    expect(req.path).toBe('/api/v1/directory/people?q=ami%20na&limit=20');
  });
});
