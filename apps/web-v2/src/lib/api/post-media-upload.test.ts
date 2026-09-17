import { describe, expect, test } from 'bun:test';

import { uploadPostMedia, type PostMediaUploadParams } from './post-media-upload';

const REGISTERED = { kind: 'registered', token: 'jwt-abc' } as const;

type Recorded = { readonly method: string; readonly url: string; readonly headers: Record<string, string> };

function headersOf(init: RequestInit | undefined): Record<string, string> {
  const headers = init?.headers;
  if (headers instanceof Headers) return Object.fromEntries(headers.entries());
  if (Array.isArray(headers)) return Object.fromEntries(headers);
  return { ...(headers as Record<string, string> | undefined) };
}

/** Le décodage que fait `@tus/utils` (`Metadata.js:35`) : base64 → octets →
 * UTF-8. Un encodage Latin-1 (`btoa` nu) y rendrait des caractères de
 * remplacement, jamais le nom d'origine. */
function decodeMetadata(raw: string): Record<string, string> {
  return Object.fromEntries(
    raw.split(',').map((pair) => {
      const spaceIndex = pair.indexOf(' ');
      return [pair.slice(0, spaceIndex), Buffer.from(pair.slice(spaceIndex + 1), 'base64').toString('utf8')];
    }),
  );
}

async function bodyBytes(init: RequestInit | undefined): Promise<number[]> {
  const body = init?.body;
  if (body instanceof Blob) return [...new Uint8Array(await body.arrayBuffer())];
  if (body instanceof Uint8Array) return [...body];
  throw new Error('corps de tranche inattendu');
}

const file = (name: string, type: string, bytes: number[]): File => new File([new Uint8Array(bytes)], name, { type });

const finalBody = (id: string) =>
  JSON.stringify({ success: true, data: { attachment: { id, fileUrl: '2026/09/u1/scene.png', mimeType: 'image/png' } } });

const baseParams = (overrides: Partial<PostMediaUploadParams> = {}): PostMediaUploadParams => ({
  source: 'gateway',
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
      recorded.push({ method: init?.method ?? 'GET', url: String(input), headers: headersOf(init) });
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response(finalBody('pm-1'), { status: 200, headers: { 'Upload-Offset': '4' } });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl }));

    expect(result.ok).toBe(true);
    const create = recorded[0]!;
    expect(create.url).toBe('https://gate.staging.meeshy.me/api/v1/uploads');
    expect(create.headers['Tus-Resumable']).toBe('1.0.0');
    expect(create.headers['Upload-Length']).toBe('4');
    expect(create.headers.Authorization).toBe('Bearer jwt-abc');
    expect(decodeMetadata(create.headers['Upload-Metadata']!)).toEqual({ filename: 'scene.png', filetype: 'image/png', uploadcontext: 'story' });
    expect(recorded[1]!.url).toBe('https://gate.staging.meeshy.me/api/v1/uploads/up-1');
  });

  test('un nom de fichier UTF-8 (accent, arabe) traverse tel quel — jamais une exception de btoa', async () => {
    const recorded: Recorded[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      recorded.push({ method: init?.method ?? 'GET', url: String(input), headers: headersOf(init) });
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response(finalBody('pm-1'), { status: 200, headers: { 'Upload-Offset': '4' } });
    }) as typeof fetch;

    const accented = await uploadPostMedia(baseParams({ fetchImpl, file: file('été.jpg', 'image/jpeg', [1, 2, 3, 4]) }));
    expect(accented.ok).toBe(true);
    expect(decodeMetadata(recorded[0]!.headers['Upload-Metadata']!).filename).toBe('été.jpg');

    recorded.length = 0;
    const arabic = await uploadPostMedia(baseParams({ fetchImpl, file: file('صورة.jpg', 'image/jpeg', [1, 2, 3, 4]) }));
    expect(arabic.ok).toBe(true);
    expect(decodeMetadata(recorded[0]!.headers['Upload-Metadata']!).filename).toBe('صورة.jpg');
  });

  test('thumbhash porté SEULEMENT quand fourni', async () => {
    const recorded: Recorded[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
      recorded.push({ method: init?.method ?? 'GET', url: String(input), headers: headersOf(init) });
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response(finalBody('pm-1'), { status: 200, headers: { 'Upload-Offset': '4' } });
    }) as typeof fetch;

    await uploadPostMedia(baseParams({ fetchImpl, thumbHash: 'abcd1234' }));
    expect(decodeMetadata(recorded[0]!.headers['Upload-Metadata']!).thumbhash).toBe('abcd1234');

    recorded.length = 0;
    await uploadPostMedia(baseParams({ fetchImpl }));
    expect('thumbhash' in decodeMetadata(recorded[0]!.headers['Upload-Metadata']!)).toBe(false);
  });

  test('un INVITÉ est refusé AVANT le premier octet (tus-handler.ts:326-333) — aucun appel réseau', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(null, { status: 201 });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, credential: () => ({ kind: 'anonymous', sessionToken: 'anon_x' }) }));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(403);
      expect(result.code).toBe('POST_MEDIA_REQUIRES_ACCOUNT');
    }
    expect(calls).toBe(0);
  });

  test('sans session ⇒ 401 sans appel réseau', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ fetchImpl, credential: () => null }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(401);
    expect(calls).toBe(0);
  });

  test('un fichier VIDE est refusé sans créer de session serveur', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ fetchImpl, file: file('vide.png', 'image/png', []) }));
    expect(result.ok).toBe(false);
    expect(calls).toBe(0);
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

describe('uploadPostMedia — les pannes sont des VALEURS, jamais des exceptions', () => {
  test('un fetch qui LÈVE (réseau coupé) ⇒ status 0, sans rejeter la promesse', async () => {
    const fetchImpl = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ fetchImpl }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(0);
  });

  test('une coupure PENDANT les tranches ⇒ status 0, sans rejeter', async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ fetchImpl }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(0);
  });

  test('un signal ANNULÉ ⇒ code ABORTED, sans rejeter', async () => {
    const controller = new AbortController();
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      controller.abort();
      if (init?.signal?.aborted === true) throw new DOMException('aborted', 'AbortError');
      return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
    }) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ fetchImpl, signal: controller.signal }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('ABORTED');
  });
});

describe('uploadPostMedia — tranches (§1.5, TusUploadManager.swift:288-520)', () => {
  test('un gros fichier part en PLUSIEURS PATCH, Upload-Offset progresse, chaque corps porte SES octets', async () => {
    const bytes = Array.from({ length: 10 }, (_, i) => i);
    const recorded: Array<{ offset: string; body: number[]; contentType: string }> = [];
    const progress: number[] = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      const headers = headersOf(init);
      const body = await bodyBytes(init);
      recorded.push({ offset: headers['Upload-Offset']!, body, contentType: headers['Content-Type']! });
      const nextOffset = Number(headers['Upload-Offset']!) + body.length;
      if (nextOffset >= 10) return new Response(finalBody('pm-2'), { status: 200, headers: { 'Upload-Offset': String(nextOffset) } });
      return new Response(null, { status: 204, headers: { 'Upload-Offset': String(nextOffset) } });
    }) as typeof fetch;

    const result = await uploadPostMedia(
      baseParams({ fetchImpl, file: file('clip.mp4', 'video/mp4', bytes), chunkSize: 4, onProgress: (fraction) => progress.push(fraction) }),
    );

    expect(result.ok).toBe(true);
    expect(recorded).toEqual([
      { offset: '0', body: [0, 1, 2, 3], contentType: 'application/offset+octet-stream' },
      { offset: '4', body: [4, 5, 6, 7], contentType: 'application/offset+octet-stream' },
      { offset: '8', body: [8, 9], contentType: 'application/offset+octet-stream' },
    ]);
    expect(progress).toEqual([0.4, 0.8, 1]);
  });

  test('409 (décalage divergent) ⇒ un HEAD relit Upload-Offset, la tranche REPRISE de là avec les octets de là', async () => {
    const bytes = [1, 2, 3, 4, 5, 6];
    const patches: Array<{ offset: number; body: number[] }> = [];
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'Upload-Offset': '4' } });
      patches.push({ offset: Number(headersOf(init)['Upload-Offset']), body: await bodyBytes(init) });
      if (patches.length === 1) return new Response(null, { status: 409 });
      return new Response(finalBody('pm-3'), { status: 200, headers: { 'Upload-Offset': '6' } });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, file: file('a.mp4', 'video/mp4', bytes), chunkSize: 100 }));
    expect(result.ok).toBe(true);
    expect(patches).toEqual([
      { offset: 0, body: [1, 2, 3, 4, 5, 6] },
      { offset: 4, body: [5, 6] },
    ]);
  });

  test('409 puis un HEAD SANS Upload-Offset ⇒ échec TUS_OFFSET_UNKNOWN, jamais une boucle', async () => {
    let patches = 0;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      if (init?.method === 'HEAD') return new Response(null, { status: 200 });
      patches += 1;
      return new Response(null, { status: 409 });
    }) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ fetchImpl, chunkSize: 100 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TUS_OFFSET_UNKNOWN');
    expect(patches).toBe(1);
  });

  test('404/410 (session TUS expirée) ⇒ UNE nouvelle création, l’envoi reprend à zéro ; un second 404 ⇒ TUS_SESSION_LOST', async () => {
    let createCount = 0;
    let patchCount = 0;
    const recovering = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        createCount += 1;
        return new Response(null, { status: 201, headers: { Location: `/api/v1/uploads/up-${createCount}` } });
      }
      patchCount += 1;
      if (patchCount === 1) return new Response('Upload not found\n', { status: 404 });
      return new Response(finalBody('pm-4'), { status: 200, headers: { 'Upload-Offset': '4' } });
    }) as typeof fetch;

    const recovered = await uploadPostMedia(baseParams({ fetchImpl: recovering, chunkSize: 100 }));
    expect(recovered.ok).toBe(true);
    expect(createCount).toBe(2);

    createCount = 0;
    const lost = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        createCount += 1;
        return new Response(null, { status: 201, headers: { Location: `/api/v1/uploads/up-${createCount}` } });
      }
      return new Response('Upload expired\n', { status: 410 });
    }) as typeof fetch;
    const failed = await uploadPostMedia(baseParams({ fetchImpl: lost, chunkSize: 100 }));
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.code).toBe('TUS_SESSION_LOST');
    expect(createCount).toBe(2);
  });

  test('400 (MIME déclaré ≠ octets réels, tus-handler.ts:393-399) ⇒ échec avec la raison du serveur', async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response('Declared MIME type does not match file content\n', { status: 400 });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, chunkSize: 100 }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toContain('MIME');
    }
  });

  test('403 pendant les tranches (« You do not own this upload ») ⇒ échec, sans retry', async () => {
    let patchCount = 0;
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      patchCount += 1;
      return new Response('You do not own this upload\n', { status: 403 });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, chunkSize: 100 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
    expect(patchCount).toBe(1);
  });

  test('réponse finale sans attachment exploitable ⇒ échec plutôt qu’un résultat inventé', async () => {
    const fetchImpl = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { 'Upload-Offset': '4' } });
    }) as typeof fetch;

    const result = await uploadPostMedia(baseParams({ fetchImpl, chunkSize: 100 }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe('TUS_FINISH_UNREADABLE');
  });
});

describe('uploadPostMedia — la source fixtures ne touche jamais le réseau', () => {
  test('source fixtures ⇒ un PostMedia simulé, aucun fetch', async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return new Response(null, { status: 500 });
    }) as typeof fetch;
    const result = await uploadPostMedia(baseParams({ source: 'fixtures', fetchImpl }));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.postMediaId.startsWith('fx-pm-')).toBe(true);
      expect(result.data.mimeType).toBe('image/png');
    }
    expect(calls).toBe(0);
  });
});
