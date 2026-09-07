import { describe, expect, test } from 'bun:test';

import {
  DECALAGE_DE_BANDE,
  DEMI_HAUTEUR_DE_BANDE,
  centreDeLaBande,
  elisLeFocus,
  perspective,
} from './loi';

/**
 * LES VALEURS de la loi de la Lentille. `scripts/verifie-courbe.mjs` garde les
 * CONSTANTES contre `packages/shared/utils/focus-curve.ts` ; ce fichier garde
 * la FORMULE — une constante juste n'a jamais garanti un calcul juste.
 */

describe('la perspective de liste', () => {
  test('un rang PILE dans la bande est rendu intact', () => {
    expect(perspective(0)).toEqual({ alpha: 1, echelle: 1 });
  });

  test('un rang à la distance de saturation porte tout le fondu', () => {
    const p = perspective(520);
    expect(p.alpha).toBeCloseTo(0.55, 10);
    expect(p.echelle).toBeCloseTo(0.96, 10);
  });

  test('au-delà de la saturation, rien ne bouge plus', () => {
    expect(perspective(2000)).toEqual(perspective(520));
  });

  test('le fondu est linéaire entre la bande et la saturation', () => {
    expect(perspective(260).alpha).toBeCloseTo(1 - 0.45 * 0.5, 10);
  });

  /**
   * LE TÉMOIN QUI COMPTE LE PLUS. La source amont porte une correction : la
   * rampe sous la bande est PROPORTIONNELLE plafonnée, pas `max(d/160, −0,35)`.
   * Les deux formes coïncident au plafond et divergent partout ailleurs — d'où
   * ces distances, choisies des deux côtés du point où l'ancienne forme
   * saturait (d = −56). Un témoin posé seulement à −160 ne les distinguerait
   * pas : c'est la leçon du témoin de RANG, qui ne peut pas tomber au rang 1.
   */
  test('sous la bande, la rampe est proportionnelle et non saturante', () => {
    expect(perspective(-56).alpha).toBeCloseTo(1 - 0.35 * (56 / 160), 10);
    expect(perspective(-56).alpha).not.toBeCloseTo(0.65, 3);
    expect(perspective(-160).alpha).toBeCloseTo(0.65, 10);
    expect(perspective(-500).alpha).toBeCloseTo(0.65, 10);
  });

  test("sous la bande, l'échelle ne bouge pas", () => {
    expect(perspective(-300).echelle).toBe(1);
  });
});

describe("l'élection de la carte de focus", () => {
  const rangs = [
    { id: 'a', milieuY: 100 },
    { id: 'b', milieuY: 300 },
    { id: 'c', milieuY: 500 },
  ];

  test('sans candidat, personne ne gagne', () => {
    expect(elisLeFocus({ candidats: [], focusY: 300, courant: null, hysteresis: 45 })).toBeNull();
  });

  test('le plus proche gagne quand nul ne détient la carte', () => {
    expect(elisLeFocus({ candidats: rangs, focusY: 280, courant: null, hysteresis: 45 })).toBe('b');
  });

  /**
   * L'hystérésis est ce qui empêche la carte de battre entre deux rangs à
   * distance voisine. Sans elle, `focusY: 340` élirait `b` puis `c` puis `b`
   * au gré du pixel.
   */
  test('le détenteur garde la carte tant qu’il reste dans la bande', () => {
    expect(elisLeFocus({ candidats: rangs, focusY: 340, courant: 'b', hysteresis: 45 })).toBe('b');
  });

  test('il la perd dès qu’il en sort', () => {
    expect(elisLeFocus({ candidats: rangs, focusY: 460, courant: 'b', hysteresis: 45 })).toBe('c');
  });

  test('à égalité de distance, l’identifiant croissant tranche', () => {
    const paire = [
      { id: 'z', milieuY: 200 },
      { id: 'a', milieuY: 400 },
    ];
    expect(elisLeFocus({ candidats: paire, focusY: 300, courant: null, hysteresis: 0 })).toBe('a');
  });

  test('un détenteur absent de la liste ne bloque pas l’élection', () => {
    expect(elisLeFocus({ candidats: rangs, focusY: 100, courant: 'disparu', hysteresis: 45 })).toBe('a');
  });
});

describe('le centre de la bande', () => {
  /**
   * Au repos en haut de la liste, la bande est au bord HAUT — sans quoi la
   * toute première conversation ne pourrait jamais être élue, la bande étant
   * sous elle.
   */
  test('au repos en haut, la bande est au bord haut', () => {
    expect(centreDeLaBande({ hautDuCadre: 0, basDuCadre: 800, defilement: 0 })).toBe(0);
  });

  test('elle descend jusqu’au centre sur la première demi-hauteur', () => {
    expect(centreDeLaBande({ hautDuCadre: 0, basDuCadre: 800, defilement: 200 })).toBe(200);
    expect(centreDeLaBande({ hautDuCadre: 0, basDuCadre: 800, defilement: 400 })).toBe(400);
  });

  test('puis elle ne bouge plus', () => {
    expect(centreDeLaBande({ hautDuCadre: 0, basDuCadre: 800, defilement: 5000 })).toBe(400);
  });

  test('un cadre de hauteur nulle ne divise pas par zéro', () => {
    expect(centreDeLaBande({ hautDuCadre: 400, basDuCadre: 400, defilement: 10 })).toBe(400);
  });
});

describe('les cotes de la bande', () => {
  test('elles sont celles de la source amont', () => {
    expect(DECALAGE_DE_BANDE).toBe(140);
    expect(DEMI_HAUTEUR_DE_BANDE).toBe(45);
  });
});
