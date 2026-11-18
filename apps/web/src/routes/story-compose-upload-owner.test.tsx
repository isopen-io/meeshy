import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import * as uploadsEndpoints from '@meeshy/shared/api/endpoints/uploads';

import { currentCredential } from '@/lib/api/client';
import { sessionStore } from '@/lib/api/session';
import { flush, harness, image, mount, registerStudioBench, selectFile } from '@/test-support/story-studio-bench';

/**
 * Audit #19352 (X1), la classe entière : un téléversement par reprise que le studio lance pour l'auteur est une
 * opération en plusieurs requêtes (création, puis tranches). Si un autre onglet fait passer l'appareil à un autre
 * compte entre deux requêtes, aucune tranche ne part avec le jeton de ce compte.
 */
registerStudioBench();

describe('le média que l’auteur pose dans le studio monte sous SON compte, jusqu’au bout (audit #19352, X1)', () => {
  test('l’appareil passe à Bob après la création : aucune tranche ne présente le jeton de Bob', async () => {
    const sent: Array<{ readonly method: string; readonly auth: string | null }> = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({ method: init?.method ?? 'GET', auth: new Headers(init?.headers).get('Authorization') });
      if (init?.method === 'POST') {
        act(() => {
          sessionStore.getState().establish({ user: { id: 'u-bob', username: 'bob' }, token: 'jwt-bob', sessionToken: 'sess-bob', expiresIn: 3600 });
        });
        return new Response(null, { status: 201, headers: { Location: uploadsEndpoints.byWildcard('up-1') } });
      }
      return new Response(JSON.stringify({ success: true, data: { attachment: { id: 'pm-1', fileUrl: 'f.jpg', mimeType: 'image/jpeg' } } }), {
        status: 200,
        headers: { 'Upload-Offset': '3' },
      });
    }) as typeof fetch;
    const bench = harness({});
    const el = mount({ ...bench.deps, upload: { source: 'gateway', base: 'https://gate.test', credential: currentCredential, fetchImpl } }, 'STORY');

    selectFile(el, 'visual', image());
    await flush(() => sent.length >= 2);
    await flush();

    expect(sent.length).toBeGreaterThan(0);
    expect(sent.filter((request) => request.auth === 'Bearer jwt-bob')).toEqual([]);
  });
});
