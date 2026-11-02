/**
 * #11267, contre-audit C1 — UNE COPIE EN VOL NE RESSUSCITE PAS UN FICHIER EFFACÉ.
 * Une recopie ouverte avant l'effacement se terminait après lui, et la copie
 * réapparaissait au seau. Témoin de l'auditeur adversarial.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtemp, mkdir, writeFile, unlink } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { LocalObjectStore } from '../LocalObjectStore';
import { mirrorKey } from '../mediaMirror';
import { eraseMirroredCopy } from '../mirroredErasure';
import type { MediaObjectStore, ObjectBody } from '../MediaObjectStore';

describe('effacement synchrone contre une copie du miroir en vol', () => {
  it('le fichier effacé ne doit pas réapparaître dans le seau', async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 's12-'));
    const uploadRoot = path.join(dir, 'uploads');
    const bucket = new LocalObjectStore(path.join(dir, 'bucket'));
    const key = '2026/10/once.jpg';
    await mkdir(path.join(uploadRoot, '2026/10'), { recursive: true });
    await writeFile(path.join(uploadRoot, key), Buffer.alloc(4096, 7));

    let signalInFlight!: () => void;
    const inFlight = new Promise<void>((resolve) => { signalInFlight = resolve; });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const slowMirror: MediaObjectStore = {
      head: (k) => bucket.head(k),
      read: (k, r) => bucket.read(k, r),
      remove: (k) => bucket.remove(k),
      write: async (k, object: ObjectBody) => {
        await once(object.body as Readable, 'open');
        signalInFlight();
        await gate;
        await bucket.write(k, object);
      },
    };

    const copying = mirrorKey({ local: new LocalObjectStore(uploadRoot), mirror: slowMirror, key, apply: true });
    await inFlight;
    await unlink(path.join(uploadRoot, key));
    await eraseMirroredCopy(path.join(uploadRoot, key), uploadRoot, slowMirror);
    release();
    await copying;

    expect(await bucket.head(key)).toBeNull();
  });
});
