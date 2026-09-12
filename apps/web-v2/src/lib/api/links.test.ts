import { describe, expect, test } from 'bun:test';

import type { ApiResult, HttpTransport } from './http';
import { createShareLink, shareLinkUrl } from './links';

function fakeTransport(result: ApiResult<unknown>): HttpTransport & { lastRequest?: unknown } {
  const transport = (async () => result) as unknown as HttpTransport & { lastRequest?: unknown };
  transport.request = (async (req) => {
    transport.lastRequest = req;
    return result;
  }) as HttpTransport['request'];
  return transport;
}

describe('createShareLink — POST /api/v1/links (§ 3.3)', () => {
  test('en fixtures, rend un succès sans réseau', async () => {
    const result = await createShareLink({ source: 'fixtures', transport: fakeTransport({ ok: false, status: 0, error: 'jamais appelé' }) }, 'c-1');
    expect(result.ok).toBe(true);
  });

  test('en gateway, appelle POST /api/v1/links avec allowViewHistory EXPLICITE à false', async () => {
    const transport = fakeTransport({ ok: true, data: { linkId: 'mshy_1', conversationId: 'c-1', shareLink: { id: 'l1', linkId: 'mshy_1', isActive: true } } });
    await createShareLink({ source: 'gateway', transport }, 'c-1');
    const req = transport.lastRequest as { readonly method: string; readonly path: string; readonly body: Record<string, unknown> };
    expect(req.method).toBe('POST');
    expect(req.path).toBe('/api/v1/links');
    expect(req.body.conversationId).toBe('c-1');
    expect(req.body.allowViewHistory).toBe(false);
  });

  test('un refus (410/403) reste un échec, jamais un lien fabriqué', async () => {
    const transport = fakeTransport({ ok: false, status: 403, error: 'Cannot create share links for direct conversations' });
    const result = await createShareLink({ source: 'gateway', transport }, 'c-direct');
    expect(result.ok).toBe(false);
  });
});

describe('shareLinkUrl', () => {
  test('compose ${origin}/chat/${linkId}', () => {
    expect(shareLinkUrl('https://staging.meeshy.me', 'mshy_abc')).toBe('https://staging.meeshy.me/chat/mshy_abc');
  });
});
