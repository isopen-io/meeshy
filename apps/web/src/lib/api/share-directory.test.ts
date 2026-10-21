import { describe, expect, test } from 'bun:test';

import type { HttpRequest, HttpTransport } from './http';
import { loadMyCommunities, searchConversations } from './share-directory';

/** Les deux lectures serveur de l'écran de partage (#10948) — la route juste, une ligne illisible écartée. */
const transportOf = (data: unknown, seen: HttpRequest[]): HttpTransport =>
  ({ request: async (request: HttpRequest) => (seen.push(request), { ok: true, data }) }) as unknown as HttpTransport;

describe('searchConversations', () => {
  test('interroge /conversations/search et écarte une ligne sans identifiant', async () => {
    const seen: HttpRequest[] = [];
    const result = await searchConversations({ source: 'gateway', transport: transportOf([{ id: 'c1', type: 'group', participants: [] }, { title: 'x' }], seen) }, 'lé on');
    expect(seen[0]?.path).toBe('/api/v1/conversations/search?q=l%C3%A9%20on');
    expect(result.ok && result.data.map((row) => row.id)).toEqual(['c1']);
  });
});

describe('loadMyCommunities', () => {
  test('lit /communities/mine : identifiant et nom, l’avatar s’il existe', async () => {
    const seen: HttpRequest[] = [];
    const result = await loadMyCommunities({ source: 'gateway', transport: transportOf([{ id: 'k1', name: 'Lyon Polyglotte', avatar: '' }, { id: 'k2' }], seen) });
    expect(seen[0]?.path).toBe('/api/v1/communities/mine');
    expect(result.ok && result.data).toEqual([{ id: 'k1', name: 'Lyon Polyglotte', avatar: null }]);
  });
});
