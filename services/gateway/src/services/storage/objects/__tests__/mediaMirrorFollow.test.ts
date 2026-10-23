/**
 * #11267 — LE MIROIR CONTINU vit DANS la passerelle : c'est le seul service
 * qui monte le volume des dépôts (garde `media-uploads-never-public`, #11256).
 * Armé par `MEDIA_S3_MIRROR_FOLLOW=on`, il recopie à chaque passage ce que les
 * écrivains ont posé sur le disque et, une fois par heure, retire du seau ce
 * qu'aucune ligne vivante ne nomme. Hors staging, sans feu vert du porteur, il
 * ne fait que COMPTER (même régime que la conservation, #9614).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalObjectStore } from '../LocalObjectStore';
import type { ObjectBody } from '../MediaObjectStore';
import type { ListedObject } from '../mediaBucketSweep';
import type { MirrorRowSource } from '../mediaMirror';
import { followMediaMirrorOnce, mediaMirrorFollowMode } from '../mediaMirrorFollow';

const APPROVAL = 'https://github.com/isopen-io/meeshy/issues/9232#issuecomment-1';
const NOW = new Date('2026-10-23T12:00:00Z');
const HOUR = 60 * 60 * 1000;

describe('mediaMirrorFollowMode — qui arme le miroir continu', () => {
  it('éteint tant que MEDIA_S3_MIRROR_FOLLOW ne vaut pas « on »', () => {
    expect(mediaMirrorFollowMode({ MEESHY_ENV: 'staging' }, true)).toEqual({ kind: 'off', reason: 'not-enabled' });
  });

  it('éteint sans seau configuré', () => {
    expect(mediaMirrorFollowMode({ MEDIA_S3_MIRROR_FOLLOW: 'on', MEESHY_ENV: 'staging' }, false)).toEqual({ kind: 'off', reason: 'no-bucket' });
  });

  it('appliqué en staging', () => {
    expect(mediaMirrorFollowMode({ MEDIA_S3_MIRROR_FOLLOW: 'on', MEESHY_ENV: 'staging' }, true)).toEqual({ kind: 'apply' });
  });

  it('hors staging : à blanc, sauf feu vert du porteur nommé par son adresse', () => {
    expect(mediaMirrorFollowMode({ MEDIA_S3_MIRROR_FOLLOW: 'on', MEESHY_ENV: 'production' }, true)).toEqual({ kind: 'dry-run' });
    expect(mediaMirrorFollowMode({ MEDIA_S3_MIRROR_FOLLOW: 'on', MEESHY_ENV: 'production', MEDIA_S3_MIRROR_PORTEUR_APPROVAL: 'oui' }, true)).toEqual({ kind: 'dry-run' });
    expect(mediaMirrorFollowMode({ MEDIA_S3_MIRROR_FOLLOW: 'on', MEESHY_ENV: 'production', MEDIA_S3_MIRROR_PORTEUR_APPROVAL: APPROVAL }, true)).toEqual({ kind: 'apply' });
  });
});

function memoryBucket(initial: Record<string, { bytes: string; lastModified: Date }> = {}) {
  const objects = new Map(Object.entries(initial).map(([key, value]) => [key, { bytes: Buffer.from(value.bytes), lastModified: value.lastModified }]));
  return {
    objects,
    head: async (key: string) => {
      const object = objects.get(key);
      return object ? { size: object.bytes.length, etag: '"e"', lastModified: object.lastModified, contentType: null } : null;
    },
    read: async () => null,
    write: async (key: string, object: ObjectBody) => {
      const chunks: Buffer[] = [];
      if (Buffer.isBuffer(object.body)) chunks.push(object.body);
      else for await (const chunk of object.body) chunks.push(Buffer.from(chunk));
      objects.set(key, { bytes: Buffer.concat(chunks), lastModified: NOW });
    },
    remove: async (key: string) => {
      objects.delete(key);
    },
    list: async function* (): AsyncIterable<ListedObject> {
      for (const [key, object] of [...objects]) yield { key, lastModified: object.lastModified };
    },
  };
}

async function setup(diskFiles: Record<string, string>, rows: ReadonlyArray<{ id: string; filePath: string }>) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'meeshy-follow-'));
  for (const [key, content] of Object.entries(diskFiles)) {
    await mkdir(path.dirname(path.join(root, key)), { recursive: true });
    await writeFile(path.join(root, key), content);
  }
  const source: MirrorRowSource = {
    name: 'messageAttachment',
    page: async (after, take) => {
      const start = after === null ? 0 : rows.findIndex((row) => row.id === after) + 1;
      return rows.slice(start, start + take);
    },
  };
  return { root, local: new LocalObjectStore(root), sources: [source], stateFile: path.join(root, '.media-mirror', 'state.json') };
}

const OLD = new Date('2026-10-01T00:00:00Z');

describe('followMediaMirrorOnce — un passage du miroir continu', () => {
  it('recopie ce que le disque a et le seau non, puis retire ce que plus rien ne nomme', async () => {
    const env = await setup({ '2026/10/u1/a.jpg': 'aaa', '2026/10/u1/b.jpg': 'bb' }, [{ id: '1', filePath: '2026/10/u1/a.jpg' }, { id: '2', filePath: '2026/10/u1/b.jpg' }]);
    const bucket = memoryBucket({ '2026/09/u9/purged.jpg': { bytes: 'x', lastModified: OLD }, '2026/10/u1/a.jpg': { bytes: 'aaa', lastModified: OLD } });

    const next = await followMediaMirrorOnce({ ...env, mirror: bucket, uploadRoot: env.root, apply: true, now: NOW, lastSweepAt: null, log: () => undefined });

    expect([...bucket.objects.keys()].sort()).toEqual(['2026/10/u1/a.jpg', '2026/10/u1/b.jpg']);
    expect(next.lastSweepAt).toEqual(NOW);
  });

  it('ne balaie pas deux fois dans l’heure', async () => {
    const env = await setup({ '2026/10/u1/a.jpg': 'aaa' }, [{ id: '1', filePath: '2026/10/u1/a.jpg' }]);
    const bucket = memoryBucket({ '2026/09/u9/purged.jpg': { bytes: 'x', lastModified: OLD }, '2026/10/u1/a.jpg': { bytes: 'aaa', lastModified: OLD }, '2026/10/u1/c.jpg': { bytes: 'c', lastModified: OLD } });
    const lastSweepAt = new Date(NOW.getTime() - HOUR / 2);

    const next = await followMediaMirrorOnce({ ...env, mirror: bucket, uploadRoot: env.root, apply: true, now: NOW, lastSweepAt, log: () => undefined });

    expect(bucket.objects.has('2026/09/u9/purged.jpg')).toBe(true);
    expect(next.lastSweepAt).toEqual(lastSweepAt);
  });

  it('à blanc : n’écrit ni n’efface rien', async () => {
    const env = await setup({ '2026/10/u1/a.jpg': 'aaa' }, [{ id: '1', filePath: '2026/10/u1/a.jpg' }]);
    const bucket = memoryBucket({ '2026/09/u9/purged.jpg': { bytes: 'x', lastModified: OLD }, '2026/10/u1/z.jpg': { bytes: 'z', lastModified: OLD }, '2026/10/u1/y.jpg': { bytes: 'y', lastModified: OLD } });

    await followMediaMirrorOnce({ ...env, mirror: bucket, uploadRoot: env.root, apply: false, now: NOW, lastSweepAt: null, log: () => undefined });

    expect([...bucket.objects.keys()].sort()).toEqual(['2026/09/u9/purged.jpg', '2026/10/u1/y.jpg', '2026/10/u1/z.jpg']);
  });
});
