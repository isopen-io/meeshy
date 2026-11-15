import { describe, expect, test } from 'bun:test';

import {
  RAIL_TILE_COMPACT,
  RAIL_TILE_GRANDE,
  RAIL_TITLE_SLOT,
  railCellWidth,
  railHitPad,
  railRingBox,
  railStroke,
} from './rail-tile';

/**
 * **LA COTE iOS GOUVERNE L'AVATAR, JAMAIS LA CELLULE** (#6133).
 *
 * `AvatarContext.size` (`MeeshyAvatar.swift:46-52`) est la taille de l'AVATAR :
 * l'anneau de story se dessine AUTOUR de lui (`ringSize = size + 6`,
 * `MeeshyAvatar.swift:165`), et la cellule se compose ensuite de cet anneau et
 * de la respiration de son libellé (`StoryRingCell`, `.frame(width: 96)`,
 * `StoryTrayView.swift:289`). La première écriture du web faisait valoir la
 * cote iOS sur la CELLULE (`round(size × 1.222)`) : un rapport inventé qui
 * donnait 88 à la bonne case pour la mauvaise raison, et 37 au lieu de 42 à la
 * bande épinglée.
 *
 * Ces témoins interrogent la LOI — des fonctions pures — et non un composant :
 * c'est `StoryTile` (`story-rail.tsx`) qui la peint, et `story-rail.test.tsx`
 * qui mesure ce qu'il peint.
 */
describe('les deux cotes du plateau sont celles de MeeshyAvatar.swift (#6133)', () => {
  test('`.storyTray` = 88 et `.storyTrayCompact` = 36 — des AVATARS', () => {
    expect(RAIL_TILE_GRANDE).toBe(88);
    expect(RAIL_TILE_COMPACT).toBe(36);
  });

  test('l’anneau se pose AUTOUR de l’avatar : `ringSize = size + 6`', () => {
    expect(railRingBox(RAIL_TILE_GRANDE)).toBe(94);
    expect(railRingBox(RAIL_TILE_COMPACT)).toBe(42);
  });

  test('la cellule du grand plateau respire à la largeur de son libellé (96), la bande n’a que son anneau (42)', () => {
    expect(railCellWidth(RAIL_TILE_GRANDE, true)).toBe(96);
    expect(railCellWidth(RAIL_TILE_COMPACT, false)).toBe(42);
  });

  /** Contrainte de #6103 : la bande est `absolute` DANS la fente du titre, elle
   * ne pousse rien — une bande plus haute que sa fente déborderait. */
  test('la bande épinglée tient dans la fente du titre de l’en-tête', () => {
    expect(RAIL_TITLE_SLOT).toBe(44);
    expect(railRingBox(RAIL_TILE_COMPACT)).toBeLessThanOrEqual(RAIL_TITLE_SLOT);
  });
});

describe('ce qui dérive de la cote', () => {
  test('la cible tactile reste ≥ 44 sans élargir la cellule : la marge compense l’écart, jamais plus', () => {
    expect(railHitPad(railCellWidth(RAIL_TILE_COMPACT, false))).toBe(1);
    expect(railHitPad(railCellWidth(RAIL_TILE_GRANDE, true))).toBe(0);
  });

  /**
   * Le trait suit `ringWidth` d'iOS (`MeeshyAvatar.swift:167-175`) : 0,7 au
   * grand plateau, 1,5 à la bande, DOUBLÉ quand la story n'est pas vue
   * (`lineWidth: context.ringWidth * 2`). Un trait sous le pixel ne se peint
   * pas sur tous les écrans : le plancher est le filet de 1 px.
   */
  test('le trait de l’anneau est celui d’iOS, doublé pour une story non vue, jamais sous le filet', () => {
    expect(railStroke(RAIL_TILE_GRANDE, true)).toBe(1.4);
    expect(railStroke(RAIL_TILE_GRANDE, false)).toBe(1);
    expect(railStroke(RAIL_TILE_COMPACT, true)).toBe(3);
    expect(railStroke(RAIL_TILE_COMPACT, false)).toBe(1.5);
  });
});
