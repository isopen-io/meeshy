/**
 * #11271 — une lens PROPOSÉE : son coût est MESURÉ par la passerelle (jamais
 * cru sur parole), ses fichiers sont ceux que ses couches nomment, et rien
 * d'autre. La mesure suit un barème par primitive, calé sur les vecteurs du
 * format (`fixtures/lens-v1/vectors.json`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseLens, type Lens } from '../lens-format';
import { isLensCostDeclaredHonestly, lensAssetRefs, measureLensCost, withLensAssets } from '../lens-pack';

const vectors = JSON.parse(readFileSync(join(__dirname, '../../fixtures/lens-v1/vectors.json'), 'utf8')) as { vectors: { input: unknown }[] };

const complete = (): Lens => {
  const outcome = parseLens(vectors.vectors[0]!.input);
  if (outcome.status !== 'ok') throw new Error('le premier vecteur doit se lire');
  return outcome.lens;
};

const withLayers = (layers: readonly unknown[]): Lens => {
  const outcome = parseLens({ ...(vectors.vectors[0]!.input as Record<string, unknown>), layers, triggers: [], fallbacks: undefined });
  if (outcome.status !== 'ok') throw new Error(`couches illisibles : ${outcome.status}`);
  return outcome.lens;
};

const frame = (id: string) => ({ kind: 'frame', id, motif: 'elegant.art-deco' });
const particles = (id: string, density: string) => ({ kind: 'particles', id, preset: 'snow', density });

describe('measureLensCost', () => {
  it('le vecteur complet du format (LUT, cadre, deux stickers, texte, particules) est « standard », comme il le déclare', () => {
    expect(measureLensCost(complete())).toBe('standard');
  });

  it('un seul cadre est « light »', () => {
    expect(measureLensCost(withLayers([frame('cadre')]))).toBe('light');
  });

  it('des particules denses empilées sont « rich »', () => {
    expect(measureLensCost(withLayers([particles('a', 'high'), particles('b', 'high'), particles('c', 'high'), particles('d', 'high')]))).toBe('rich');
  });
});

describe('isLensCostDeclaredHonestly', () => {
  it('déclarer au moins ce qui est mesuré est honnête ; déclarer moins ne l’est pas', () => {
    expect(isLensCostDeclaredHonestly('rich', 'standard')).toBe(true);
    expect(isLensCostDeclaredHonestly('standard', 'standard')).toBe(true);
    expect(isLensCostDeclaredHonestly('light', 'standard')).toBe(false);
  });
});

describe('les fichiers d’une lens', () => {
  it('nomme, une fois chacun, les fichiers de ses LUT et de ses stickers', () => {
    expect(lensAssetRefs(complete())).toEqual(['aaaaaaaaaaaaaaaa.png', 'bbbbbbbbbbbbbbbb.png', 'cccccccccccccccc.png']);
  });

  it('réécrit les adresses de ses fichiers ré-encodés, sans toucher au reste', () => {
    const lens = complete();
    const renamed = withLensAssets(lens, new Map([['aaaaaaaaaaaaaaaa.png', '1111111111111111.webp']]));
    expect(lensAssetRefs(renamed)).toEqual(['1111111111111111.webp', 'bbbbbbbbbbbbbbbb.png', 'cccccccccccccccc.png']);
    expect(renamed.layers.length).toBe(lens.layers.length);
    expect(lensAssetRefs(lens)[0]).toBe('aaaaaaaaaaaaaaaa.png');
  });
});
