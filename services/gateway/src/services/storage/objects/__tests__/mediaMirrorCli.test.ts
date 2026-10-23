/**
 * #11267 — la ligne de commande de la migration : À BLANC par défaut ;
 * `--apply` en staging ; ailleurs, `--apply` exige le feu vert du porteur
 * nommé (#9232). Le curseur se garde entre deux lancements (reprise) et un
 * passage à blanc ne le déplace pas.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { mkdtemp, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { LocalObjectStore } from '../LocalObjectStore';
import type { MediaObjectStore } from '../MediaObjectStore';
import type { MirrorRowSource } from '../mediaMirror';
import { objectIdAtOrAfter, parseMirrorArgs, runMediaMirror } from '../mediaMirrorCli';

describe('parseMirrorArgs', () => {
  it('à blanc par défaut, par lots de 500', () => {
    expect(parseMirrorArgs([], { MEESHY_ENV: 'staging' })).toEqual({ kind: 'run', apply: false, follow: false, sweep: false, allowMassRemoval: false, batchSize: 500, limit: null, reset: false });
  });

  it('en staging, --apply suffit', () => {
    expect(parseMirrorArgs(['--apply', '--batch=50', '--limit=1000'], { MEESHY_ENV: 'staging' })).toMatchObject({ kind: 'run', apply: true, batchSize: 50, limit: 1000 });
  });

  it('hors staging, --apply sans feu vert du porteur est refusé', () => {
    expect(parseMirrorArgs(['--apply'], {})).toEqual({ kind: 'refused', reason: 'production-requires-porteur-approval' });
    expect(parseMirrorArgs(['--apply'], { MEESHY_ENV: 'production' })).toEqual({ kind: 'refused', reason: 'production-requires-porteur-approval' });
    expect(parseMirrorArgs(['--apply', '--porteur-approval=https://github.com/isopen-io/meeshy/issues/9232#issuecomment-1'], {})).toMatchObject({ kind: 'run', apply: true });
  });

  it('hors staging, le passage à blanc reste permis : il ne fait que compter', () => {
    expect(parseMirrorArgs([], {})).toMatchObject({ kind: 'run', apply: false });
  });

  it('le miroir continu ne tourne pas à blanc : --follow exige --apply', () => {
    expect(parseMirrorArgs(['--follow'], { MEESHY_ENV: 'staging' })).toEqual({ kind: 'refused', reason: 'follow-requires-apply' });
    expect(parseMirrorArgs(['--apply', '--follow'], { MEESHY_ENV: 'staging' })).toMatchObject({ kind: 'run', apply: true, follow: true });
  });

  it('un argument inconnu ou une taille de lot hors bornes est refusé', () => {
    expect(parseMirrorArgs(['--aply'], { MEESHY_ENV: 'staging' })).toEqual({ kind: 'refused', reason: 'unknown-argument' });
    expect(parseMirrorArgs(['--batch=0'], { MEESHY_ENV: 'staging' })).toEqual({ kind: 'refused', reason: 'invalid-batch' });
  });
});

describe('objectIdAtOrAfter', () => {
  it('rend le plus petit ObjectId d’un instant : 8 chiffres hexadécimaux de secondes, puis des zéros', () => {
    expect(objectIdAtOrAfter(new Date('2026-10-23T00:00:00Z'))).toBe(`${Math.floor(Date.parse('2026-10-23T00:00:00Z') / 1000).toString(16)}0000000000000000`);
  });
});

function harness() {
  const copied: string[] = [];
  const mirror: MediaObjectStore = {
    head: async () => null,
    read: async () => null,
    write: async (key) => {
      copied.push(key);
    },
    remove: async () => undefined,
  };
  const rows = ['a1', 'a2', 'a3'].map((id) => ({ id, filePath: `${id}.jpg` }));
  const source: MirrorRowSource = { name: 'messageAttachment', page: async (after, take) => rows.filter((row) => after === null || row.id > after).slice(0, take) };
  return { copied, mirror, source };
}

async function localWith(keys: readonly string[]) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'meeshy-mirror-cli-'));
  const local = new LocalObjectStore(root);
  await Promise.all(keys.map((key) => local.write(key, { body: Buffer.from(key), size: key.length })));
  return { root, local };
}

describe('runMediaMirror — reprise par curseur', () => {
  it('appliquée, garde le curseur après chaque lot ; relancée, reprend où elle s’était arrêtée', async () => {
    const { root, local } = await localWith(['a1.jpg', 'a2.jpg', 'a3.jpg']);
    const { copied, mirror, source } = harness();
    const stateFile = path.join(root, '.media-mirror', 'state.json');
    const run = (limit: number | null) => runMediaMirror({ sources: [source], local, mirror, uploadRoot: root, stateFile, options: { apply: true, batchSize: 1, limit, reset: false }, log: () => undefined });

    const first = await run(1);
    expect(copied).toEqual(['a1.jpg']);
    expect(JSON.parse(await readFile(stateFile, 'utf8'))).toMatchObject({ cursors: { messageAttachment: 'a1' } });
    expect(first.messageAttachment).toMatchObject({ rows: 1, counts: { copied: 1 } });

    await run(null);
    expect(copied).toEqual(['a1.jpg', 'a2.jpg', 'a3.jpg']);
    expect(JSON.parse(await readFile(stateFile, 'utf8'))).toMatchObject({ cursors: { messageAttachment: 'a3' } });
  });

  it('à blanc, compte sans rien écrire, ni dans le seau ni dans l’état', async () => {
    const { root, local } = await localWith(['a1.jpg', 'a2.jpg', 'a3.jpg']);
    const { copied, mirror, source } = harness();
    const stateFile = path.join(root, '.media-mirror', 'state.json');

    const report = await runMediaMirror({ sources: [source], local, mirror, uploadRoot: root, stateFile, options: { apply: false, batchSize: 2, limit: null, reset: false }, log: () => undefined });

    expect(copied).toEqual([]);
    expect(report.messageAttachment).toMatchObject({ rows: 3, counts: { 'would-copy': 3 } });
    await expect(readFile(stateFile, 'utf8')).rejects.toThrow();
  });
});

describe('--sweep — l’effacement des copies que plus rien ne nomme, sous le même régime que la copie', () => {
  it('à blanc par défaut', () => {
    expect(parseMirrorArgs(['--sweep'], {})).toMatchObject({ kind: 'run', apply: false, sweep: true });
  });

  it('appliqué hors staging : refusé sans feu vert du porteur', () => {
    expect(parseMirrorArgs(['--sweep', '--apply'], { MEESHY_ENV: 'production' })).toEqual({ kind: 'refused', reason: 'production-requires-porteur-approval' });
    expect(parseMirrorArgs(['--sweep', '--apply'], { MEESHY_ENV: 'staging' })).toMatchObject({ kind: 'run', apply: true, sweep: true });
  });

  it('--allow-mass-removal n’a de sens qu’avec --sweep --apply, et lève le refus « plus de la moitié »', () => {
    expect(parseMirrorArgs(['--sweep', '--allow-mass-removal'], { MEESHY_ENV: 'staging' })).toEqual({ kind: 'refused', reason: 'mass-removal-requires-sweep-apply' });
    expect(parseMirrorArgs(['--apply', '--allow-mass-removal'], { MEESHY_ENV: 'staging' })).toEqual({ kind: 'refused', reason: 'mass-removal-requires-sweep-apply' });
    expect(parseMirrorArgs(['--sweep', '--apply', '--allow-mass-removal'], { MEESHY_ENV: 'staging' })).toMatchObject({ kind: 'run', sweep: true, allowMassRemoval: true });
  });
});
