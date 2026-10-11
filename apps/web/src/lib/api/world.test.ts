import { describe, expect, test } from 'bun:test';

import { WORLD_CONVERSATION_TITLE, worldEntrySchema } from '@meeshy/shared/types/world';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { decodeWorldEntry, loadWorldEntry, WORLD_FALLBACK_TITLE } from './world';

function fakeTransport(result: ApiResult<unknown>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => result) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return result;
  }) as HttpTransport['request'];
  return { transport, requests };
}

const SERVED = { identifier: 'world', title: 'World Wide', shareLinkIdentifier: 'mshy_world', memberCount: 199, memberCountCapped: true };

describe('decodeWorldEntry — jumelle zod/mini de worldEntrySchema', () => {
  const samples: readonly unknown[] = [
    SERVED,
    { ...SERVED, memberCountCapped: undefined },
    { ...SERVED, memberCount: 0 },
    { ...SERVED, memberCount: -1 },
    { ...SERVED, memberCount: 1.5 },
    { ...SERVED, shareLinkIdentifier: '' },
    { ...SERVED, memberCountCapped: false },
    { identifier: 'world' },
    null,
    'world',
  ];

  test('accepte et refuse exactement ce que le schéma partagé accepte et refuse', () => {
    for (const sample of samples) {
      const shared = worldEntrySchema.safeParse(sample);
      expect(decodeWorldEntry(sample)).toEqual(shared.success ? shared.data : null);
    }
  });
});

test('le titre de repli est la jumelle de WORLD_CONVERSATION_TITLE', () => {
  expect(WORLD_FALLBACK_TITLE).toBe(WORLD_CONVERSATION_TITLE);
});

describe('loadWorldEntry — GET /api/v1/world', () => {
  test('lit l’adresse publique, sans aucune créance', async () => {
    const { transport, requests } = fakeTransport({ ok: true, data: SERVED });
    const result = await loadWorldEntry({ source: 'gateway', transport });
    expect(requests.map((r) => [r.method, r.path, r.credential])).toEqual([['GET', '/api/v1/world', null]]);
    expect(result).toEqual({ ok: true, data: SERVED });
  });

  test('une entrée fermée traverse avec son code', async () => {
    const { transport } = fakeTransport({ ok: false, status: 404, error: 'fermé', code: 'WORLD_UNAVAILABLE' });
    const result = await loadWorldEntry({ source: 'gateway', transport });
    expect(!result.ok && result.code).toBe('WORLD_UNAVAILABLE');
  });

  test('une charge illisible est un échec nommé', async () => {
    const { transport } = fakeTransport({ ok: true, data: { identifier: 'world' } });
    const result = await loadWorldEntry({ source: 'gateway', transport });
    expect(!result.ok && result.code).toBe('UNREADABLE_WORLD_ENTRY');
  });
});
