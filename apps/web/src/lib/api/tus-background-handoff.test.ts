import { describe, expect, test } from 'bun:test';

import { fakeIndexedDb, type FakeIndexedDb } from '@/lib/share-incoming/idb-double';

import { uploadPostMedia, type PostMediaUploadParams } from './post-media-upload';
import { backgroundFetchIdOf, type BackgroundUploadPort, type BackgroundUploadStart, type PageVisibility } from './tus-background';
import { TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_STORE_NAME, idbTusCheckpointStore, tusFingerprint, type TusCheckpoint } from './tus-checkpoint';

const BASE = 'https://gate.staging.meeshy.me';
const REGISTERED = { kind: 'registered', token: 'jwt-abc' } as const;
const BYTES = [10, 11, 12, 13, 14, 15];
const FINISHED = { postMediaId: 'pm-bg', fileUrl: 'a/b.png', mimeType: 'image/png' } as const;

const picture = (): File => new File([new Uint8Array(BYTES)], 'scene.png', { type: 'image/png', lastModified: 1_700_000_000_000 });
const fingerprint = (): string => tusFingerprint({ base: BASE, uploadContext: 'story', file: picture() });
const rows = (idb: FakeIndexedDb): ReadonlyMap<string, unknown> => idb.rowsOf(TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_STORE_NAME);

function tusServer() {
  const sessions = new Map<string, { offset: number; length: number }>();
  const methods: string[] = [];
  let created = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.signal?.aborted === true) throw new DOMException('aborted', 'AbortError');
    const method = init?.method ?? 'GET';
    methods.push(method);
    const headers = new Headers(init?.headers as HeadersInit);
    const body = init?.body instanceof Blob ? init.body.size : 0;
    if (method === 'POST') {
      created += 1;
      sessions.set(`up-${created}`, { offset: 0, length: Number(headers.get('Upload-Length')) });
      return new Response(null, { status: 201, headers: { Location: `/api/v1/uploads/up-${created}` } });
    }
    const session = sessions.get(String(input).slice(String(input).lastIndexOf('/') + 1));
    if (session === undefined) return new Response('gone', { status: 404 });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'Upload-Offset': String(session.offset) } });
    session.offset += body;
    if (session.offset >= session.length) {
      return new Response(JSON.stringify({ success: true, data: { attachment: { id: 'pm-fg', fileUrl: 'a/b.png', mimeType: 'image/png' } } }), {
        status: 200,
        headers: { 'Upload-Offset': String(session.offset) },
      });
    }
    return new Response(null, { status: 204, headers: { 'Upload-Offset': String(session.offset) } });
  }) as typeof fetch;
  return { fetchImpl, sessions, methods };
}

function visibility() {
  const listeners = new Set<() => void>();
  const api: PageVisibility = { onHidden: (listener) => (listeners.add(listener), () => void listeners.delete(listener)) };
  return { api, hide: () => listeners.forEach((listener) => listener()), count: () => listeners.size };
}

/** Un port de Background Fetch que le témoin pilote : `settleWith` joue le worker qui rend la main. */
function fakePort(options: { readonly accepts?: boolean; readonly running?: boolean; readonly reaches?: boolean } = {}) {
  const started: BackgroundUploadStart[] = [];
  let before: (start: BackgroundUploadStart) => void | Promise<void> = () => undefined;
  let effect: () => Promise<void> | void = () => undefined;
  const port: BackgroundUploadPort = {
    start: async (start) => {
      started.push(start);
      await before(start);
      return options.accepts !== false;
    },
    reaches: () => options.reaches !== false,
    isRunning: async () => options.running === true,
    settled: async () => {
      await effect();
    },
  };
  return {
    port,
    started,
    settleWith: (work: () => Promise<void> | void) => {
      effect = work;
    },
    beforeStart: (hook: (start: BackgroundUploadStart) => void | Promise<void>) => {
      before = hook;
    },
  };
}

const paramsOf = (idb: FakeIndexedDb, overrides: Partial<PostMediaUploadParams> = {}): PostMediaUploadParams => ({
  source: 'gateway',
  base: BASE,
  credential: () => REGISTERED,
  file: picture(),
  uploadContext: 'story',
  chunkSize: 2,
  checkpoints: idbTusCheckpointStore(idb.factory),
  ...overrides,
});

/** Cache la page au moment où la deuxième tranche part : la tranche en vol est annulée. */
function hidingOnSecondPatch(server: ReturnType<typeof tusServer>, page: ReturnType<typeof visibility>): typeof fetch {
  let patches = 0;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      patches += 1;
      if (patches === 2) page.hide();
    }
    return server.fetchImpl(input, init);
  }) as typeof fetch;
}

describe('uploadPostMedia — la page passe à l’arrière-plan (Background Fetch)', () => {
  test('la tranche en vol est annulée, l’offset relu par HEAD, et le RESTE part en un envoi de fond', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();
    const page = visibility();
    const background = fakePort();
    let markerAtStart: unknown;
    background.beforeStart((start) => {
      markerAtStart = (rows(idb).get(fingerprint()) as TusCheckpoint | undefined)?.background;
      expect(start.offset).toBe(2);
    });
    background.settleWith(async () => {
      server.sessions.get('up-1')!.offset = 6;
      const found = rows(idb).get(fingerprint()) as TusCheckpoint;
      await idbTusCheckpointStore(idb.factory).save({ ...found, offset: 6, background: undefined, finished: FINISHED });
    });

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: hidingOnSecondPatch(server, page), background: background.port, visibility: page.api }));

    expect(result).toEqual({ ok: true, data: FINISHED });
    expect(server.methods).toEqual(['POST', 'PATCH', 'HEAD']);
    expect(background.started).toHaveLength(1);
    expect(background.started[0]).toMatchObject({
      fingerprint: fingerprint(),
      location: `${BASE}/api/v1/uploads/up-1`,
      offset: 2,
      title: 'Meeshy · scene.png',
      headers: { Authorization: 'Bearer jwt-abc', 'Tus-Resumable': '1.0.0', 'Upload-Offset': '2', 'Content-Type': 'application/offset+octet-stream' },
    });
    expect(markerAtStart).toBe(backgroundFetchIdOf(fingerprint()));
    expect(rows(idb).size).toBe(0);
    expect(page.count()).toBe(0);
  });

  test('le navigateur refuse l’envoi de fond : l’envoi continue au premier plan depuis l’offset servi', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();
    const page = visibility();
    const background = fakePort({ accepts: false });

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: hidingOnSecondPatch(server, page), background: background.port, visibility: page.api }));

    expect(result).toMatchObject({ ok: true, data: { postMediaId: 'pm-fg' } });
    expect(server.methods).toEqual(['POST', 'PATCH', 'HEAD', 'PATCH', 'PATCH']);
    expect((rows(idb).get(fingerprint()) as TusCheckpoint | undefined)?.background).toBeUndefined();
  });

  test('l’envoi de fond échoue : au retour, l’envoi reprend au premier plan là où la passerelle en est', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();
    const page = visibility();
    const background = fakePort();
    background.settleWith(async () => {
      const found = rows(idb).get(fingerprint()) as TusCheckpoint;
      await idbTusCheckpointStore(idb.factory).save({ ...found, background: undefined });
    });

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: hidingOnSecondPatch(server, page), background: background.port, visibility: page.api }));

    expect(result).toMatchObject({ ok: true, data: { postMediaId: 'pm-fg' } });
    expect(server.methods.filter((method) => method === 'POST')).toHaveLength(1);
  });

  test('sans Background Fetch (Safari, WebView) : la page cachée n’interrompt rien', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();
    const page = visibility();

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: hidingOnSecondPatch(server, page), background: null, visibility: page.api }));

    expect(result).toMatchObject({ ok: true, data: { postMediaId: 'pm-fg' } });
    expect(server.methods).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH']);
    expect(page.count()).toBe(0);
  });

  test('une passerelle d’une AUTRE origine (pré-vol CORS refusé par Background Fetch) : la page cachée n’annule rien et l’envoi reste au premier plan', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();
    const page = visibility();
    const background = fakePort({ reaches: false });

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: hidingOnSecondPatch(server, page), background: background.port, visibility: page.api }));

    expect(result).toMatchObject({ ok: true, data: { postMediaId: 'pm-fg' } });
    expect(server.methods).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH']);
    expect(background.started).toHaveLength(0);
    expect(rows(idb).size).toBe(0);
    expect(page.count()).toBe(0);
  });

  test('une annulation de l’appelant n’est PAS prise pour un passage en arrière-plan', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();
    const page = visibility();
    const background = fakePort();
    const controller = new AbortController();
    const aborting = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') controller.abort();
      return server.fetchImpl(input, init);
    }) as typeof fetch;

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: aborting, background: background.port, visibility: page.api, signal: controller.signal }));

    expect(result).toMatchObject({ ok: false, code: 'ABORTED' });
    expect(background.started).toHaveLength(0);
  });
});

describe('uploadPostMedia — le retour après un envoi de fond', () => {
  const rowOf = (overrides: Partial<TusCheckpoint>): TusCheckpoint => ({
    location: `${BASE}/api/v1/uploads/up-1`,
    offset: 2,
    fileSize: 6,
    fingerprint: fingerprint(),
    savedAt: Date.now(),
    ...overrides,
  });

  test('le worker a fini pendant l’absence : le média est rendu sans AUCUN appel réseau, et la ligne part', async () => {
    const idb = fakeIndexedDb();
    await idbTusCheckpointStore(idb.factory).save(rowOf({ offset: 6, finished: FINISHED }));
    const server = tusServer();

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl, background: null }));

    expect(result).toEqual({ ok: true, data: FINISHED });
    expect(server.methods).toEqual([]);
    expect(rows(idb).size).toBe(0);
  });

  test('l’envoi de fond tourne encore : on l’attend, puis on rend son média sans appel réseau', async () => {
    const idb = fakeIndexedDb();
    await idbTusCheckpointStore(idb.factory).save(rowOf({ background: backgroundFetchIdOf(fingerprint()) }));
    const server = tusServer();
    const background = fakePort({ running: true });
    background.settleWith(async () => {
      await idbTusCheckpointStore(idb.factory).save(rowOf({ offset: 6, finished: FINISHED }));
    });
    const waiting = uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl, background: background.port }));

    expect(await waiting).toEqual({ ok: true, data: FINISHED });
    expect(server.methods).toEqual([]);
  });

  test('une ligne « finie » plus vieille que la durée de vie est écartée comme tout checkpoint', async () => {
    const idb = fakeIndexedDb();
    await idbTusCheckpointStore(idb.factory).save(rowOf({ offset: 6, finished: FINISHED, savedAt: 1 }));
    const server = tusServer();

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl, background: null, now: () => 5_000_000_000 }));

    expect(result).toMatchObject({ ok: true, data: { postMediaId: 'pm-fg' } });
    expect(server.methods[0]).toBe('POST');
  });
});
