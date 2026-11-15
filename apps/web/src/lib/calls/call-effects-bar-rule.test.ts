import { describe, expect, test } from 'bun:test';

import { afterAddingLook, afterBack, afterChoice, afterEscape, afterGenre, afterRemoval, afterSettings, afterShowingApplied, EFFECTS_BAR_MODES, ENTERING, pressed, reconciled, showsCarousel, showsLooks, type EffectsBarMode } from './call-effects-bar-rule';

/**
 * LA BARRE `‹ · Réglages · (+)` REVIENT AU MENU DE BASE APRÈS CHAQUE CHOIX (directive porteur du 2026-11-14 sur
 * #16979 et #17962, qui remplace « le carrousel reste en Montage » ; #18186) — jumelle TS de `CallEffectsBarRule`
 * (iOS #18189, vecteurs publiés sur #18184 ; Android). Effets ET Montage, looks, cadres, déformations, couleur :
 * une même famille, une même navigation.
 */

const ALL: readonly EffectsBarMode[] = ['base', 'looks', 'settings', 'applied'];

describe('call-effects-bar-rule — où en est la barre d’Effets', () => {
  test('quatre états : le menu de base, le carrousel ouvert, le panneau Réglages, la liste des effets appliqués', () => {
    expect(EFFECTS_BAR_MODES).toEqual(ALL);
  });

  test('`entering = looks` : un mode s’ouvre sur le carrousel de son genre (P8, C1 tels que dessinés)', () => {
    expect(ENTERING).toBe('looks');
  });

  test('`afterChoice = base` : un look, une couleur, une déformation, un cadre, une déclinaison ou l’option « Cadre » rendent le menu de base', () => {
    expect(afterChoice).toBe('base');
  });

  test('`afterGenre` : un genre touché ouvre son carrousel ; retoucher le genre déjà ouvert le referme', () => {
    expect(ALL.map((mode) => afterGenre(mode, { isOpen: false }))).toEqual(['looks', 'looks', 'looks', 'looks']);
    expect(afterGenre('looks', { isOpen: true })).toBe('base');
    expect(['base', 'settings', 'applied'].map((mode) => afterGenre(mode as EffectsBarMode, { isOpen: true }))).toEqual(['looks', 'looks', 'looks']);
  });

  test('`afterAddingLook(*) = looks` : (+) ouvre le carrousel d’un genre, d’où qu’on parte', () => {
    expect(ALL.map(afterAddingLook)).toEqual(['looks', 'looks', 'looks', 'looks']);
  });

  test('`pressed(g, looks) = g`, rien ailleurs : une puce n’est pressée que sur le carrousel qu’elle a ouvert', () => {
    expect(ALL.map((mode) => pressed('frame', mode))).toEqual([null, 'frame', null, null]);
    expect(pressed('face', 'looks')).toBe('face');
  });

  test('`showsLooks` : la rangée de genres vit sur le menu de base et avec le carrousel ; Réglages et la liste resserrent la barre', () => {
    expect(ALL.map(showsLooks)).toEqual([true, true, false, false]);
  });

  test('`showsCarousel` : seulement quand le carrousel est ouvert — jamais après un choix', () => {
    expect(ALL.map(showsCarousel)).toEqual([false, true, false, false]);
    expect(showsCarousel(afterChoice)).toBe(false);
  });

  test('Réglages ouvre le panneau ; le retoucher le referme et rend le menu de base', () => {
    expect(ALL.map(afterSettings)).toEqual(['settings', 'settings', 'base', 'settings']);
  });

  test('#17947 — `afterBack(settings) = base`, `null` ailleurs : un second ‹ quitte le mode', () => {
    expect(ALL.map(afterBack)).toEqual([null, null, 'base', null]);
    expect(afterBack(afterBack('settings') ?? 'settings')).toBeNull();
  });

  test('Échap (web) referme le panneau ou la liste ; ailleurs il quitte le mode', () => {
    expect(ALL.map(afterEscape)).toEqual([null, null, 'base', 'base']);
  });

  test('l’appui long sur (+) n’ouvre la liste que s’il y a une couche à annuler', () => {
    expect(ALL.map((mode) => afterShowingApplied(mode, { hasLayers: true }))).toEqual(['applied', 'applied', 'applied', 'applied']);
    expect(ALL.map((mode) => afterShowingApplied(mode, { hasLayers: false }))).toEqual(ALL);
  });

  test('annuler une couche referme la liste et rend le menu de base', () => {
    expect(afterRemoval).toBe('base');
  });

  test('une liste qui a perdu sa dernière couche se referme ; le reste ne bouge pas', () => {
    expect(ALL.map((mode) => reconciled(mode, { hasLayers: false }))).toEqual(['base', 'looks', 'settings', 'base']);
    expect(ALL.map((mode) => reconciled(mode, { hasLayers: true }))).toEqual(ALL);
  });
});
