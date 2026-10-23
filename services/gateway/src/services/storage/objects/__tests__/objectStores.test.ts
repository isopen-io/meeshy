/**
 * #11267 — les octets d'un média derrière une interface de STOCKAGE D'OBJETS,
 * par clé : le disque local (aujourd'hui), un S3 (MinIO en staging), et le
 * miroir des deux (écriture en double, lecture locale puis S3). Les envois
 * comme le worker média (S9) écrivent par cette interface.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { LocalObjectStore } from '../LocalObjectStore';
import { S3ObjectStore, type S3Like } from '../S3ObjectStore';
import { MirroredObjectStore } from '../MirroredObjectStore';
import { isSafeStorageKey, type MediaObjectStore } from '../MediaObjectStore';

const text = async (stream: Readable | null): Promise<string | null> => {
  if (stream === null) return null;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

const tmpRoot = () => mkdtemp(path.join(os.tmpdir(), 'meeshy-objects-'));

type FakeObject = { body: Buffer; contentType?: string };

/** Un S3 en mémoire qui répond aux quatre commandes comme S3/MinIO, erreurs 404 comprises. */
function fakeS3(options: { failPut?: boolean } = {}) {
  const objects = new Map<string, FakeObject>();
  const sent: Array<{ name: string; input: Record<string, unknown> }> = [];
  const notFound = (name: string) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: 404 } });
  const client: S3Like = {
    send: async (command: unknown) => {
      const { input } = command as { input: Record<string, unknown> };
      const name = (command as object).constructor.name;
      sent.push({ name, input });
      const key = String(input.Key);
      if (command instanceof PutObjectCommand) {
        if (options.failPut) throw Object.assign(new Error('unreachable'), { $metadata: { httpStatusCode: 503 } });
        const body = input.Body;
        const bytes = Buffer.isBuffer(body) ? body : Buffer.from(await text(body as Readable) ?? '');
        objects.set(key, { body: bytes, contentType: input.ContentType as string | undefined });
        return {};
      }
      if (command instanceof HeadObjectCommand) {
        const object = objects.get(key);
        if (!object) throw notFound('NotFound');
        return { ContentLength: object.body.length, ETag: '"abc123"', LastModified: new Date('2026-10-01T00:00:00Z'), ContentType: object.contentType };
      }
      if (command instanceof GetObjectCommand) {
        const object = objects.get(key);
        if (!object) throw notFound('NoSuchKey');
        const range = typeof input.Range === 'string' ? /bytes=(\d+)-(\d+)/.exec(input.Range) : null;
        const bytes = range ? object.body.subarray(Number(range[1]), Number(range[2]) + 1) : object.body;
        return { Body: Readable.from([bytes]) };
      }
      if (command instanceof DeleteObjectCommand) {
        objects.delete(key);
        return {};
      }
      throw new Error(`commande inattendue ${name}`);
    },
  };
  return { client, objects, sent };
}

describe('une clé de stockage est relative, sans remontée ni segment caché', () => {
  it.each(['2026/10/a.jpg', 'translated/x_fr.mp3', 'avatars/user/u.jpg'])('« %s » est sûre', (key) => {
    expect(isSafeStorageKey(key)).toBe(true);
  });
  it.each(['', '/etc/passwd', '../a.jpg', 'a/../../b', '.tus-resumable/x', 'a/.hidden', 'a//b', 'a\\b', 'https://x/y'])('« %s » est refusée', (key) => {
    expect(isSafeStorageKey(key)).toBe(false);
  });
});

describe('LocalObjectStore', () => {
  it('écrit, lit, décrit et efface par clé, sous sa racine', async () => {
    const root = await tmpRoot();
    const store = new LocalObjectStore(root);

    await store.write('2026/10/a.txt', { body: Buffer.from('bonjour'), size: 7, contentType: 'text/plain' });

    expect(await readFile(path.join(root, '2026/10/a.txt'), 'utf8')).toBe('bonjour');
    expect(await store.head('2026/10/a.txt')).toMatchObject({ size: 7 });
    expect(await text(await store.read('2026/10/a.txt'))).toBe('bonjour');
    expect(await text(await store.read('2026/10/a.txt', { start: 3, end: 5 }))).toBe('jou');
    await store.remove('2026/10/a.txt');
    await store.remove('2026/10/a.txt');
    expect(await store.head('2026/10/a.txt')).toBeNull();
    expect(await store.read('2026/10/a.txt')).toBeNull();
  });

  it('refuse une clé qui sortirait de sa racine', async () => {
    const store = new LocalObjectStore(await tmpRoot());
    await expect(store.write('../evade.txt', { body: Buffer.from('x'), size: 1 })).rejects.toThrow();
    expect(await store.head('../evade.txt')).toBeNull();
  });
});

describe('S3ObjectStore', () => {
  it('parle S3 : Put avec taille et type, Head, Get avec plage, Delete, dans SON seau', async () => {
    const s3 = fakeS3();
    const store = new S3ObjectStore({ client: s3.client, bucket: 'meeshy-media' });

    await store.write('2026/10/a.txt', { body: Buffer.from('bonjour'), size: 7, contentType: 'text/plain' });
    expect(await store.head('2026/10/a.txt')).toEqual({ size: 7, etag: '"abc123"', lastModified: new Date('2026-10-01T00:00:00Z'), contentType: 'text/plain' });
    expect(await text(await store.read('2026/10/a.txt', { start: 3, end: 5 }))).toBe('jou');
    await store.remove('2026/10/a.txt');

    expect(s3.sent.map((call) => call.name)).toEqual(['PutObjectCommand', 'HeadObjectCommand', 'GetObjectCommand', 'DeleteObjectCommand']);
    expect(s3.sent.every((call) => call.input.Bucket === 'meeshy-media')).toBe(true);
    expect(s3.sent[0]!.input).toMatchObject({ Key: '2026/10/a.txt', ContentLength: 7, ContentType: 'text/plain' });
    expect(s3.sent[0]!.input).not.toHaveProperty('ACL');
    expect(s3.sent[2]!.input).toMatchObject({ Range: 'bytes=3-5' });
  });

  it('une clé absente se lit null, jamais une erreur', async () => {
    const store = new S3ObjectStore({ client: fakeS3().client, bucket: 'b' });
    expect(await store.head('absent.jpg')).toBeNull();
    expect(await store.read('absent.jpg')).toBeNull();
  });

  it('une panne du S3 remonte comme une panne', async () => {
    const store = new S3ObjectStore({ client: fakeS3({ failPut: true }).client, bucket: 'b' });
    await expect(store.write('a.jpg', { body: Buffer.from('x'), size: 1 })).rejects.toThrow('unreachable');
  });

  it('refuse une clé non sûre sans rien envoyer', async () => {
    const s3 = fakeS3();
    const store = new S3ObjectStore({ client: s3.client, bucket: 'b' });
    await expect(store.write('../x', { body: Buffer.from('x'), size: 1 })).rejects.toThrow();
    expect(s3.sent).toEqual([]);
  });
});

describe('MirroredObjectStore — écriture en double, lecture locale puis S3', () => {
  const build = async (options: { failPut?: boolean } = {}) => {
    const root = await tmpRoot();
    const s3 = fakeS3(options);
    const failures: string[] = [];
    const store: MediaObjectStore = new MirroredObjectStore({
      primary: new LocalObjectStore(root),
      mirror: new S3ObjectStore({ client: s3.client, bucket: 'b' }),
      onMirrorFailure: (key) => failures.push(key),
    });
    return { root, s3, store, failures };
  };

  it('écrit sur le disque ET dans le S3', async () => {
    const { root, s3, store } = await build();
    await store.write('a.txt', { body: Buffer.from('salut'), size: 5 });
    expect(await readFile(path.join(root, 'a.txt'), 'utf8')).toBe('salut');
    expect(s3.objects.get('a.txt')?.body.toString()).toBe('salut');
  });

  it('un S3 en panne ne fait pas échouer l’écriture : le disque fait foi, la clé est signalée pour la reprise', async () => {
    const { root, store, failures } = await build({ failPut: true });
    await store.write('a.txt', { body: Buffer.from('salut'), size: 5 });
    expect(await readFile(path.join(root, 'a.txt'), 'utf8')).toBe('salut');
    expect(failures).toEqual(['a.txt']);
  });

  it('une URL existante continue de servir : le disque d’abord, le S3 quand le disque ne l’a plus', async () => {
    const { root, s3, store } = await build();
    await mkdir(path.join(root, 'local'), { recursive: true });
    await writeFile(path.join(root, 'local/only.txt'), 'disque');
    s3.objects.set('migrated/only.txt', { body: Buffer.from('seau') });

    expect(await text(await store.read('local/only.txt'))).toBe('disque');
    expect(await text(await store.read('migrated/only.txt'))).toBe('seau');
    expect(await store.head('migrated/only.txt')).toMatchObject({ size: 4 });
    expect(await store.read('nulle-part.txt')).toBeNull();
  });

  it('effacer efface des deux côtés', async () => {
    const { root, s3, store } = await build();
    await store.write('a.txt', { body: Buffer.from('x'), size: 1 });
    await store.remove('a.txt');
    expect(s3.objects.has('a.txt')).toBe(false);
    await expect(readFile(path.join(root, 'a.txt'))).rejects.toThrow();
  });
});
