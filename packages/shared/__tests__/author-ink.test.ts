/**
 * LA RÈGLE DE LISIBILITÉ DE LA COULEUR D'AUTEUR (#17879, clauses A1.10 / A2.2) —
 * loi pure partagée : une teinte déjà lisible (4,5:1 sur CHAQUE fond) reste
 * exactement la sienne, sinon on la rapproche de l'encre du thème du plus petit
 * pas (0,04) qui tient l'AA. Les vecteurs `fixtures/author-ink.vectors.json`
 * (la palette entière × les deux schémas = 78 couples) sont rejoués ici, par le
 * web, puis par les miroirs Swift (`AuthorInk`) et Kotlin (`AuthorInk`).
 *
 * La formule de contraste est réécrite ICI, indépendante de celle du module :
 * un témoin qui réutiliserait la fonction mesurée ne mesurerait rien.
 */
import { readFileSync } from 'node:fs';

import { VIBRANT_PALETTE } from '../utils/conversation-colors.js';
import { legibleTint } from '../utils/author-ink.js';

type Scheme = 'dark' | 'light';
type Vectors = {
  readonly aa: number;
  readonly step: number;
  readonly ink: Record<Scheme, string>;
  readonly backgrounds: Record<Scheme, readonly string[]>;
  readonly vectors: readonly { readonly scheme: Scheme; readonly tint: string; readonly expected: string }[];
};

const vectors = JSON.parse(readFileSync(new URL('../fixtures/author-ink.vectors.json', import.meta.url), 'utf8')) as Vectors;

const channel = (hex: string, offset: number): number => {
  const c = Number.parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4);
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

describe('la loi de lisibilité de la couleur d’auteur (#17879)', () => {
  it('les vecteurs couvrent la palette entière dans les deux schémas : 78 couples', () => {
    expect(vectors.vectors).toHaveLength(VIBRANT_PALETTE.length * 2);
    expect(vectors.vectors).toHaveLength(78);
    const couples = new Set(vectors.vectors.map((v) => `${v.scheme}:${v.tint}`));
    expect(couples.size).toBe(78);
    for (const hex of VIBRANT_PALETTE) {
      expect(couples.has(`dark:#${hex.toLowerCase()}`)).toBe(true);
      expect(couples.has(`light:#${hex.toLowerCase()}`)).toBe(true);
    }
  });

  it('chaque vecteur est le résultat de la loi sur les fonds du fichier', () => {
    for (const { scheme, tint, expected } of vectors.vectors) {
      expect(legibleTint({ tint, toward: vectors.ink[scheme], backgrounds: vectors.backgrounds[scheme] })).toBe(expected);
    }
  });

  it('chaque résultat tient 4,5:1 sur chaque fond, mesuré indépendamment', () => {
    for (const { scheme, expected } of vectors.vectors) {
      for (const bg of vectors.backgrounds[scheme]) expect(contrast(expected, bg)).toBeGreaterThanOrEqual(vectors.aa);
    }
  });

  it('une teinte déjà lisible reste exactement la sienne', () => {
    const lisibles = vectors.vectors.filter((v) => vectors.backgrounds[v.scheme].every((bg) => contrast(v.tint, bg) >= vectors.aa));
    expect(lisibles.length).toBeGreaterThan(0);
    for (const { tint, expected } of lisibles) expect(expected).toBe(tint);
  });

  it('une teinte illisible est rapprochée du plus petit pas qui tient : le pas précédent ne tenait pas', () => {
    const corrigees = vectors.vectors.filter((v) => v.expected !== v.tint);
    expect(corrigees.length).toBeGreaterThan(0);
    for (const { scheme, tint, expected } of corrigees) {
      const toward = vectors.ink[scheme];
      const steps = Array.from({ length: Math.ceil(1 / vectors.step) + 1 }, (_, i) => Math.min(1, i * vectors.step));
      const mixed = (t: number): string =>
        `#${[0, 2, 4]
          .map((o) => {
            const x = Number.parseInt(tint.slice(1 + o, 3 + o), 16);
            const y = Number.parseInt(toward.slice(1 + o, 3 + o), 16);
            return Math.round(x + (y - x) * t)
              .toString(16)
              .padStart(2, '0');
          })
          .join('')}`;
      const index = steps.findIndex((t) => mixed(t) === expected);
      expect(index).toBeGreaterThan(0);
      const previous = mixed(steps[index - 1] as number);
      expect(vectors.backgrounds[scheme].some((bg) => contrast(previous, bg) < vectors.aa)).toBe(true);
    }
  });

  it('si aucun pas ne tient, la teinte devient l’encre elle-même', () => {
    expect(legibleTint({ tint: '#777777', toward: '#888888', backgrounds: ['#808080'] })).toBe('#888888');
  });
});
