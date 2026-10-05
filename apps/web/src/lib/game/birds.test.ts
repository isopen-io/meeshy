import { describe, expect, test } from 'bun:test';

import { GAME_BIRD_KEYS, birdCutFilter, gameBirdMarkup, gameBirdPlacement } from './birds';

/**
 * MEE ET MEO DANS LE DÉCOR (#9380) — le dessin n'est PAS refait : il vient du
 * moteur des stickers (`lib/mee/art.ts`). Ce module ne choisit que la POSE de
 * chaque figure du jeu et la place sur la pièce, le blason ou le trophée.
 */
describe('les figures du jeu', () => {
  test('quatorze figures, chacune d’un seul personnage', () => {
    expect(GAME_BIRD_KEYS).toHaveLength(14);
    for (const key of GAME_BIRD_KEYS) expect(key.startsWith('mee') || key.startsWith('meo')).toBe(true);
  });

  test('le marquage est un SVG de colibri aux identifiants préfixés par l’instance', () => {
    const markup = gameBirdMarkup('meeCrown', 'gA1');
    expect(markup).toContain('<radialGradient id="gA1meeCrownmee1b"');
    expect(markup).not.toContain('id="mee1b"');
  });

  test('deux instances voisines ne partagent aucun identifiant', () => {
    const ids = (m: string): readonly string[] => [...m.matchAll(/id="([^"]+)"/g)].map((x) => x[1] ?? '');
    const a = ids(gameBirdMarkup('meeJoy', 'gA'));
    const b = ids(gameBirdMarkup('meeJoy', 'gB'));
    expect(a.length).toBeGreaterThan(0);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });

  test('la couronne et l’auréole ne se mélangent pas : une seule coiffe par figure', () => {
    const crown = gameBirdMarkup('meeCrown', 'g');
    const halo = gameBirdMarkup('meeHalo', 'g');
    expect(crown).toContain('M50 46 L54 22');
    expect(crown).not.toContain('<ellipse cx="70" cy="28"');
    expect(halo).toContain('<ellipse cx="70" cy="28"');
    expect(halo).not.toContain('M50 46 L54 22');
  });
});

describe('gameBirdPlacement', () => {
  test('à droite, le personnage est retourné : il regarde vers le centre', () => {
    expect(gameBirdPlacement({ x: 107, y: 30, scale: 0.34, flip: true })).toBe('translate(107 30) scale(-0.34 0.34)');
    expect(gameBirdPlacement({ x: 13, y: 30, scale: 0.34 })).toBe('translate(13 30) scale(0.34 0.34)');
  });
});

describe('birdCutFilter — le contour blanc d’un sticker découpé', () => {
  test('porte l’identifiant demandé', () => {
    expect(birdCutFilter('gA-cut')).toContain('<filter id="gA-cut"');
  });
});
