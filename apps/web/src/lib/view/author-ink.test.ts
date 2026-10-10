import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { authorAccentColor } from '@meeshy/shared/utils/conversation-colors';

import { AUTHOR_INK_BACKGROUNDS, AUTHOR_INK_SURFACES, authorInk, authorInkStyle } from './author-ink';

/**
 * LE NOM D'AUTEUR TEINTÉ, STABLE PAR PERSONNE (#10004, note « look » de la
 * planche) — la teinte part de la loi PARTAGÉE (`authorAccentColor`, miroir
 * iOS `colorForName(authorId)`), et ne se sert que LISIBLE : 4,5:1 au moins
 * sur chaque fond que le fil peint sous une ligne d'identité, dans les deux
 * schémas. La formule de contraste est réécrite ICI, indépendante de celle du
 * module : un témoin qui réutiliserait la fonction mesurée ne mesurerait rien.
 */
const channel = (hex: string, offset: number): number => {
  const c = Number.parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = (hex: string): number => 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4);
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const SEEDS = Array.from({ length: 400 }, (_, i) => `65f0${i.toString(16).padStart(20, '0')}`);

describe('le nom d’auteur teinté (#10004)', () => {
  test('la même personne garde la même teinte, quel que soit son nom affiché', () => {
    const before = authorInk({ authorId: 'u-kenji', name: 'Kenji' });
    const renamed = authorInk({ authorId: 'u-kenji', name: 'Kenji T.' });
    expect(renamed).toEqual(before);
  });

  test('deux personnes ne partagent pas toutes la même teinte', () => {
    const distinct = new Set(SEEDS.map((authorId) => authorInk({ authorId, name: '' }).dark));
    expect(distinct.size).toBeGreaterThan(20);
  });

  test('sans identifiant, le nom sert de graine — jamais une teinte vide', () => {
    const ink = authorInk({ authorId: undefined, name: 'Luiza' });
    expect(ink.dark).toMatch(/^#[0-9a-f]{6}$/);
    expect(ink.light).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('la teinte part de la loi partagée : un auteur dont la couleur est déjà lisible la garde telle quelle', () => {
    const lisible = SEEDS.find((authorId) => {
      const hex = authorAccentColor(authorId, '').toLowerCase();
      return AUTHOR_INK_BACKGROUNDS.dark.every((bg) => contrast(hex, bg) >= 4.5);
    });
    expect(lisible).toBeDefined();
    expect(authorInk({ authorId: lisible, name: '' }).dark).toBe(authorAccentColor(lisible, '').toLowerCase());
  });

  test('sombre : chaque teinte tient 4,5:1 sur chaque fond du fil', () => {
    for (const authorId of SEEDS) {
      const { dark } = authorInk({ authorId, name: '' });
      for (const bg of AUTHOR_INK_BACKGROUNDS.dark) expect(contrast(dark, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('clair : chaque teinte tient 4,5:1 sur chaque fond du fil', () => {
    for (const authorId of SEEDS) {
      const { light } = authorInk({ authorId, name: '' });
      for (const bg of AUTHOR_INK_BACKGROUNDS.light) expect(contrast(light, bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  test('les fonds mesurés couvrent la surface, la carte, le fond du fil et sa lueur d’accent', () => {
    for (const surface of ['#09090b', '#13111c', '#24243e']) expect(AUTHOR_INK_BACKGROUNDS.dark).toContain(surface);
    for (const surface of ['#ffffff', '#f8f7ff']) expect(AUTHOR_INK_BACKGROUNDS.light).toContain(surface);
    expect(AUTHOR_INK_BACKGROUNDS.dark.length).toBeGreaterThan(3);
    expect(AUTHOR_INK_BACKGROUNDS.light.length).toBeGreaterThan(2);
  });

  test('le style posé porte les deux schémas, la feuille choisit', () => {
    const style = authorInkStyle({ authorId: 'u-omar', name: 'Omar' }) as Record<string, string>;
    const ink = authorInk({ authorId: 'u-omar', name: 'Omar' });
    expect(style['--author-ink-dark']).toBe(ink.dark);
    expect(style['--author-ink-light']).toBe(ink.light);
  });

  test('les fonds de mesure sont les jetons iOS, schéma par schéma — un jeton qui bouge rougit ici', () => {
    const tokens = readFileSync(new URL('../../../../../packages/design-tokens/ios.css', import.meta.url).pathname, 'utf8');
    const lightStart = tokens.indexOf(':root.light');
    const valueOf = (name: string, from: number): string => {
      const match = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(tokens.slice(from));
      return match?.[1]?.toLowerCase() ?? '';
    };
    const darkStart = tokens.lastIndexOf('--ios-surface:', lightStart);
    expect(valueOf('ios-surface', darkStart)).toBe(AUTHOR_INK_SURFACES.dark.surface);
    expect(valueOf('ios-surface-card', darkStart)).toBe(AUTHOR_INK_SURFACES.dark.card);
    expect(valueOf('ios-ink', darkStart)).toBe(AUTHOR_INK_SURFACES.dark.ink);
    expect(valueOf('ios-surface', lightStart)).toBe(AUTHOR_INK_SURFACES.light.surface);
    expect(valueOf('ios-surface-card', lightStart)).toBe(AUTHOR_INK_SURFACES.light.card);
    expect(valueOf('ios-ink', lightStart)).toBe(AUTHOR_INK_SURFACES.light.ink);
  });
});
