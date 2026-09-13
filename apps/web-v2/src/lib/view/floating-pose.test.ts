import { describe, expect, test } from 'bun:test';

import { showsFloatingMenus } from './floating-gate';
import { LADDER_GAP, LADDER_RUNG, ladderExpandsDown, ladderRungOffset } from './floating-pose';

/**
 * LA POSE DES MENUS FLOTTANTS (#6104) — la moitié PURE du sujet, celle
 * qu'aucune capture ne prouve.
 *
 * `popover.ts` a posé la discipline dans cette application : ce qui se
 * positionne se calcule dans une loi sans DOM, et le composant ne fait que
 * peindre le résultat. Une règle de placement écrite au milieu du JSX ne se
 * mesure qu'à l'œil, et l'œil ne visite jamais les quatre coins.
 */

describe('le sens de dépliement de l’échelle', () => {
  /**
   * **TÉMOIN DE RANG, écrit des DEUX côtés de la borne.** iOS déplie vers le
   * bas depuis la moitié haute et vers le haut depuis la moitié basse
   * (`RootView.swift:1703`). Un témoin écrit sur un seul côté resterait vert
   * si la comparaison s'inversait — et une échelle qui se déplie vers le bas
   * depuis le bas de l'écran sort simplement de l'écran, sans rien dire.
   */
  test('descend depuis la moitié haute, monte depuis la moitié basse', () => {
    expect(ladderExpandsDown(0.0)).toBe(true);
    expect(ladderExpandsDown(0.49)).toBe(true);
    expect(ladderExpandsDown(0.51)).toBe(false);
    expect(ladderExpandsDown(1.0)).toBe(false);
  });

  /**
   * La borne elle-même. iOS écrit `pos.y < 0.5` : à exactement 0,5 le menu
   * MONTE. Sans ce témoin, un `<=` passerait inaperçu — il ne change qu'un
   * seul point de tout l'écran.
   */
  test('à exactement la moitié, l’échelle monte', () => {
    expect(ladderExpandsDown(0.5)).toBe(false);
  });
});

describe('la position des six barreaux', () => {
  /**
   * Relevé sur iOS (`RootView.swift:1707-1713`) : le premier barreau est à
   * `26 + 12 + 23 = 61` du centre du bouton, et le pas vaut `46 + 12 = 58`.
   * Ces nombres ne sont pas décoratifs — un pas trop court fait se chevaucher
   * deux cibles de 44, et deux cibles qui se chevauchent en volent une.
   */
  test('le premier est à 61 du centre, les suivants espacés de 58', () => {
    expect(ladderRungOffset(0, true)).toBe(61);
    expect(ladderRungOffset(1, true)).toBe(119);
    expect(ladderRungOffset(2, true)).toBe(177);
    expect(LADDER_RUNG + LADDER_GAP).toBe(58);
  });

  /**
   * Vers le haut, la même échelle en négatif. Écrite deux fois — une par
   * sens — elle aurait divergé : c'est le motif que ce dépôt a mesuré trois
   * fois sur les pastilles et les ronds de chrome.
   */
  test('monte exactement comme elle descend, au signe près', () => {
    for (let i = 0; i < 6; i += 1) {
      expect(ladderRungOffset(i, false)).toBe(-ladderRungOffset(i, true));
    }
  });

  /**
   * Six barreaux de 46 espacés de 12, plus le saut initial : l'échelle
   * déployée mesure 61 + 5×58 + 23 = 374 depuis le centre du bouton. À
   * 844 de haut, elle tient — mais c'est la mesure qui le dit, pas l'intuition.
   */
  test('le dernier barreau tient dans un écran de 844', () => {
    const basDuDernier = 72 + 26 + ladderRungOffset(5, true) + LADDER_RUNG / 2;
    expect(basDuDernier).toBeLessThan(844);
  });
});

describe('où les menus se montrent', () => {
  /**
   * Miroir d'`isDeepRoute` (`Router.swift:274-276`) : iOS garde les deux
   * boutons visibles sur la racine et sur ses sept routes de HUB, et les
   * retire dès qu'on descend dans une conversation.
   */
  test('sur la liste et sur les huit destinations', () => {
    for (const key of [
      'list',
      'feed',
      'links',
      'notifications',
      'calls',
      'discover',
      'communities',
      'settings',
      'profile',
    ]) {
      expect(showsFloatingMenus(key)).toBe(true);
    }
  });

  /**
   * **Jamais sur le fil** : deux disques de 52 posés sur une conversation
   * couvriraient des bulles, et iOS les retire pour cette raison exacte.
   *
   * **Jamais sur les écrans d'authentification** : offrir « Réglages » et
   * « Profil » à qui n'a pas de session est un contrôle qui mène à une garde
   * de session — c'est-à-dire un contrôle qui ne fait pas ce qu'il annonce.
   */
  test('jamais sur le fil, ni sans session, ni en composition', () => {
    for (const key of [
      'thread',
      'login',
      'signup',
      'welcome',
      'magicLink',
      'magicLinkValidate',
      'forgotPassword',
      'conversationsNew',
      'storyCompose',
    ]) {
      expect(showsFloatingMenus(key)).toBe(false);
    }
  });

  /**
   * Une route INCONNUE — la 404, ou une adresse ajoutée demain — ne montre
   * rien. Le défaut par défaut est l'absence : un menu qui apparaîtrait sur
   * un écran qu'on n'a pas pensé est plus difficile à voir qu'un menu absent
   * d'un écran qui le voudrait.
   */
  test('jamais sur une route qu’on n’a pas nommée', () => {
    expect(showsFloatingMenus('routeQuiNExistePas')).toBe(false);
    expect(showsFloatingMenus('')).toBe(false);
  });
});
