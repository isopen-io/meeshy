import { describe, expect, test } from 'bun:test';

import { resolveCssVars, rootVarReader } from './css-vars';

/**
 * LES DESSINS DU JEU HORS DU DOCUMENT (#9382) — les composants dessinent avec
 * des jetons CSS (`var(--game-gold-0)`). Une image SVG chargée dans un `<img>`
 * ne voit PAS les variables de la page : pour peindre le même emblème sur le
 * `canvas`, on remplace chaque variable par sa valeur lue sur la racine.
 */
const palette: Record<string, string> = { '--game-gold-0': '#f5c542', '--game-edge': '#101828', '--ios-ink': '#0b1020' };
const read = (name: string): string => palette[name] ?? '';

describe('resolveCssVars', () => {
  test('remplace chaque variable par sa valeur, dans les attributs et dans les styles', () => {
    const svg = '<path fill="var(--game-gold-0)" style="flood-color:var(--game-edge)"/>';
    expect(resolveCssVars(svg, read).markup).toBe('<path fill="#f5c542" style="flood-color:#101828"/>');
  });

  test('une même variable, plusieurs fois', () => {
    expect(resolveCssVars('var(--ios-ink) var(--ios-ink)', read).markup).toBe('#0b1020 #0b1020');
  });

  test('la valeur de repli sert quand la variable est absente', () => {
    expect(resolveCssVars('fill="var(--inconnue, #fff)"', read).markup).toBe('fill="#fff"');
  });

  test('la variable présente l’emporte sur son repli', () => {
    expect(resolveCssVars('fill="var(--ios-ink, #fff)"', read).markup).toBe('fill="#0b1020"');
  });

  test('une variable sans valeur ni repli reste NOMMÉE dans le rapport, jamais silencieuse', () => {
    const result = resolveCssVars('fill="var(--inconnue)" stroke="var(--autre)"', read);
    expect(result.unresolved).toEqual(['--inconnue', '--autre']);
    expect(result.markup).toBe('fill="currentColor" stroke="currentColor"');
  });

  test('un balisage sans variable passe tel quel', () => {
    const svg = '<circle cx="1" cy="2" r="3" fill="#abc"/>';
    expect(resolveCssVars(svg, read)).toEqual({ markup: svg, unresolved: [] });
  });

  test('les espaces autour du nom ne comptent pas', () => {
    expect(resolveCssVars('var( --game-edge )', read).markup).toBe('#101828');
  });
});

describe('rootVarReader', () => {
  test('lit la valeur calculée sur la racine, rognée', () => {
    const root = {} as Element;
    const reader = rootVarReader({ getComputedStyle: () => ({ getPropertyValue: (name: string) => (name === '--game-edge' ? '  #101828 ' : '') }), root });
    expect(reader('--game-edge')).toBe('#101828');
    expect(reader('--absente')).toBe('');
  });
});
