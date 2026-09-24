import { describe, expect, test } from 'bun:test';

import type { Credential } from '@/lib/api/http';

import { downloadFile, fileNameOf } from './download-file';

const REGISTERED: Credential = { kind: 'registered', token: 'jwt-1' };

function streamOf(chunks: readonly Uint8Array[]): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      const chunk = chunks[index];
      if (chunk === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(chunk);
      index += 1;
    },
  });
}

function responseOf(params: {
  readonly ok: boolean;
  readonly status: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: ReadableStream<Uint8Array> | null;
  readonly blob?: () => Promise<Blob>;
}): Response {
  const headers = new Headers(params.headers ?? {});
  return {
    ok: params.ok,
    status: params.status,
    headers,
    body: params.body ?? null,
    blob: params.blob ?? (async () => new Blob([])),
  } as unknown as Response;
}

describe('fileNameOf — le nom SERVI par la passerelle, ou un repli composé', () => {
  test('lit `Content-Disposition` quand la passerelle le sert', () => {
    expect(
      fileNameOf({ contentDisposition: 'attachment; filename="meeshy-m4.jpg"', fallbackMediaId: 'x', mimeType: null }),
    ).toBe('meeshy-m4.jpg');
  });

  test('sans en-tête, compose `meeshy-<mediaId><ext>` depuis la carte MIME', () => {
    expect(fileNameOf({ contentDisposition: null, fallbackMediaId: 'm4', mimeType: 'image/jpeg' })).toBe('meeshy-m4.jpg');
    expect(fileNameOf({ contentDisposition: null, fallbackMediaId: 'm9', mimeType: 'video/quicktime' })).toBe('meeshy-m9.mov');
    /* Le stand-in SVG des fixtures — jamais servi par la passerelle réelle. */
    expect(fileNameOf({ contentDisposition: null, fallbackMediaId: 'm3', mimeType: 'image/svg+xml' })).toBe('meeshy-m3.svg');
  });

  test('un `Content-Type` À PARAMÈTRES se lit par son essence (revue #7116)', () => {
    /* `Content-Type` est un type MIME, paramètres compris : la passerelle
       sert l'essence nue (`media-export.ts:178`), mais un mandataire peut y
       ajouter `; charset=…` — lu tel quel, le fichier livré perdait son
       extension et le système ne savait plus l'ouvrir. */
    expect(fileNameOf({ contentDisposition: null, fallbackMediaId: 'm4', mimeType: 'image/svg+xml;utf8' })).toBe('meeshy-m4.svg');
    expect(fileNameOf({ contentDisposition: null, fallbackMediaId: 'm5', mimeType: 'Video/MP4 ; codecs=avc1' })).toBe('meeshy-m5.mp4');
  });
});

describe('downloadFile — la progression, et une raison pour chaque absence', () => {
  const deps = (fetchImpl: typeof fetch) => ({ fetchImpl, credential: () => REGISTERED });

  test('un flux CHUNKÉ avec `Content-Length` annonce la progression EXACTE, puis rend `ready`', async () => {
    const total = 40;
    const chunks = [new Uint8Array(10), new Uint8Array(10), new Uint8Array(10), new Uint8Array(10)];
    const fetchImpl = (async () =>
      responseOf({ ok: true, status: 200, headers: { 'content-length': String(total), 'content-type': 'image/jpeg' }, body: streamOf(chunks) })) as unknown as typeof fetch;
    const progress: (number | null)[] = [];
    const result = await downloadFile({
      url: '/api/v1/posts/p/media/m4/export',
      fallbackMediaId: 'm4',
      deps: deps(fetchImpl),
      onProgress: (ratio) => progress.push(ratio),
    });
    expect(progress).toEqual([0.25, 0.5, 0.75, 1]);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.fileName).toBe('meeshy-m4.jpg');
  });

  test('sans `Content-Length`, la progression est INDÉTERMINÉE (`null`) puis `ready`', async () => {
    const fetchImpl = (async () =>
      responseOf({ ok: true, status: 200, headers: { 'content-type': 'image/jpeg' }, blob: async () => new Blob(['x']) })) as unknown as typeof fetch;
    const progress: (number | null)[] = [];
    const result = await downloadFile({
      url: '/x',
      fallbackMediaId: 'm4',
      deps: deps(fetchImpl),
      onProgress: (ratio) => progress.push(ratio),
    });
    expect(progress).toEqual([null]);
    expect(result.status).toBe('ready');
  });

  test('les en-têtes de crédential sont POSÉS sur la requête', async () => {
    let headersSeen: HeadersInit | undefined;
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
      headersSeen = init?.headers;
      return responseOf({ ok: true, status: 200, headers: { 'content-type': 'image/jpeg' } });
    }) as unknown as typeof fetch;
    await downloadFile({ url: '/x', fallbackMediaId: 'm4', deps: deps(fetchImpl), onProgress: () => {} });
    expect(headersSeen).toEqual({ Authorization: 'Bearer jwt-1' });
  });

  test('401/403 ⇒ `unavailable` « refused »', async () => {
    const fetchImpl = (async () => responseOf({ ok: false, status: 401 })) as unknown as typeof fetch;
    expect(await downloadFile({ url: '/x', fallbackMediaId: 'm4', deps: deps(fetchImpl), onProgress: () => {} })).toEqual({
      status: 'unavailable',
      reason: 'refused',
    });
    const fetchImpl403 = (async () => responseOf({ ok: false, status: 403 })) as unknown as typeof fetch;
    expect(await downloadFile({ url: '/x', fallbackMediaId: 'm4', deps: deps(fetchImpl403), onProgress: () => {} })).toEqual({
      status: 'unavailable',
      reason: 'refused',
    });
  });

  test('404 ⇒ `unavailable` « missing »', async () => {
    const fetchImpl = (async () => responseOf({ ok: false, status: 404 })) as unknown as typeof fetch;
    expect(await downloadFile({ url: '/x', fallbackMediaId: 'm4', deps: deps(fetchImpl), onProgress: () => {} })).toEqual({
      status: 'unavailable',
      reason: 'missing',
    });
  });

  test('un `fetch` qui lève (réseau tombé) ⇒ `offline`', async () => {
    const fetchImpl = (async () => {
      throw new Error('network down');
    }) as unknown as typeof fetch;
    expect(await downloadFile({ url: '/x', fallbackMediaId: 'm4', deps: deps(fetchImpl), onProgress: () => {} })).toEqual({
      status: 'offline',
    });
  });

  test('aucune identité présentée ⇒ `unavailable` « refused », sans requête', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return responseOf({ ok: true, status: 200 });
    }) as unknown as typeof fetch;
    const result = await downloadFile({
      url: '/x',
      fallbackMediaId: 'm4',
      deps: { fetchImpl, credential: () => null },
      onProgress: () => {},
    });
    expect(result).toEqual({ status: 'unavailable', reason: 'refused' });
    expect(called).toBe(false);
  });

  test('`signal.abort()` à mi-flux ⇒ `cancelled`, et le lecteur du flux est annulé', async () => {
    let cancelled = false;
    let resolveSecondRead: (() => void) | undefined;
    const reader = {
      read: async () => {
        if (!cancelled && resolveSecondRead === undefined) {
          return { done: false, value: new Uint8Array(10) };
        }
        await new Promise<void>((resolve) => {
          resolveSecondRead = resolve;
        });
        return { done: true, value: undefined };
      },
      cancel: async () => {
        cancelled = true;
        resolveSecondRead?.();
      },
    };
    const body = { getReader: () => reader } as unknown as ReadableStream<Uint8Array>;
    const fetchImpl = (async () =>
      responseOf({ ok: true, status: 200, headers: { 'content-length': '40' }, body })) as unknown as typeof fetch;
    const controller = new AbortController();
    const promise = downloadFile({
      url: '/x',
      fallbackMediaId: 'm4',
      deps: deps(fetchImpl),
      signal: controller.signal,
      onProgress: () => {
        controller.abort();
      },
    });
    const result = await promise;
    expect(result).toEqual({ status: 'cancelled' });
    expect(cancelled).toBe(true);
  });
});
