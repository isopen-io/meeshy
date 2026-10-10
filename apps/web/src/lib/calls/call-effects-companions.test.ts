import { describe, expect, test } from 'bun:test';

import type { CallCaption } from './call-captions';
import { DEFAULT_SELF_TILE, selfTileSize } from './call-self-tile';
import { companionCapacity, companionCorner, companionLayout, companionRestingLeft, companionTileSize, COMPANION_TILE, LOCAL_COMPANION_ID, otherCorner, speakingPeers, type CompanionTile } from './call-effects-companions';

/**
 * #8737 — EN MODE EFFETS, LES AUTRES RESTENT À L'ÉCRAN. Miroir de
 * `CallEffectsCompanionRule` (`apps/ios/.../CallEffectsCompanions.swift`) :
 * qui accompagne mon image, combien en tiennent, où se range le bloc.
 */

const me: CompanionTile = { id: LOCAL_COMPANION_ID, isLocal: true, isSpeaking: false };
const peer = (id: string, isSpeaking = false): CompanionTile => ({ id, isLocal: false, isSpeaking });
const ids = (tiles: readonly CompanionTile[]) => tiles.map((tile) => tile.id);

describe('companionLayout — qui accompagne mon image', () => {
  test('en duo, l’autre seul accompagne ; la scène est à moi', () => {
    const layout = companionLayout({ tiles: [me, peer('amina')], featuredId: null, capacity: 3 });
    expect(layout.stageTileId).toBe(LOCAL_COMPANION_ID);
    expect(ids(layout.companions)).toEqual(['amina']);
    expect(layout.overflow).toBe(0);
  });

  test('jamais moi, sauf quand une vignette distante est à la une — je deviens alors le premier accompagnant', () => {
    const tiles = [me, peer('a'), peer('b')];
    expect(ids(companionLayout({ tiles, featuredId: null, capacity: 3 }).companions)).toEqual(['a', 'b']);
    const featured = companionLayout({ tiles, featuredId: 'b', capacity: 3 });
    expect(featured.stageTileId).toBe('b');
    expect(ids(featured.companions)).toEqual([LOCAL_COMPANION_ID, 'a']);
  });

  test('une une partie (le pair a quitté) rend la scène à moi', () => {
    const layout = companionLayout({ tiles: [me, peer('a')], featuredId: 'gone', capacity: 3 });
    expect(layout.stageTileId).toBe(LOCAL_COMPANION_ID);
    expect(ids(layout.companions)).toEqual(['a']);
  });

  test('l’ordre d’arrivée, trois au plus, le reste compté en « +N »', () => {
    const layout = companionLayout({ tiles: [me, peer('a'), peer('b'), peer('c'), peer('d'), peer('e')], featuredId: null, capacity: 9 });
    expect(ids(layout.companions)).toEqual(['a', 'b', 'c']);
    expect(layout.overflow).toBe(2);
  });

  test('un orateur au-delà de la capacité prend la DERNIÈRE place quand aucun accompagnant visible ne parle', () => {
    const layout = companionLayout({ tiles: [me, peer('a'), peer('b'), peer('c'), peer('d'), peer('e', true)], featuredId: null, capacity: 3 });
    expect(ids(layout.companions)).toEqual(['a', 'b', 'e']);
    expect(layout.overflow).toBe(2);
  });

  test('le bloc ne se réagence pas quand un accompagnant visible parle déjà', () => {
    const layout = companionLayout({ tiles: [me, peer('a', true), peer('b'), peer('c'), peer('d', true)], featuredId: null, capacity: 3 });
    expect(ids(layout.companions)).toEqual(['a', 'b', 'c']);
  });

  test('capacité nulle : aucune vignette, tout le monde dans le « +N »', () => {
    const layout = companionLayout({ tiles: [me, peer('a'), peer('b', true)], featuredId: null, capacity: 0 });
    expect(layout.companions).toEqual([]);
    expect(layout.overflow).toBe(2);
  });

  test('seul dans l’appel : rien à accompagner', () => {
    const layout = companionLayout({ tiles: [me], featuredId: null, capacity: 3 });
    expect(layout.companions).toEqual([]);
    expect(layout.overflow).toBe(0);
  });
});

describe('companionCapacity — combien tiennent sur la largeur', () => {
  const base = { tileWidth: 84, spacing: 8, chipWidth: 44 };

  test('tout le monde tient : pas de place réservée au « +N »', () => {
    expect(companionCapacity({ ...base, availableWidth: 268, count: 3 })).toBe(3);
  });

  test('tout le monde ne tient pas : la place du « +N » est réservée', () => {
    expect(companionCapacity({ ...base, availableWidth: 319, count: 5 })).toBe(2);
    expect(companionCapacity({ ...base, availableWidth: 400, count: 5 })).toBe(3);
  });

  test('trop étroit pour une vignette : seulement le « +N »', () => {
    expect(companionCapacity({ ...base, availableWidth: 60, count: 2 })).toBe(0);
  });

  test('jamais plus de trois, jamais plus que le nombre', () => {
    expect(companionCapacity({ ...base, availableWidth: 2000, count: 2 })).toBe(2);
    expect(companionCapacity({ ...base, availableWidth: 2000, count: 8 })).toBe(3);
  });
});

describe('companionTileSize — la taille d’une vignette', () => {
  test('les tailles recopiées sont celles de ma vignette x2 et x1', () => {
    const unbounded = { width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY };
    expect(COMPANION_TILE.duo).toEqual(selfTileSize(DEFAULT_SELF_TILE, unbounded));
    expect(COMPANION_TILE.compact).toEqual(selfTileSize(1, unbounded));
  });

  test('un seul accompagnant : la taille de ma vignette ; plusieurs : celle de la bande', () => {
    expect(companionTileSize({ companionCount: 1, freeHeight: 1000 })).toEqual(COMPANION_TILE.duo);
    expect(companionTileSize({ companionCount: 3, freeHeight: 1000 })).toEqual(COMPANION_TILE.group);
  });

  test('bande libre courte (paysage) : la taille compacte, puis à la hauteur, jamais sous une cible tactile', () => {
    expect(companionTileSize({ companionCount: 1, freeHeight: 130 })).toEqual(COMPANION_TILE.compact);
    expect(companionTileSize({ companionCount: 1, freeHeight: 70 })).toEqual({ width: 50, height: 70 });
    expect(companionTileSize({ companionCount: 1, freeHeight: 40 })).toBeNull();
  });
});

describe('companionCorner — le coin le plus proche de la dépose', () => {
  test('gauche de l’écran : le coin de tête ; droite : le coin de fin', () => {
    expect(companionCorner({ dropX: 100, containerWidth: 390, rtl: false })).toBe('top-leading');
    expect(companionCorner({ dropX: 300, containerWidth: 390, rtl: false })).toBe('top-trailing');
  });

  test('de droite à gauche, le coin de tête est à droite', () => {
    expect(companionCorner({ dropX: 300, containerWidth: 390, rtl: true })).toBe('top-leading');
    expect(companionCorner({ dropX: 100, containerWidth: 390, rtl: true })).toBe('top-trailing');
  });

  test('changer de côté passe à l’autre coin', () => {
    expect(otherCorner('top-leading')).toBe('top-trailing');
    expect(otherCorner('top-trailing')).toBe('top-leading');
  });

  test('au repos, le bloc est collé à la marge de son coin, en coordonnées physiques', () => {
    const at = { blockWidth: 100, containerWidth: 390, margin: 16 };
    expect(companionRestingLeft({ ...at, corner: 'top-leading', rtl: false })).toBe(16);
    expect(companionRestingLeft({ ...at, corner: 'top-trailing', rtl: false })).toBe(274);
    expect(companionRestingLeft({ ...at, corner: 'top-leading', rtl: true })).toBe(274);
  });
});

describe('speakingPeers — qui parle, lu dans les sous-titres', () => {
  const caption = (speakerId: string, isFinal: boolean, at: number, mine = false): CallCaption => ({ id: `${speakerId}-${at}`, speakerId, speakerName: speakerId, original: '…', translated: null, pair: null, isFinal, at, mine });

  test('le dernier segment d’un pair encore en cours : il parle ; fini, il s’est tu ; le mien ne compte pas', () => {
    const speaking = speakingPeers([caption('a', true, 1), caption('a', false, 2), caption('b', false, 1), caption('b', true, 3), caption('me', false, 4, true)]);
    expect([...speaking]).toEqual(['a']);
  });
});
