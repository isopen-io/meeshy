import { describe, expect, test } from 'bun:test';

import { classerAtteinte, resumeExclusions } from './reach-at-rest.mjs';
import type { FaitAtteinte, Mesure } from './reach-at-rest.mjs';

/**
 * UN CONTRÔLE HORS DU VIEWPORT DOIT FAIRE ROUGIR, PAS DISPARAÎTRE (#7040).
 *
 * Sept gates de peau portaient une copie du même prédicat :
 *
 *     const visible = (r) => r.width > 0 && r.height > 0
 *       && x > 0 && x < innerWidth && y > 0 && y < innerHeight;
 *     const measure = (el) => { if (!visible(el.getBoundingClientRect())) return []; … };
 *
 * `visible()` est un FILTRE, pas une assertion. Un contrôle dont le centre
 * tombe à `x = −326` rend un tableau VIDE : il ne casse rien, il n'apparaît
 * dans aucun relevé, et le gate reste **vert avec un contrôle de moins**. Les
 * assertions en aval (`controls.length >= N && blocked.length === 0`) ne
 * peuvent pas le voir — le plancher `>= N` est posé bien en dessous du nombre
 * réel, et c'est le seul rempart.
 *
 * C'est exactement le défaut qu'il fallait attraper : #7037 (iOS) rapporte un
 * bouton « Fermer » à `x = −326.3` pour un viewport de 402 pt, et le gate qui
 * devrait le dire l'exclut par construction.
 *
 * LE CŒUR DU LOT N'EST PAS LE SIGNALEMENT, C'EST LE TRI. Un prédicat qui crie
 * dès qu'une boîte sort du cadre est aussi inutile qu'un prédicat aveugle : une
 * page voisine de carrousel à `translateX(100%)`, une rangée sous la ligne de
 * flottaison d'un scroller, une vue déclarée `inert` sont LÉGITIMEMENT hors
 * cadre. Elles s'écartent donc par une raison ÉCRITE et COMPTÉE — jamais par
 * un tableau vide, qui ne distingue pas « écarté à bon droit » de « perdu ».
 *
 * La DÉCISION vit ici, pure : la page ne remonte que des FAITS (la boîte, les
 * cadres qui l'écrêtent, ce que `elementFromPoint` a touché, ce que l'auteur a
 * DÉCLARÉ). C'est ce qui rend ce verdict jouable sans navigateur.
 */

const CADRE = { largeur: 390, hauteur: 844 } as const;

const fait = (over: Partial<FaitAtteinte> = {}): FaitAtteinte => ({
  nom: 'Fermer',
  left: 12,
  top: 60,
  width: 44,
  height: 44,
  toucher: 'lui-même',
  par: 'BUTTON',
  declare: null,
  ecrans: [],
  cadre: CADRE,
  ...over,
});

/** Le verdict, RETENU — un écarté ici serait le défaut que ce fichier attrape. */
const mesure = (f: FaitAtteinte): Mesure => {
  const verdict = classerAtteinte(f);
  if (verdict.exclu) throw new Error(`écarté alors qu'il devait être mesuré : ${verdict.raison}`);
  return verdict;
};

describe('un contrôle dont le centre sort du viewport', () => {
  test("est RETENU et RAPPORTÉ faux — le fait exact de #7037 (x = −326,3 pour un cadre de 402)", () => {
    const verdict = mesure(fait({ left: -346.3, width: 40, height: 40, cadre: { largeur: 402, hauteur: 874 } }));

    expect(verdict.ok).toBe(false);
    expect(verdict.raison).toBe('hors viewport');
    expect(verdict.nom).toBe('Fermer');
  });

  test('sort AUSSI par le haut, par le bas et par la droite — les quatre bords, pas seulement celui qui a été signalé', () => {
    const bords = [
      fait({ top: -60 }),
      fait({ top: 900 }),
      fait({ left: 420 }),
      fait({ left: -60 }),
    ];

    expect(bords.map((f) => mesure(f).raison)).toEqual(['hors viewport', 'hors viewport', 'hors viewport', 'hors viewport']);
  });

  test("porte sa HAUTEUR : le plancher de 44 px se mesure sur lui comme sur les autres", () => {
    expect(mesure(fait({ left: -346.3, height: 30 })).hauteur).toBe(30);
  });

  test("dit où il est parti — un relevé qui ne donne pas le centre ne se diagnostique pas", () => {
    expect(mesure(fait({ left: -346.3, width: 40, height: 40 })).par).toBe('hors du cadre (-326,3 ; 80,0)');
  });
});

describe('un élément légitimement hors cadre est écarté par une RAISON, jamais par un tableau vide', () => {
  test("une page voisine de carrousel à translateX(100%) : son centre tombe hors du cadre qui l'écrête", () => {
    const verdict = classerAtteinte(
      fait({
        nom: 'page 2',
        left: 390,
        width: 390,
        height: 600,
        ecrans: [{ nom: 'DIV.carrousel', left: 0, top: 0, right: 390, bottom: 844, defileX: true, defileY: false }],
      }),
    );

    expect(verdict.exclu).toBe(true);
    expect(verdict.raison).toBe('écrêté par DIV.carrousel');
  });

  test("une rangée sous la ligne de flottaison d'un scroller : le comportement d'AVANT, désormais NOMMÉ", () => {
    const verdict = classerAtteinte(
      fait({ nom: 'Réglages', top: 1200, ecrans: [{ nom: 'MAIN#contenu', left: 0, top: 100, right: 390, bottom: 844, defileX: false, defileY: true }] }),
    );

    expect(verdict.exclu).toBe(true);
    expect(verdict.raison).toBe('écrêté par MAIN#contenu');
  });

  test("un élément DANS le cadre de son écrêteur reste mesuré — l'écrêtage n'est pas un laissez-passer", () => {
    const verdict = mesure(fait({ ecrans: [{ nom: 'MAIN#contenu', left: 0, top: 0, right: 390, bottom: 844, defileX: false, defileY: true }] }));

    expect(verdict.ok).toBe(true);
    expect(verdict.raison).toBe('atteint');
  });

  test("un écrêteur lui-même HORS du viewport N'EXCUSE PAS ce qu'il contient — sinon il suffirait d'un conteneur pour blanchir n'importe quel défaut", () => {
    expect(
      mesure(fait({ left: -200, width: 44, ecrans: [{ nom: 'DIV.rail', left: -300, top: 0, right: -100, bottom: 844, defileX: true, defileY: false }] }))
        .raison,
    ).toBe('hors viewport');
  });

  /* La remontée relève TOUS les ancêtres qui écrêtent, jamais le seul plus
     proche : un bouton DANS une page hors cadre est écarté par la PISTE. */
  test("un bouton au-delà du bord d'un rail qui défile est écarté par le RAIL, pas par sa page", () => {
    const verdict = classerAtteinte(
      fait({
        nom: 'Fermer',
        left: 560,
        width: 44,
        ecrans: [{ nom: 'DIV.rail', left: 0, top: 0, right: 390, bottom: 844, defileX: true, defileY: false }],
      }),
    );

    expect(verdict.exclu).toBe(true);
    expect(verdict.raison).toBe('écrêté par DIV.rail');
  });

  /**
   * LA BORNE QUE CE LOT A DÛ POSER — et le seul témoin de ce fichier qui a été
   * écrit APRÈS coup, parce que la première version du prédicat a BLANCHI sa
   * propre mutation.
   *
   * Mesuré sur le `dist` construit : `header a { transform: translateX(-1000px) }`
   * — le fait exact de #7037 rejoué sur le web — sortait le contrôle du
   * `DIV.flex` de l'en-tête, et cet écrêteur l'écartait du relevé. Le gate
   * rougissait quand même, mais par le PLANCHER de comptage (1 mesuré au lieu
   * de 2) : le vieux rempart, pas la mesure. Un conteneur qui écrête aurait
   * suffi à blanchir n'importe quel défaut.
   */
  test("une boîte de TRONCATURE — qui écrête sans défiler — n'excuse RIEN : ce qu'elle perd est perdu", () => {
    const verdict = mesure(
      fait({ left: -1000, ecrans: [{ nom: 'DIV.flex', left: 0, top: 48, right: 390, bottom: 92, defileX: false, defileY: false }] }),
    );

    expect(verdict.raison).toBe('hors viewport');
    expect(verdict.ok).toBe(false);
  });

  test("un écrêteur n'excuse que l'axe sur lequel il défile — sortir en X d'un scroller vertical reste un défaut", () => {
    const verdict = mesure(
      fait({ left: -1000, ecrans: [{ nom: 'MAIN#contenu', left: 0, top: 0, right: 390, bottom: 844, defileX: false, defileY: true }] }),
    );

    expect(verdict.raison).toBe('hors viewport');
  });

  test('ce que l’auteur DÉCLARE hors scène — inert, aria-hidden — s’écarte sous son propre nom', () => {
    expect(classerAtteinte(fait({ declare: 'inert' })).raison).toBe('inert');
    expect(classerAtteinte(fait({ left: -346.3, declare: 'aria-hidden' })).raison).toBe('aria-hidden');
    expect(classerAtteinte(fait({ declare: 'inert' })).exclu).toBe(true);
  });

  test("une boîte sans surface n'a pas de centre à juger", () => {
    expect(classerAtteinte(fait({ width: 0 })).raison).toBe('boîte vide');
    expect(classerAtteinte(fait({ height: 0 })).exclu).toBe(true);
  });
});

describe('ce qui était déjà mesuré garde exactement son verdict', () => {
  test('un contrôle qui retombe sur lui-même est atteint', () => {
    const verdict = mesure(fait());

    expect(verdict.ok).toBe(true);
    expect(verdict.par).toBe('BUTTON');
    expect(verdict.hauteur).toBe(44);
  });

  test("un contrôle volé par un disque flottant reste volé, et dit PAR QUOI", () => {
    const verdict = mesure(fait({ toucher: 'un autre', par: 'un disque flottant' }));

    expect(verdict.ok).toBe(false);
    expect(verdict.par).toBe('un disque flottant');
    expect(verdict.raison).toBe('volé');
  });

  test('rien sous le centre reste un échec', () => {
    expect(mesure(fait({ toucher: 'rien', par: 'rien' })).ok).toBe(false);
  });

  test("les bornes du cadre n'ont pas bougé : un centre posé EXACTEMENT sur le bord était dehors, il l'est encore", () => {
    expect(mesure(fait({ left: -22, width: 44 })).raison).toBe('hors viewport');
    expect(mesure(fait({ left: 368, width: 44 })).raison).toBe('hors viewport');
  });
});

describe("le relevé des exclusions se LIT — sinon un gate redevient aveugle en silence", () => {
  test('il compte et nomme, groupé par raison', () => {
    const resume = resumeExclusions({
      controls: [],
      texts: [],
      exclus: [
        { quoi: 'contrôle', nom: 'a', raison: 'écrêté par MAIN#contenu' },
        { quoi: 'contrôle', nom: 'b', raison: 'écrêté par MAIN#contenu' },
        { quoi: 'texte', nom: 'c', raison: 'inert' },
      ],
    });

    expect(resume).toBe('3 écartés : 2 écrêté par MAIN#contenu, 1 inert');
  });

  test("aucun écarté se dit aussi — le silence est ce qui a coûté le défaut", () => {
    expect(resumeExclusions({ controls: [], texts: [], exclus: [] })).toBe('0 écarté');
  });

  test('un seul écarté se dit au SINGULIER', () => {
    expect(resumeExclusions({ controls: [], texts: [], exclus: [{ quoi: 'contrôle', nom: 'a', raison: 'inert' }] })).toBe('1 écarté : 1 inert');
  });
});
