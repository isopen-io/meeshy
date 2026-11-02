/**
 * #11267 — LA MIGRATION PAR LOTS (et le miroir continu, qui en est le même
 * outil) : chaque ligne de média nomme ses clés (fichier, vignette, variantes,
 * pistes TTS) ; chaque clé est recopiée du disque vers le seau si le seau ne
 * l'a pas déjà à la même taille. Idempotente, reprise par curseur, comptée, et
 * à blanc par défaut.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalObjectStore } from '../LocalObjectStore';
import type { MediaObjectStore, ObjectBody, StoredObjectHead } from '../MediaObjectStore';
import { mediaRowStorageKeys, mirrorKey, runMirrorBatch, type MirrorRowSource } from '../mediaMirror';
import { mediaMirrorSources } from '../mediaMirrorCli';

const ROOT_PREFIX = path.join(os.tmpdir(), 'meeshy-mirror-');

/** Un seau en mémoire, qui compte ses écritures. */
function memoryStore(failing: ReadonlySet<string> = new Set()) {
  const objects = new Map<string, Buffer>();
  const sourceModified = new Map<string, Date | null>();
  const writes: string[] = [];
  const store: MediaObjectStore = {
    head: async (key): Promise<StoredObjectHead | null> => {
      const bytes = objects.get(key);
      return bytes === undefined ? null : { size: bytes.length, etag: '"x"', lastModified: null, contentType: null, sourceModified: sourceModified.get(key) ?? null };
    },
    read: async () => null,
    write: async (key, object: ObjectBody) => {
      if (failing.has(key)) throw new Error('seau indisponible');
      const chunks: Buffer[] = [];
      if (Buffer.isBuffer(object.body)) chunks.push(object.body);
      else for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
      objects.set(key, Buffer.concat(chunks));
      sourceModified.set(key, object.sourceModified ?? null);
      writes.push(key);
    },
    remove: async (key) => {
      objects.delete(key);
    },
  };
  return { store, objects, writes, sourceModified };
}

async function diskWith(files: Record<string, string>) {
  const root = await mkdtemp(ROOT_PREFIX);
  for (const [key, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, key)), { recursive: true });
    await writeFile(path.join(root, key), content);
  }
  return { root, local: new LocalObjectStore(root) };
}

describe('mediaRowStorageKeys — les clés qu’une ligne de média nomme', () => {
  it('fichier, vignette, variantes et pistes TTS, sous leurs trois formes d’adresse, sans doublon ni clé hors racine', () => {
    const root = '/srv/uploads';
    const keys = mediaRowStorageKeys(
      {
        filePath: '2026/10/u1/photo.jpg',
        fileUrl: '/api/v1/attachments/file/2026%2F10%2Fu1%2Fphoto.jpg',
        thumbnailUrl: 'https://gate.meeshy.me/api/v1/attachments/file/2026/10/u1/photo_thumb.webp',
        imageVariants: [{ url: '2026/10/u1/photo_w640.webp' }, { url: '../../etc/passwd' }, 'n’importe quoi'],
        translations: { fr: { url: '/api/v1/attachments/file/translated/a_fr.mp3', path: '/srv/uploads/translated/a_fr.mp3' }, en: { path: '/etc/shadow' } },
      },
      root,
    );

    expect([...keys].sort()).toEqual(['2026/10/u1/photo.jpg', '2026/10/u1/photo_thumb.webp', '2026/10/u1/photo_w640.webp', 'translated/a_fr.mp3']);
  });

  it('une ligne sans clé lisible ne nomme rien', () => {
    expect(mediaRowStorageKeys({ filePath: '', fileUrl: 'https://cdn.ailleurs.com/x.jpg' }, '/srv/uploads')).toEqual([]);
  });
});

describe('mirrorKey — idempotent, à blanc par défaut', () => {
  it('à blanc, rien n’est écrit : la clé est comptée « à recopier »', async () => {
    const { local } = await diskWith({ 'a.jpg': 'octets' });
    const bucket = memoryStore();
    expect(await mirrorKey({ local, mirror: bucket.store, key: 'a.jpg', apply: false })).toBe('would-copy');
    expect(bucket.writes).toEqual([]);
  });

  it('appliquée, la clé est recopiée une fois ; la seconde passe la trouve déjà là', async () => {
    const { local } = await diskWith({ 'a.jpg': 'octets' });
    const bucket = memoryStore();
    expect(await mirrorKey({ local, mirror: bucket.store, key: 'a.jpg', apply: true })).toBe('copied');
    expect(await mirrorKey({ local, mirror: bucket.store, key: 'a.jpg', apply: true })).toBe('already');
    expect(bucket.writes).toEqual(['a.jpg']);
    expect(bucket.objects.get('a.jpg')?.toString()).toBe('octets');
  });

  it('une copie de taille différente dans le seau est remplacée', async () => {
    const { local } = await diskWith({ 'a.jpg': 'octets' });
    const bucket = memoryStore();
    bucket.objects.set('a.jpg', Buffer.from('tronqué'.slice(0, 2)));
    expect(await mirrorKey({ local, mirror: bucket.store, key: 'a.jpg', apply: true })).toBe('copied');
  });

  it('une clé absente du disque est comptée, jamais inventée ; une panne du seau aussi', async () => {
    const { local } = await diskWith({ 'b.jpg': 'x' });
    const bucket = memoryStore(new Set(['b.jpg']));
    expect(await mirrorKey({ local, mirror: bucket.store, key: 'absent.jpg', apply: true })).toBe('missing-local');
    expect(await mirrorKey({ local, mirror: bucket.store, key: 'b.jpg', apply: true })).toBe('failed');
  });
});

describe('runMirrorBatch — un lot, un curseur, des comptes', () => {
  const rows = (ids: readonly string[]) => ids.map((id) => ({ id, filePath: `${id}.jpg`, fileUrl: `${id}.jpg` }));

  function source(all: ReturnType<typeof rows>): MirrorRowSource {
    return {
      name: 'messageAttachment',
      page: async (after, take) => all.filter((row) => after === null || row.id > after).slice(0, take),
    };
  }

  it('avance le curseur au dernier identifiant lu, et compte chaque issue', async () => {
    const { root, local } = await diskWith({ 'a1.jpg': '1', 'a2.jpg': '22' });
    const bucket = memoryStore();

    const first = await runMirrorBatch({ source: source(rows(['a1', 'a2', 'a3'])), uploadRoot: root, local, mirror: bucket.store, after: null, batchSize: 2, apply: true });
    expect(first).toEqual({ rows: 2, nextCursor: 'a2', done: false, counts: { copied: 2, already: 0, 'would-copy': 0, 'missing-local': 0, failed: 0 } });

    const second = await runMirrorBatch({ source: source(rows(['a1', 'a2', 'a3'])), uploadRoot: root, local, mirror: bucket.store, after: first.nextCursor, batchSize: 2, apply: true });
    expect(second).toEqual({ rows: 1, nextCursor: 'a3', done: true, counts: { copied: 0, already: 0, 'would-copy': 0, 'missing-local': 1, failed: 0 } });
  });

  it('rejouer un lot déjà migré ne recopie rien', async () => {
    const { root, local } = await diskWith({ 'a1.jpg': '1' });
    const bucket = memoryStore();
    await runMirrorBatch({ source: source(rows(['a1'])), uploadRoot: root, local, mirror: bucket.store, after: null, batchSize: 10, apply: true });
    const replay = await runMirrorBatch({ source: source(rows(['a1'])), uploadRoot: root, local, mirror: bucket.store, after: null, batchSize: 10, apply: true });
    expect(replay.counts).toMatchObject({ copied: 0, already: 1 });
    expect(bucket.writes).toEqual(['a1.jpg']);
  });

  it('un lot vide garde le curseur et se dit terminé', async () => {
    const { root, local } = await diskWith({});
    const result = await runMirrorBatch({ source: source([]), uploadRoot: root, local, mirror: memoryStore().store, after: 'z9', batchSize: 10, apply: false });
    expect(result).toMatchObject({ rows: 0, nextCursor: 'z9', done: true });
  });
});

describe('les clés vivantes sont TOUTES nommées — le balayage efface ce qu’elles taisent', () => {
  it('la vignette rangée par chemin (`thumbnailPath`) est une clé', () => {
    expect(mediaRowStorageKeys({ filePath: '2026/10/u1/v.mp4', thumbnailPath: '2026/10/u1/v_thumb.webp' }, '/srv/uploads')).toContain('2026/10/u1/v_thumb.webp');
  });

  it('chaque collection lit toutes les colonnes qui portent une clé, pistes TTS des posts comprises', async () => {
    const selects: Record<string, Record<string, true>> = {};
    const delegate = (name: string) => ({
      findMany: async (args: { select: Record<string, true> }) => {
        selects[name] = args.select;
        return [];
      },
    });
    const prisma = { messageAttachment: delegate('messageAttachment'), postMedia: delegate('postMedia'), sound: delegate('sound') };
    for (const source of mediaMirrorSources(prisma as never)) await source.page(null, 1);
    const columns = ['filePath', 'fileUrl', 'thumbnailPath', 'thumbnailUrl', 'imageVariants', 'avifVariants', 'renditions', 'translations'];
    expect(Object.keys(selects).sort()).toEqual(['messageAttachment', 'postMedia', 'sound']);
    expect(Object.keys(selects.messageAttachment!)).toEqual(expect.arrayContaining(columns));
    expect(Object.keys(selects.postMedia!)).toEqual(expect.arrayContaining(columns));
    expect(Object.keys(selects.sound!)).toEqual(expect.arrayContaining(['fileUrl', 'coverUrl']));
  });

  it('les variantes AVIF et les rendus vidéo sont des clés (#11262, #11261)', () => {
    const keys = mediaRowStorageKeys(
      {
        filePath: '2026/10/u1/v.mp4',
        avifVariants: [{ width: 640, url: '/api/v1/attachments/file/2026%2F10%2Fu1%2Fv_640w.avif' }],
        renditions: [{ height: 720, url: '/api/v1/attachments/file/2026%2F10%2Fu1%2Fv_720p.mp4' }],
      },
      '/srv/uploads',
    );
    expect(keys).toEqual(expect.arrayContaining(['2026/10/u1/v_640w.avif', '2026/10/u1/v_720p.mp4']));
  });

  it('la couverture qu’un son vise est une clé vivante, même quand le post qui l’a posée est purgé', () => {
    expect(mediaRowStorageKeys({ fileUrl: '/api/v1/static/s.mp3', coverUrl: '/api/v1/attachments/file/2026%2F10%2Fu1%2Fcover.jpg' }, '/srv/uploads')).toContain('2026/10/u1/cover.jpg');
  });

  it('une clé portée par la seule ADRESSE (sans filePath) est lue — l’adresse n’est pas un chemin disque', () => {
    expect(mediaRowStorageKeys({ fileUrl: '/api/v1/attachments/file/2026%2F10%2Fu1%2Fonly-url.jpg' }, '/srv/uploads')).toEqual(['2026/10/u1/only-url.jpg']);
    expect(mediaRowStorageKeys({ filePath: '/srv/uploads/2026/10/u1/abs.jpg' }, '/srv/uploads')).toEqual(['2026/10/u1/abs.jpg']);
    expect(mediaRowStorageKeys({ filePath: '/etc/passwd' }, '/srv/uploads')).toEqual([]);
  });
});

describe('#11267, audit D6 — « déjà là » se juge à la taille ET à la date du fichier source', () => {
  it('une copie faite se reconnaît au passage suivant', async () => {
    const { local } = await diskWith({ '2026/10/u1/a.jpg': 'aaaa' });
    const bucket = memoryStore();
    expect(await mirrorKey({ local, mirror: bucket.store, key: '2026/10/u1/a.jpg', apply: true })).toBe('copied');
    expect(await mirrorKey({ local, mirror: bucket.store, key: '2026/10/u1/a.jpg', apply: true })).toBe('already');
  });

  it('un fichier réécrit sur place à taille égale (métadonnées retirées) est recopié : l’ancienne copie pouvait porter le GPS', async () => {
    const { local } = await diskWith({ '2026/10/u1/a.jpg': 'aaaa' });
    const bucket = memoryStore();
    bucket.objects.set('2026/10/u1/a.jpg', Buffer.from('gps!'));
    bucket.sourceModified.set('2026/10/u1/a.jpg', new Date('2020-01-01T00:00:00Z'));
    expect(await mirrorKey({ local, mirror: bucket.store, key: '2026/10/u1/a.jpg', apply: true })).toBe('copied');
    expect(bucket.objects.get('2026/10/u1/a.jpg')!.toString()).toBe('aaaa');
  });

  it('une copie d’avant ce correctif, sans date de source, est recopiée une fois', async () => {
    const { local } = await diskWith({ '2026/10/u1/a.jpg': 'aaaa' });
    const bucket = memoryStore();
    bucket.objects.set('2026/10/u1/a.jpg', Buffer.from('aaaa'));
    expect(await mirrorKey({ local, mirror: bucket.store, key: '2026/10/u1/a.jpg', apply: true })).toBe('copied');
  });
});
