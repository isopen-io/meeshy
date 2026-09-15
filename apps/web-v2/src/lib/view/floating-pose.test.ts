import { describe, expect, test } from 'bun:test';

import { showsFloatingMenus } from './floating-gate';
import { FLOATING_BUTTON, FLOATING_TOP } from './floating-corridor';
import {
  LADDER_EDGE,
  LADDER_GAP,
  LADDER_PITCH,
  LADDER_RUNG,
  ladderExpandsDown,
  ladderPitch,
  ladderRooms,
  ladderRungOffset,
} from './floating-pose';

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

/**
 * **SEPT BARREAUX À 320 × 568** (#6458) — le barreau d'administration fait de
 * l'échelle la plus longue une échelle qui ne tient plus au pas d'iOS : depuis
 * la pose par défaut, 152 + 61 + 6 × 58 + 23 = 584 > 568. Le dernier barreau
 * sortait de l'écran EN SILENCE — il existait dans le DOM, et le clavier y
 * menait un focus invisible.
 *
 * La loi RESSERRE le pas quand la place manque, jamais en deçà d'un air de
 * quatre : deux cibles de 46 qui se touchent se volent un doigt.
 */
describe('le pas de l’échelle', () => {
  /** Le couloir de la charte : bas 110 (`floating-menus.css`), disque 52. */
  const FLOAT_BOTTOM = 110;

  /** Le centre du disque aux deux poses de repos, sur un écran de `height`. */
  const centres = (height: number, safeTop: number) => ({
    haut: safeTop + FLOATING_TOP + FLOATING_BUTTON / 2,
    bas: height - FLOAT_BOTTOM - FLOATING_BUTTON / 2,
  });

  /** Les bords haut et bas de chaque barreau, depuis la loi seule. */
  const barreaux = (centre: number, count: number, expandsDown: boolean, room: number) => {
    const pitch = ladderPitch({ count, room });
    return Array.from({ length: count }, (_, i) => {
      const c = centre + ladderRungOffset(i, expandsDown, pitch);
      return { haut: c - LADDER_RUNG / 2, bas: c + LADDER_RUNG / 2 };
    });
  };

  test('garde le pas d’iOS quand la place ne se mesure pas encore', () => {
    expect(ladderPitch({ count: 7, room: null })).toBe(LADDER_PITCH);
    expect(LADDER_PITCH).toBe(LADDER_RUNG + LADDER_GAP);
  });

  /**
   * TÉMOIN DES DEUX CÔTÉS DE LA CONTRAINTE : à 390 × 844 rien ne bouge, et
   * six barreaux à 320 × 568 non plus. Le resserrement ne touche que ce qui en
   * a besoin — un pas recalculé à chaque ouverture aurait sinon déplacé les
   * six barreaux d'iOS sous le doigt de tout le monde.
   */
  test('ne resserre rien quand l’échelle tient : 390 × 844, et six barreaux à 320 × 568', () => {
    const grand = ladderRooms({ center: centres(844, 0).haut, frameTop: 0, frameBottom: 844, safeTop: 0 });
    expect(ladderPitch({ count: 7, room: grand.down })).toBe(LADDER_PITCH);

    const petit = ladderRooms({ center: centres(568, 0).haut, frameTop: 0, frameBottom: 568, safeTop: 0 });
    expect(ladderPitch({ count: 6, room: petit.down })).toBe(LADDER_PITCH);
  });

  test('resserre sept barreaux à 320 × 568 : 54 depuis le haut, 56 depuis le bas', () => {
    const { haut, bas } = centres(568, 0);
    expect(ladderPitch({ count: 7, room: ladderRooms({ center: haut, frameTop: 0, frameBottom: 568, safeTop: 0 }).down })).toBe(54);
    expect(ladderPitch({ count: 7, room: ladderRooms({ center: bas, frameTop: 0, frameBottom: 568, safeTop: 0 }).up })).toBe(56);
  });

  /**
   * LE CRITÈRE DE #6458, écrit sur la loi : dans les DEUX sens de
   * déploiement, avec et sans la barre d'état d'une coque (20), aucun des sept
   * barreaux ne sort du cadre, ni ne passe sous la barre d'état, et deux
   * barreaux voisins gardent au moins quatre d'air.
   */
  test('sept barreaux tiennent à 320 × 568 dans les deux sens, barre d’état ou non', () => {
    for (const safeTop of [0, 20]) {
      const { haut, bas } = centres(568, safeTop);
      const rooms = { haut: ladderRooms({ center: haut, frameTop: 0, frameBottom: 568, safeTop }), bas: ladderRooms({ center: bas, frameTop: 0, frameBottom: 568, safeTop }) };
      const descente = barreaux(haut, 7, ladderExpandsDown(0), rooms.haut.down);
      const montee = barreaux(bas, 7, ladderExpandsDown(1), rooms.bas.up);

      for (const echelle of [descente, montee]) {
        for (const b of echelle) {
          expect({ safeTop, haut: b.haut >= safeTop, bas: b.bas <= 568 }).toEqual({ safeTop, haut: true, bas: true });
        }
        const ordonnee = [...echelle].sort((a, b) => a.haut - b.haut);
        for (let i = 1; i < ordonnee.length; i += 1) {
          expect((ordonnee[i]?.haut ?? 0) - (ordonnee[i - 1]?.bas ?? 0)).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  /** Là où aucune place ne suffit, l'air minimal tient : un chevauchement vole une cible. */
  test('ne descend jamais sous un air de quatre, quelle que soit la place', () => {
    expect(ladderPitch({ count: 7, room: 0 })).toBe(LADDER_RUNG + 4);
    expect(ladderPitch({ count: 7, room: -120 })).toBe(LADDER_RUNG + 4);
  });

  /** La place se mesure depuis le CENTRE du disque, moins la marge du bord et la barre d'état. */
  test('mesure la place des deux côtés du disque, barre d’état déduite en haut', () => {
    expect(ladderRooms({ center: 300, frameTop: 0, frameBottom: 568, safeTop: 20 })).toEqual({
      up: 300 - 20 - LADDER_EDGE,
      down: 568 - 300 - LADDER_EDGE,
    });
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
