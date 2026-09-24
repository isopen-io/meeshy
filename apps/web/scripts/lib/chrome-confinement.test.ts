import { describe, expect, test } from 'bun:test';

import { confinement } from './chrome-confinement.mjs';

/**
 * LA PORTE DE SORTIE D'UN PLEIN ÉCRAN TIENT DANS LE CADRE (#7040, #7037).
 *
 * Le patron existait déjà, appliqué à UNE surface : `check-thread-chrome.mjs`
 * assert `paintedLeft >= 0 && paintedRight <= viewportWidth` pour la capsule de
 * synchronisation du composeur. Aucun plein écran ne l'avait — et c'est
 * précisément là qu'il manquait : #7037 rapporte une croix à `x = −326,3` pour
 * un viewport de 402 pt, entièrement hors de l'écran, sur un plein écran de
 * pièce jointe. On ne pouvait le fermer que par un geste, jamais par le
 * contrôle qui l'annonce.
 *
 * LE CADRE N'EST PAS LE VIEWPORT, C'EST LA ZONE SÛRE. Un bouton à `top: 12`
 * tient dans le viewport et passe quand même SOUS la barre d'état d'une coque à
 * encoche — le second défaut de ce lot (`story.tsx`, états d'attente). La règle
 * les couvre tous les deux d'une seule mesure, et retombe EXACTEMENT sur la
 * règle du viewport quand les encarts valent zéro, ce qui est le cas d'un
 * Chromium de bureau.
 */

const CADRE = { largeur: 390, hauteur: 844 } as const;
const AUCUN_ENCART = { haut: 0, bas: 0, gauche: 0, droite: 0 } as const;
const ENCOCHE = { haut: 47, bas: 34, gauche: 0, droite: 0 } as const;

const rect = (over: Partial<{ top: number; left: number; right: number; bottom: number; height: number }> = {}) => ({
  top: 60,
  left: 14,
  right: 58,
  bottom: 104,
  height: 44,
  ...over,
});

describe('un contrôle confiné ne rend aucun manquement', () => {
  test('posé dans le cadre, à la taille de cible', () => {
    expect(confinement({ rect: rect(), cadre: CADRE, sur: AUCUN_ENCART })).toEqual([]);
  });

  test("collé aux bords EXACTS du cadre, il tient encore — la borne est inclusive, jamais un piège d'arrondi", () => {
    expect(confinement({ rect: rect({ top: 0, left: 0, right: 390, bottom: 44 }), cadre: CADRE, sur: AUCUN_ENCART })).toEqual([]);
  });
});

describe('#7037 — une croix hors du cadre est NOMMÉE, avec son chiffre', () => {
  test("le fait mesuré : left = −326,3 pour un cadre de 402", () => {
    const manquements = confinement({
      rect: { top: 70, left: -326.3, right: -286.3, bottom: 110, height: 40 },
      cadre: { largeur: 402, hauteur: 874 },
      sur: AUCUN_ENCART,
    });

    expect(manquements.length).toBe(2);
    expect(manquements[0]).toContain('-326,3');
    expect(manquements.join(' ')).toContain('40');
  });

  test('les quatre bords sont gardés, pas seulement celui qui a été signalé', () => {
    expect(confinement({ rect: rect({ top: -10 }), cadre: CADRE, sur: AUCUN_ENCART }).length).toBe(1);
    expect(confinement({ rect: rect({ left: -10 }), cadre: CADRE, sur: AUCUN_ENCART }).length).toBe(1);
    expect(confinement({ rect: rect({ right: 400 }), cadre: CADRE, sur: AUCUN_ENCART }).length).toBe(1);
    expect(confinement({ rect: rect({ bottom: 900 }), cadre: CADRE, sur: AUCUN_ENCART }).length).toBe(1);
  });

  test("le plancher de cible tombe aussi : une croix dans le cadre mais trop petite n'est pas une porte", () => {
    const manquements = confinement({ rect: rect({ height: 34, bottom: 94 }), cadre: CADRE, sur: AUCUN_ENCART });

    expect(manquements.length).toBe(1);
    expect(manquements[0]).toContain('44');
  });
});

/**
 * LA BORNE QUI ÉVITE DE FABRIQUER UN GATE QUI CRIE. La croix des visionneuses
 * porte `tap-target-34` (`app.css`) : 34 px DESSINÉS, un `::after` à
 * `inset: -5px` qui porte la PRISE à 44. Mesurer le plancher sur la boîte de
 * bordure la ferait rougir alors qu'elle est CORRECTE — et une seule fausse
 * alerte suffit à faire désactiver un gate.
 */
describe('deux questions, deux boîtes : le cadre sur ce qu’on VOIT, le plancher sur ce qu’on TOUCHE', () => {
  test('34 px dessinés, 44 px de prise : aucun manquement', () => {
    expect(confinement({ rect: rect({ height: 34, bottom: 94 }), cible: { height: 44 }, cadre: CADRE, sur: AUCUN_ENCART })).toEqual([]);
  });

  test("34 px dessinés SANS prise élargie : le manquement tombe, et il nomme la CIBLE", () => {
    const manquements = confinement({ rect: rect({ height: 34, bottom: 94 }), cible: { height: 34 }, cadre: CADRE, sur: AUCUN_ENCART });

    expect(manquements.length).toBe(1);
    expect(manquements[0]).toContain('34');
  });

  test("une prise élargie n'excuse PAS un contrôle hors cadre : la boîte VUE est ce qu'on vise", () => {
    const manquements = confinement({ rect: rect({ left: -326.3, right: -286.3 }), cible: { height: 44 }, cadre: CADRE, sur: AUCUN_ENCART });

    expect(manquements.length).toBe(1);
    expect(manquements[0]).toContain('-326,3');
  });
});

describe('la zone SÛRE, pas seulement le viewport — le second défaut du lot', () => {
  test("une croix à top = 12 tient dans le viewport et passe SOUS l'encoche", () => {
    const sansEncoche = confinement({ rect: rect({ top: 12, bottom: 56 }), cadre: CADRE, sur: AUCUN_ENCART });
    const avecEncoche = confinement({ rect: rect({ top: 12, bottom: 56 }), cadre: CADRE, sur: ENCOCHE });

    expect(sansEncoche).toEqual([]);
    expect(avecEncoche.length).toBe(1);
    expect(avecEncoche[0]).toContain('47');
  });

  test("la même croix, posée sous l'encoche, tient", () => {
    expect(confinement({ rect: rect({ top: 59, bottom: 103 }), cadre: CADRE, sur: ENCOCHE })).toEqual([]);
  });

  test("l'encart BAS compte aussi : une croix sur la barre d'accueil n'est pas atteignable", () => {
    expect(confinement({ rect: rect({ top: 790, bottom: 834 }), cadre: CADRE, sur: ENCOCHE }).length).toBe(1);
  });
});

describe('un contrôle ABSENT est un manquement, jamais un silence', () => {
  test("sans rectangle, la règle le dit — c'est le motif même que ce lot corrige ailleurs", () => {
    const manquements = confinement({ rect: null, cadre: CADRE, sur: AUCUN_ENCART });

    expect(manquements.length).toBe(1);
    expect(manquements[0]).toContain('absent');
  });
});
