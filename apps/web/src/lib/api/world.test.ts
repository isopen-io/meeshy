import { describe, expect, test } from 'bun:test';

import { WORLD_CONVERSATION_TITLE, worldEntrySchema } from '@meeshy/shared/types/world';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import { loadWorldEntry, WORLD_FALLBACK_TITLE } from './world';

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

test('le titre de repli est celui que le serveur sème', () => {
  expect(WORLD_FALLBACK_TITLE).toBe(WORLD_CONVERSATION_TITLE);
});

describe('le décodage de GET /world est celui du schéma partagé (#10038)', () => {
  const samples: readonly unknown[] = [
    SERVED,
    { ...SERVED, memberCountCapped: undefined },
    { ...SERVED, memberCount: 0 },
    { ...SERVED, memberCount: -1 },
    { ...SERVED, memberCount: 1.5 },
    { ...SERVED, shareLinkIdentifier: '' },
    { ...SERVED, memberCountCapped: false },
    { ...SERVED, avatar: 'https://cdn.meeshy.me/world/avatar.png', banner: 'https://cdn.meeshy.me/world/banner.png' },
    { identifier: 'world', title: 'World Wide', shareLinkIdentifier: 'mshy_world' },
    { identifier: 'world' },
    null,
    'world',
  ];

  test('accepte et refuse exactement ce que worldEntrySchema accepte et refuse', async () => {
    for (const sample of samples) {
      const shared = worldEntrySchema.safeParse(sample);
      const { transport } = fakeTransport({ ok: true, data: sample });
      const result = await loadWorldEntry({ source: 'gateway', transport });
      expect(result.ok ? result.data : null).toEqual(shared.success ? shared.data : null);
    }
  });

  test('l’avatar et la bannière servis traversent (#10204)', async () => {
    const served = { ...SERVED, avatar: 'https://cdn.meeshy.me/world/avatar.png', banner: 'https://cdn.meeshy.me/world/banner.png' };
    const { transport } = fakeTransport({ ok: true, data: served });
    const result = await loadWorldEntry({ source: 'gateway', transport });
    expect(result.ok && [result.data.avatar, result.data.banner]).toEqual([served.avatar, served.banner]);
  });
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

test('en fixtures : l’entrée se lit sans requête, sur un lien ouvert aux invités du corpus', async () => {
  const { transport, requests } = fakeTransport({ ok: false, status: 0, error: 'jamais appelé' });
  const result = await loadWorldEntry({ source: 'fixtures', transport });
  expect(requests).toEqual([]);
  expect(result.ok && result.data.shareLinkIdentifier).toBe('mshy_equipe-deploiement_7f3a');
});
