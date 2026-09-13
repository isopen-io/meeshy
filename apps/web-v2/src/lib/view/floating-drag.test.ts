import { describe, expect, test } from 'bun:test';

import {
  FLOATING_DRAG_THRESHOLD,
  isFloatingDrag,
  normalizeFloating,
  type FloatingBounds,
} from './floating-pose';
import { parseFloatingPosition, serializeFloatingPosition } from './floating-position';

/**
 * LE DÉPLACEMENT DES MENUS FLOTTANTS (#6215) — la loi, sans DOM.
 *
 * Miroir de `FreeFloatingButtonsContainer.normalizedPosition`
 * (`FloatingButtons.swift:277-306`).
 */

/** Un écran de 390 × 844 avec les trois couloirs de `floating-menus.css`. */
const ECRAN: FloatingBounds = { width: 390, height: 844, side: 20, top: 126, bottom: 110 };

describe('l’accrochage au bord', () => {
  /**
   * **TÉMOIN DE RANG, ÉCRIT DES DEUX CÔTÉS.** iOS n'accroche QUE
   * l'horizontale (`x = x < 0.5 ? 0 : 1`, `FloatingButtons.swift:304-306`).
   *
   * Une seule des deux assertions laisserait passer une comparaison inversée —
   * et un bouton qui s'accroche au bord OPPOSÉ à celui qu'on vise se remarque
   * tout de suite, mais une garde qui ne le voit pas est pire qu'une garde
   * absente : elle rassure.
   */
  test('la moitié gauche accroche à gauche, la moitié droite à droite', () => {
    expect(normalizeFloating({ x: 60, y: 200 }, ECRAN).x).toBe(0);
    expect(normalizeFloating({ x: 330, y: 200 }, ECRAN).x).toBe(1);
  });

  /** Juste de part et d'autre de la borne, là où une erreur d'un pixel se cache. */
  test('bascule exactement au milieu du couloir', () => {
    const milieu = (ECRAN.side + 26 + (ECRAN.width - ECRAN.side - 26)) / 2;
    expect(normalizeFloating({ x: milieu - 1, y: 200 }, ECRAN).x).toBe(0);
    expect(normalizeFloating({ x: milieu + 1, y: 200 }, ECRAN).x).toBe(1);
  });

  /**
   * **La VERTICALE reste LIBRE.** C'est ce qui distingue ces boutons d'une
   * barre d'outils : on les pose à la hauteur de son pouce. Accrocher les deux
   * axes aurait réduit huit positions possibles à quatre coins.
   */
  test('la verticale n’est jamais accrochée', () => {
    const y = normalizeFloating({ x: 60, y: 400 }, ECRAN).y;
    expect(y).toBeGreaterThan(0);
    expect(y).toBeLessThan(1);
  });
});

describe('les couloirs interdits', () => {
  /**
   * Un doigt qui remonte au-dessus de l'en-tête ne doit pas y laisser le
   * bouton : il recouvrirait le chrome, défaut qu'iOS nomme en toutes lettres
   * — « un contrôle recouvert est un contrôle qu'on ne peut plus lire ».
   */
  test('au-dessus du couloir haut, la fraction bute sur 0', () => {
    expect(normalizeFloating({ x: 60, y: 0 }, ECRAN).y).toBe(0);
    expect(normalizeFloating({ x: 60, y: -500 }, ECRAN).y).toBe(0);
  });

  /** Et symétriquement, la barre de recherche du bas reste atteignable. */
  test('sous le couloir bas, la fraction bute sur 1', () => {
    expect(normalizeFloating({ x: 60, y: 844 }, ECRAN).y).toBe(1);
    expect(normalizeFloating({ x: 60, y: 9999 }, ECRAN).y).toBe(1);
  });

  /**
   * **Le cas dégénéré, qui n'est pas théorique** : une fenêtre plus courte que
   * ses propres couloirs (clavier logiciel ouvert sur un petit écran, fenêtre
   * de navigateur écrasée). Sans garde, la division rend `Infinity` ou `NaN`,
   * et un `NaN` dans un `calc()` fait disparaître le bouton SANS erreur.
   */
  test('un cadre plus court que ses couloirs ne rend jamais NaN', () => {
    const minuscule: FloatingBounds = { width: 40, height: 200, side: 20, top: 126, bottom: 110 };
    const f = normalizeFloating({ x: 20, y: 150 }, minuscule);
    expect(Number.isFinite(f.x)).toBe(true);
    expect(Number.isFinite(f.y)).toBe(true);
    expect(f.y).toBeGreaterThanOrEqual(0);
    expect(f.y).toBeLessThanOrEqual(1);
  });
});

describe('ce qui départage un appui d’un déplacement', () => {
  /**
   * Sur iOS, `DragGesture` et `TapGesture` cohabitent par
   * `simultaneousGesture` ; le web n'a pas d'équivalent, et c'est la DISTANCE
   * qui tranche — exactement comme `LONG_PRESS_MAX_DISTANCE_PX` le fait déjà
   * dans `long-press.ts`.
   *
   * Sans ce seuil, un doigt qui tremble de deux pixels transforme chaque
   * ouverture en déplacement : le menu devient inouvrable au doigt, et aucune
   * capture ne montre jamais ça.
   */
  test('un tremblement n’est pas un déplacement', () => {
    expect(isFloatingDrag(0)).toBe(false);
    expect(isFloatingDrag(FLOATING_DRAG_THRESHOLD - 0.01)).toBe(false);
  });

  test('au-delà du seuil, c’en est un', () => {
    expect(isFloatingDrag(FLOATING_DRAG_THRESHOLD + 0.01)).toBe(true);
    expect(isFloatingDrag(200)).toBe(true);
  });
});

describe('la position mémorisée', () => {
  /** Le format d'iOS, à la lettre : `"x,y"` normalisé (`RootView.swift:259`). */
  test('s’écrit et se relit sans rien perdre', () => {
    const position = { x: 1, y: 0.375 };
    expect(parseFloatingPosition(serializeFloatingPosition(position), { x: 0, y: 0 })).toEqual(position);
  });

  /**
   * **Ce qui se relit doit être une FRACTION, jamais des pixels.** Le témoin
   * le prouve par ce qui compte vraiment : une position enregistrée dans un
   * grand cadre reste DANS l'écran quand on la relit dans un petit.
   */
  test('une position d’un grand cadre reste dans un petit cadre', () => {
    const grand: FloatingBounds = { width: 1024, height: 1366, side: 20, top: 126, bottom: 110 };
    const enregistree = normalizeFloating({ x: 1000, y: 1200 }, grand);
    const petit: FloatingBounds = { width: 320, height: 568, side: 20, top: 126, bottom: 110 };

    expect(enregistree.x).toBeGreaterThanOrEqual(0);
    expect(enregistree.x).toBeLessThanOrEqual(1);
    expect(enregistree.y).toBeGreaterThanOrEqual(0);
    expect(enregistree.y).toBeLessThanOrEqual(1);

    /* Et relue dans le petit cadre, elle désigne un point qui y tient. */
    const rejouee = normalizeFloating(
      { x: petit.side + 26 + enregistree.x * (petit.width - petit.side * 2 - 52), y: petit.top + 26 },
      petit,
    );
    expect(rejouee.x).toBe(enregistree.x);
  });

  /**
   * Une valeur ABÎMÉE — mise à jour partielle, écriture concurrente, main
   * humaine dans les outils du navigateur — ne doit pas faire disparaître le
   * bouton. Le repli est la position par défaut, jamais `NaN`.
   */
  test('une valeur illisible retombe sur le défaut, jamais sur NaN', () => {
    const defaut = { x: 1, y: 0 };
    expect(parseFloatingPosition(null, defaut)).toEqual(defaut);
    expect(parseFloatingPosition('', defaut)).toEqual(defaut);
    expect(parseFloatingPosition('abc', defaut)).toEqual(defaut);
    expect(parseFloatingPosition('0.5', defaut)).toEqual(defaut);
    expect(parseFloatingPosition('0.5,zzz', defaut)).toEqual(defaut);
    expect(parseFloatingPosition('99,-4', defaut)).toEqual({ x: 1, y: 0 });
  });
});
