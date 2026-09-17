import { describe, expect, test } from 'bun:test';

import { uploadPostMedia, type PostMediaUploadParams } from './post-media-upload';

const REGISTERED = { kind: 'registered', token: 'jwt-abc' } as const;

type Recorded = { readonly method: string; readonly url: string; readonly headers: Record<string, string>; readonly body?: unknown };

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const headers = init?.headers;
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...(headers as Record<string, string> | undefined) };
}

function decodeMetadata(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const spaceIndex = pair.indexOf(' ');
    const key = pair.slice(0, spaceIndex);
    const value = pair.slice(spaceIndex + 1);
    out[key] = atob(value);
  }
  return out;
}

const file = (name: string, type: string, bytes: number[]): File => new File([new Uint8Array(bytes)], name, { type });

const baseParams = (overrides: Partial<PostMediaUploadParams> = {}): PostMediaUploadParams => ({
  base: 'https://gate.staging.meeshy.me',
  credential: () => REGISTERED,
  file: file('scene.png', 'image/png', [1, 2, 3, 4]),
  uploadContext: 'story',
  ...overrides,
});

describe('uploadPostMedia — création (§1.5, tus-handler.ts:298-354)', () => {
  test('POST /api/v1/uploads porte Tus-Resumable, Upload-Length, Upload-Metadata (base64) et le crédential', async () => {
    const recorded: Recorded[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      recorded.push({ method: init?.method ?? 'GET', url, headers: headersOf(init) });
      if (init?.method === 'POST') {
        return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      }
      return new Response(
        JSON.stringify({ success: true, data: { attachment: { id: 'pm-1', fileUrl: '2026/09/u1/scene.png', mimeType: 'image/png' } } }),
        { status: 200, headers: { 'Upload-Offset': '4' } },
      );
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl }));

    expect(result.ok).toBe(true);
    const create = recorded[0]!;
    expect(create.url).toBe('https://gate.staging.meeshy.me/api/v1/uploads');
    expect(create.headers['Tus-Resumable']).toBe('1.0.0');
    expect(create.headers['Upload-Length']).toBe('4');
    expect(create.headers.Authorization).toBe('Bearer jwt-abc');
    const metadata = decodeMetadata(create.headers['Upload-Metadata']!);
    expect(metadata).toEqual({ filename: 'scene.png', filetype: 'image/png', uploadcontext: 'story' });
  });

  test('thumbhash porté SEULEMENT quand fourni', async () => {
    const recorded: Recorded[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      recorded.push({ method: init?.method ?? 'GET', url: String(input), headers: headersOf(init) });
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response(
        JSON.stringify({ success: true, data: { attachment: { id: 'pm-1', fileUrl: 'k', mimeType: 'image/png' } } }),
        { status: 200, headers: { 'Upload-Offset': '4' } },
      );
    }) as typeof fetch;

    await uploadPostMedia(baseParams({ fetchImpl, thumbHash: 'abcd1234' }));
    const metadata = decodeMetadata(recorded[0]!.headers['Upload-Metadata']!);
    expect(metadata.thumbhash).toBe('abcd1234');

    recorded.length = 0;
    await uploadPostMedia(baseParams({ fetchImpl }));
    const withoutHash = decodeMetadata(recorded[0]!.headers['Upload-Metadata']!);
    expect('thumbhash' in withoutHash).toBe(false);
  });

  test('crédential invité ⇒ X-Session-Token, jamais Authorization (APIClient.swift:480-483)', async () => {
    const recorded: Recorded[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      recorded.push({ method: init?.method ?? 'GET', url: String(input), headers: headersOf(init) });
      return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
    }) as typeof fetch;

    await uploadPostMedia(
      baseParams({ fetchImpl, credential: () => ({ kind: 'anonymous', sessionToken: 'anon_x' }) }),
    );
    expect(recorded[0]!.headers['X-Session-Token']).toBe('anon_x');
    expect('Authorization' in recorded[0]!.headers).toBe(false);
  });

  test('413 (fichier trop lourd) ⇒ ApiResult non ok, sans lever, avec le texte du serveur', async () => {
    const fetchImpl = (async () => new Response('File too large. Max size for image: 0.1 GB\n', { status: 413 })) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ fetchImpl }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(413);
      expect(result.error).toContain('File too large');
    }
  });

  test('401 à la création ⇒ échec IMMÉDIAT, aucune tranche envoyée (pas de rafraîchissement côté web-v2)', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response('Authentication required\n', { status: 401 });
    }) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ fetchImpl }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
    expect(calls).toBe(1);
  });
});

describe('uploadPostMedia — tranches (§1.5, TusUploadManager.swift:288-520)', () => {
  test('un gros fichier part en PLUSIEURS PATCH, Upload-Offset progresse à chaque tranche', async () => {
    const bytes = Array.from({ length: 10 }, (_, i) => i);
    const recorded: Array<{ offset: string; bodyLength: number }> = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      const headers = headersOf(init);
      const body = init?.body as Uint8Array;
      recorded.push({ offset: headers['Upload-Offset']!, bodyLength: body.byteLength });
      const nextOffset = Number(headers['Upload-Offset']!) + body.byteLength;
      if (nextOffset >= 10) {
        return new Response(
          JSON.stringify({ success: true, data: { attachment: { id: 'pm-2', fileUrl: 'k', mimeType: 'image/png' } } }),
          { status: 200, headers: { 'Upload-Offset': String(nextOffset) } },
        );
      }
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(nextOffset) } });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, file: file('clip.mp4', 'video/mp4', bytes), chunkSize: 4 }));

    expect(result.ok).toBe(true);
    expect(recorded).toEqual([
      { offset: '0', bodyLength: 4 },
      { offset: '4', bodyLength: 4 },
      { offset: '8', bodyLength: 2 },
    ]);
  });

  test('409 (décalage divergent) ⇒ un HEAD relit Upload-Offset, la tranche REPRISE de là', async () => {
    const bytes = [1, 2, 3, 4, 5, 6];
    let patchCount = 0;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Upload-Offset': '4' } });
      patchCount += 1;
      const offset = Number(headersOf(init)['Upload-Offset']);
      if (patchCount === 1) {
        // La PREMIÈRE tranche divergeait déjà côté serveur : offset 0 refusé.
        return new Response(null, { status: 409 });
      }
      // La reprise doit repartir de l'offset SERVEUR (4), pas de 0.
      expect(offset).toBe(4);
      return new Response(
        JSON.stringify({ success: true, data: { attachment: { id: 'pm-3', fileUrl: 'k', mimeType: 'image/png' } } }),
        { status: 200, headers: { 'Upload-Offset': '6' } },
      );
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, file: file('a.mp4', 'video/mp4', bytes), chunkSize: 100 }));
    expect(result.ok).toBe(true);
    expect(patchCount).toBe(2);
  });

  test('404/410 (session TUS expirée) ⇒ une NOUVELLE création, l’envoi reprend à zéro', async () => {
    const bytes = [1, 2, 3, 4];
    let createCount = 0;
    let patchCount = 0;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        createCount += 1;
        return new Response(null, { status: 201, headers: { Location: `/api/v1/uploads/up-${createCount}` } });
      }
      patchCount += 1;
      if (patchCount === 1) return new Response('Upload not found\n', { status: 404 });
      return new Response(
        JSON.stringify({ success: true, data: { attachment: { id: 'pm-4', fileUrl: 'k', mimeType: 'image/png' } } }),
        { status: 200, headers: { 'Upload-Offset': '4' } },
      );
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, file: file('a.png', 'image/png', bytes), chunkSize: 100 }));
    expect(result.ok).toBe(true);
    expect(createCount).toBe(2);
  });

  test('400 (MIME déclaré ≠ octets réels, tus-handler.ts:393-399) ⇒ échec avec la raison du serveur', async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response('Declared MIME type does not match file content\n', { status: 400 });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, file: file('faux.png', 'image/png', [1, 2, 3, 4]), chunkSize: 100 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain('MIME');
    }
  });

  test('401 pendant les tranches ⇒ échec, sans retry (miroir de la création)', async () => {
    let patchCount = 0;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      patchCount += 1;
      return new Response('You do not own this upload\n', { status: 403 });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, file: file('a.png', 'image/png', [1, 2, 3, 4]), chunkSize: 100 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(patchCount).toBe(1);
  });

  test('réponse finale sans attachment exploitable ⇒ échec plutôt qu’un résultat inventé', async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { 'Upload-Offset': '4' } });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, file: file('a.png', 'image/png', [1, 2, 3, 4]), chunkSize: 100 }));
    expect(result.ok).toBe(false);
  });
});
