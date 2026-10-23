/**
 * #11267, audit D5 — UN SEUL PASSAGE DU MIROIR À LA FOIS SUR UN VOLUME. La
 * ligne de commande et le job de la passerelle partagent le volume des dépôts,
 * son fichier d'état et le seau : deux passages concurrents doublaient le
 * travail, faisaient reculer les curseurs et avortaient sur le `rename` du
 * fichier d'état. Un verrou-fichier dans `.media-mirror/`, à échéance (un
 * processus mort ne bloque pas pour toujours), les sérialise ; le verrou de
 * flotte (Redis) reste #12362.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { withMirrorLock } from '../mediaMirrorLock';

const NOW = new Date('2026-10-23T12:00:00Z');
const MINUTE = 60 * 1000;

async function lockFile() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'meeshy-lock-'));
  return path.join(root, '.media-mirror', 'lock');
}

describe('withMirrorLock', () => {
  it('exécute sous le verrou, puis le rend', async () => {
    const file = await lockFile();
    const first = await withMirrorLock({ file, owner: 'cli', now: () => NOW, ttlMs: 10 * MINUTE }, async () => 'fait');
    const second = await withMirrorLock({ file, owner: 'job', now: () => NOW, ttlMs: 10 * MINUTE }, async () => 'refait');
    expect(first).toEqual({ kind: 'ran', value: 'fait' });
    expect(second).toEqual({ kind: 'ran', value: 'refait' });
  });

  it('un second passage pendant le premier est refusé, en nommant le détenteur', async () => {
    const file = await lockFile();
    let inner: unknown;
    await withMirrorLock({ file, owner: 'cli', now: () => NOW, ttlMs: 10 * MINUTE }, async () => {
      inner = await withMirrorLock({ file, owner: 'job', now: () => NOW, ttlMs: 10 * MINUTE }, async () => 'jamais');
    });
    expect(inner).toEqual({ kind: 'busy', holder: 'cli' });
  });

  it('un verrou échu (processus mort) est repris', async () => {
    const file = await lockFile();
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, JSON.stringify({ owner: 'mort', expiresAt: new Date(NOW.getTime() - MINUTE).toISOString() }));
    const result = await withMirrorLock({ file, owner: 'job', now: () => NOW, ttlMs: 10 * MINUTE }, async () => 'repris');
    expect(result).toEqual({ kind: 'ran', value: 'repris' });
  });

  it('le verrou est rendu même quand le passage échoue', async () => {
    const file = await lockFile();
    await expect(withMirrorLock({ file, owner: 'cli', now: () => NOW, ttlMs: 10 * MINUTE }, async () => { throw new Error('panne'); })).rejects.toThrow('panne');
    const after = await withMirrorLock({ file, owner: 'job', now: () => NOW, ttlMs: 10 * MINUTE }, async () => 'libre');
    expect(after).toEqual({ kind: 'ran', value: 'libre' });
  });

  it('un passage long renouvelle son échéance', async () => {
    const file = await lockFile();
    let clock = NOW.getTime();
    await withMirrorLock({ file, owner: 'cli', now: () => new Date(clock), ttlMs: 10 * MINUTE }, async (renew) => {
      clock += 9 * MINUTE;
      await renew();
      clock += 9 * MINUTE;
      const held = JSON.parse(await readFile(file, 'utf8')) as { expiresAt: string };
      expect(new Date(held.expiresAt).getTime()).toBeGreaterThan(clock);
    });
  });
});
