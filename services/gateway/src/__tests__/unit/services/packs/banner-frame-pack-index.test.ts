/**
 * Les packs de CADRES DE BANNIÈRE (#10932) au registre du démarrage : leur
 * registre se lit, leur contrat vérifié ouvre les clés de ses cadres (ce que
 * `PUT /me/profile-decor` exige pour équiper) et sa couche Lottie. Un contrat
 * d'un autre domaine, ou altéré, n'ouvre rien.
 *
 * @jest-environment node
 */
import { describe, it, expect, afterEach } from '@jest/globals';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadPackIndex } from '../../../../services/packs/PackIndex';

const sha256 = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
const ref = (bytes: string, ext: string) => ({ src: `${sha256(bytes).slice(0, 16)}.${ext}`, bytes: Buffer.byteLength(bytes), sha256: sha256(bytes) });

const LOTTIE = '{"v":"5.7.0","layers":[]}';
const frame = (key: string, over: Record<string, unknown> = {}) => ({
  key,
  viewBox: [0, 0, 300, 100],
  palette: ['#1E4D33', '#C9A34A'],
  border: { width: 9.6, color: 0, opacity: 1 },
  reach: { corner: 18 },
  pieces: [{ anchor: 'start', paths: [{ d: 'M2 2 h12 v12 h-12 Z', color: 1, opacity: 1, group: 'triskeles' }] }],
  motion: [{ kind: 'rotate', targets: ['triskeles'], duration: 12, origin: 'self' }],
  ...over,
});

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function setup(contract: unknown) {
  const design = mkdtempSync(join(tmpdir(), 'meeshy-banner-frame-design-'));
  const assets = mkdtempSync(join(tmpdir(), 'meeshy-banner-frame-assets-'));
  dirs.push(design, assets);
  const contractBytes = JSON.stringify(contract);
  const contractRef = ref(contractBytes, 'json');
  writeFileSync(join(assets, contractRef.src), contractBytes);
  const cover = ref('cover', 'webp');
  mkdirSync(join(design, 'appearance/banner-frames'), { recursive: true });
  writeFileSync(
    join(design, 'appearance/banner-frames/packs.json'),
    JSON.stringify([
      {
        slug: 'heritages', domain: 'banner-frame', origin: 'builtin', version: 1, order: 0, installedByDefault: true, removable: false, hidden: false,
        contractSchema: 1, cover, preview: null, contract: contractRef, strings: {}, downloadBytes: { story: 0, square: null },
        names: { fr: { name: 'Héritages', description: 'Sept cadres posés sur la photo.' } }, usage: { kind: 'free', surfaces: ['banner'] },
      },
    ]),
  );
  return loadPackIndex([design], {}, assets);
}

describe('le registre des cadres de bannière', () => {
  it('se lit au démarrage : l’entrée, son usage bannière, les clés de son contrat vérifié et sa couche Lottie', () => {
    const lottie = ref(LOTTIE, 'json');
    const index = setup({ domain: 'banner-frame', frames: [frame('celte'), frame('haussmannien', { lottie })] });

    const [entry] = index.entries('banner-frame');
    expect(entry?.usage).toEqual({ kind: 'free', surfaces: ['banner'] });
    expect(index.itemKeys(entry!)).toEqual(['celte', 'haussmannien']);
    expect(index.itemCount(entry!)).toBe(2);
    expect(index.isServedAsset(lottie.src)).toBe(true);
    expect(index.entries('banner')).toEqual([]);
  });

  it('un contrat d’un AUTRE domaine sous une entrée de cadres n’ouvre aucune clé', () => {
    const index = setup({ domain: 'banner', designs: [] });
    expect(index.itemKeys(index.entries('banner-frame')[0]!)).toEqual([]);
  });

  it('un cadre illisible (bordure de 30) rend le contrat illisible : aucune clé', () => {
    const index = setup({ domain: 'banner-frame', frames: [frame('celte', { border: { width: 30, color: 0, opacity: 1 } })] });
    expect(index.itemKeys(index.entries('banner-frame')[0]!)).toEqual([]);
  });
});
