import { describe, expect, test } from 'bun:test';

import { fakeIndexedDb, type FakeIndexedDb } from '@/lib/share-incoming/idb-double';

import { uploadPostMedia, type PostMediaUploadParams } from './post-media-upload';
import { TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_MAX_AGE_MS, TUS_CHECKPOINT_STORE_NAME, idbTusCheckpointStore, tusFingerprint, type TusCheckpoint } from './tus-checkpoint';

const BASE = 'https://gate.staging.meeshy.me';
const REGISTERED = { kind: 'registered', token: 'jwt-abc' } as const;
const BYTES = [10, 11, 12, 13, 14, 15];

type Call = { readonly method: string; readonly url: string; readonly offsetHeader: string | null; readonly bytes: number[] };

/** Une passerelle TUS minimale, qui SURVIT aux pages : ses sessions restent quand le client « recharge ». */
function tusServer(options: { readonly dropAfterPatches?: number } = {}) {
  const sessions = new Map<string, { offset: number; length: number }>();
  const calls: Call[] = [];
  let created = 0;
  let patches = 0;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const headers = new Headers(init?.headers as HeadersInit);
    const url = String(input);
    const body = init?.body instanceof Blob ? [...new Uint8Array(await init.body.arrayBuffer())] : [];
    calls.push({ method, url, offsetHeader: headers.get('Upload-Offset'), bytes: body });
    if (method === 'POST') {
      created += 1;
      const id = `up-${created}`;
      sessions.set(id, { offset: 0, length: Number(headers.get('Upload-Length')) });
      return new Response(null, { status: 201, headers: { Location: `/api/v1/uploads/${id}` } });
    }
    const session = sessions.get(url.slice(url.lastIndexOf('/') + 1));
    if (session === undefined) return new Response('gone', { status: 404 });
    if (method === 'HEAD') return new Response(null, { status: 200, headers: { 'Upload-Offset': String(session.offset) } });
    patches += 1;
    if (options.dropAfterPatches !== undefined && patches > options.dropAfterPatches) throw new TypeError('network down');
    session.offset += body.length;
    if (session.offset >= session.length) {
      return new Response(JSON.stringify({ success: true, data: { attachment: { id: 'pm-1', fileUrl: 'a/b.png', mimeType: 'image/png' } } }), {
        status: 200,
        headers: { 'Upload-Offset': String(session.offset) },
      });
    }
    return new Response(null, { status: 204, headers: { 'Upload-Offset': String(session.offset) } });
  }) as typeof fetch;
  return { fetchImpl, calls, sessions, methods: () => calls.map((call) => call.method) };
}

const picture = (): File => new File([new Uint8Array(BYTES)], 'scene.png', { type: 'image/png', lastModified: 1_700_000_000_000 });

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

const fingerprintOfPicture = (): string => tusFingerprint({ base: BASE, uploadContext: 'story', file: picture() });
const rows = (idb: FakeIndexedDb): ReadonlyMap<string, unknown> => idb.rowsOf(TUS_CHECKPOINT_DB_NAME, TUS_CHECKPOINT_STORE_NAME);
const savedRow = (idb: FakeIndexedDb): TusCheckpoint => rows(idb).get(fingerprintOfPicture()) as TusCheckpoint;

describe('uploadPostMedia — le checkpoint suit l’envoi', () => {
  test('{location, offset, fingerprint} est écrit après la création puis après chaque tranche, et effacé à la fin', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();
    const seen: number[] = [];
    const watching = idbTusCheckpointStore(idb.factory);
    const store = { ...watching, save: async (checkpoint: TusCheckpoint) => (seen.push(checkpoint.offset), watching.save(checkpoint)) };

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl, checkpoints: store }));

    expect(result.ok).toBe(true);
    expect(seen).toEqual([0, 2, 4]);
    expect(rows(idb).size).toBe(0);
  });

  test('le checkpoint porte l’adresse de la session, l’offset accepté, la taille et l’empreinte', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer({ dropAfterPatches: 2 });

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl }));

    expect(result.ok).toBe(false);
    expect(savedRow(idb)).toMatchObject({ location: `${BASE}/api/v1/uploads/up-1`, offset: 4, fileSize: 6, fingerprint: fingerprintOfPicture() });
  });
});

describe('uploadPostMedia — la reprise après rechargement', () => {
  test('la page suivante ne crée rien : HEAD puis PATCH depuis l’offset servi, avec les octets de là', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer({ dropAfterPatches: 2 });
    await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl }));
    const before = server.calls.length;
    const reloaded = tusServer();
    reloaded.sessions.set('up-1', { offset: 4, length: 6 });

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: reloaded.fetchImpl }));

    expect(before).toBeGreaterThan(0);
    expect(result).toMatchObject({ ok: true, data: { postMediaId: 'pm-1' } });
    expect(reloaded.methods()).toEqual(['HEAD', 'PATCH']);
    expect(reloaded.calls[1]).toMatchObject({ offsetHeader: '4', bytes: [14, 15] });
    expect(rows(idb).size).toBe(0);
  });

  test('l’offset du SERVEUR fait foi sur celui du checkpoint', async () => {
    const idb = fakeIndexedDb();
    const reloaded = tusServer();
    reloaded.sessions.set('up-1', { offset: 2, length: 6 });
    await idbTusCheckpointStore(idb.factory).save({ location: `${BASE}/api/v1/uploads/up-1`, offset: 4, fileSize: 6, fingerprint: fingerprintOfPicture(), savedAt: Date.now() });

    await uploadPostMedia(paramsOf(idb, { fetchImpl: reloaded.fetchImpl }));

    expect(reloaded.calls[1]).toMatchObject({ method: 'PATCH', offsetHeader: '2', bytes: [12, 13] });
  });

  test('une session que la passerelle a oubliée (HEAD 404) : checkpoint purgé, nouvelle création, envoi complet', async () => {
    const idb = fakeIndexedDb();
    await idbTusCheckpointStore(idb.factory).save({ location: `${BASE}/api/v1/uploads/up-9`, offset: 4, fileSize: 6, fingerprint: fingerprintOfPicture(), savedAt: Date.now() });
    const server = tusServer();

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl }));

    expect(result.ok).toBe(true);
    expect(server.methods()).toEqual(['HEAD', 'POST', 'PATCH', 'PATCH', 'PATCH']);
    expect(server.calls[2]).toMatchObject({ offsetHeader: '0', bytes: [10, 11] });
  });

  const discarded: ReadonlyArray<readonly [string, (now: number) => TusCheckpoint]> = [
    ['plus vieux que la durée de vie', (now: number) => checkpointFor({ savedAt: now - TUS_CHECKPOINT_MAX_AGE_MS - 1 })],
    ['d’une autre taille de fichier', (now: number) => checkpointFor({ savedAt: now, fileSize: 7 })],
    ['déjà envoyé en entier (fin perdue)', (now: number) => checkpointFor({ savedAt: now, offset: 6 })],
  ];

  for (const [label, build] of discarded) {
    test(`un checkpoint ${label} est écarté sans HEAD, et purgé`, async () => {
      const idb = fakeIndexedDb();
      const now = 5_000_000_000;
      await idbTusCheckpointStore(idb.factory).save(build(now));
      const server = tusServer();

      const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl, now: () => now }));

      expect(result.ok).toBe(true);
      expect(server.methods()[0]).toBe('POST');
      expect(server.methods()).not.toContain('HEAD');
    });
  }

  test('un HEAD qui échoue sur le réseau garde le checkpoint : on pourra reprendre plus tard', async () => {
    const idb = fakeIndexedDb();
    await idbTusCheckpointStore(idb.factory).save(checkpointFor({ savedAt: Date.now() }));
    const offline = (async () => {
      throw new TypeError('offline');
    }) as unknown as typeof fetch;

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: offline }));

    expect(result).toMatchObject({ ok: false, status: 0, code: 'NETWORK' });
    expect(rows(idb).size).toBe(1);
  });
});

describe('uploadPostMedia — quand le checkpoint reste, quand il part', () => {
  test('une annulation par l’appelant garde le checkpoint', async () => {
    const idb = fakeIndexedDb();
    const controller = new AbortController();
    const server = tusServer();
    const aborting = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal?.aborted === true) throw new DOMException('aborted', 'AbortError');
      const response = await server.fetchImpl(input, init);
      if (init?.method === 'PATCH') controller.abort();
      return response;
    }) as typeof fetch;

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: aborting, signal: controller.signal }));

    expect(result).toMatchObject({ ok: false, code: 'ABORTED' });
    expect(rows(idb).size).toBe(1);
  });

  test('un refus définitif de la passerelle (400) purge le checkpoint', async () => {
    const idb = fakeIndexedDb();
    const refusing = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 201, headers: { Location: '/api/v1/uploads/up-1' } });
      return new Response('Bad mime', { status: 400 });
    }) as typeof fetch;

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: refusing }));

    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(rows(idb).size).toBe(0);
  });

  test('un 409 : le checkpoint prend l’offset relu par HEAD', async () => {
    const idb = fakeIndexedDb();
    const seen: number[] = [];
    const watching = idbTusCheckpointStore(idb.factory);
    const store = { ...watching, save: async (checkpoint: TusCheckpoint) => (seen.push(checkpoint.offset), watching.save(checkpoint)) };
    let patches = 0;
    const server = tusServer();
    const diverging = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        patches += 1;
        if (patches === 1) {
          server.sessions.get('up-1')!.offset = 2;
          return new Response('offset mismatch', { status: 409 });
        }
      }
      return server.fetchImpl(input, init);
    }) as typeof fetch;

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: diverging, checkpoints: store }));

    expect(result.ok).toBe(true);
    expect(seen.slice(0, 3)).toEqual([0, 2, 4]);
  });
});

describe('uploadPostMedia — jamais plus dégradé qu’avant', () => {
  test('IndexedDB en échec : l’envoi aboutit comme sans checkpoint', async () => {
    const idb = fakeIndexedDb();
    idb.failOpen();
    const server = tusServer();

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl }));

    expect(result.ok).toBe(true);
    expect(server.methods()).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH']);
  });

  test('sans magasin (checkpoints: null) : aucun HEAD, aucune écriture', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();

    const result = await uploadPostMedia(paramsOf(idb, { fetchImpl: server.fetchImpl, checkpoints: null }));

    expect(result.ok).toBe(true);
    expect(server.methods()).toEqual(['POST', 'PATCH', 'PATCH', 'PATCH']);
    expect(rows(idb).size).toBe(0);
  });

  test('deux envois SIMULTANÉS du même fichier : le second ouvre sa propre session et n’écrit pas le checkpoint', async () => {
    const idb = fakeIndexedDb();
    const server = tusServer();
    const slow = (async (input: RequestInfo | URL, init?: RequestInit) => {
      await Promise.resolve();
      return server.fetchImpl(input, init);
    }) as typeof fetch;

    const [first, second] = await Promise.all([
      uploadPostMedia(paramsOf(idb, { fetchImpl: slow })),
      uploadPostMedia(paramsOf(idb, { fetchImpl: slow })),
    ]);

    expect(first.ok && second.ok).toBe(true);
    expect(server.methods().filter((method) => method === 'POST')).toHaveLength(2);
    expect(server.methods()).not.toContain('HEAD');
    expect(rows(idb).size).toBe(0);
  });
});

function checkpointFor(overrides: Partial<TusCheckpoint>): TusCheckpoint {
  return { location: `${BASE}/api/v1/uploads/up-1`, offset: 4, fileSize: 6, fingerprint: fingerprintOfPicture(), savedAt: Date.now(), ...overrides };
}
