/**
 * L'ÉLAN — le multiplicateur de points (#5749).
 *
 * Ces témoins portent sur la LOI, pas sur son câblage : ils disent quel
 * facteur sort de quelles entrées, et surtout ce que la loi REFUSE de faire.
 */

import { describe, it, expect } from 'vitest';
import {
  computeEngagementElan,
  creditedPoints,
  elanInputsFromRows,
  ELAN_HIGH_BADGE_THRESHOLD,
  ELAN_MAX,
  ELAN_MIN,
  ELAN_WINDOW_DAYS,
} from '../utils/engagement-elan.js';

const sansAssise = { achievementCount: 0, highBadgeCount: 0 } as const;

describe('computeEngagementElan — les trois crans d\'activité', () => {
  it('rend le neutre pour une seule famille active', () => {
    expect(computeEngagementElan({ activeFamilies: ['content'], ...sansAssise }).factor).toBe(1);
  });

  it('monte d\'un cran par famille SIMULTANÉE, jamais par volume', () => {
    expect(computeEngagementElan({ activeFamilies: ['content', 'comment'], ...sansAssise }).factor).toBe(2);
    expect(
      computeEngagementElan({ activeFamilies: ['content', 'comment', 'conversation'], ...sansAssise }).factor,
    ).toBe(3);
    expect(
      computeEngagementElan({
        activeFamilies: ['content', 'comment', 'conversation', 'tool'],
        ...sansAssise,
      }).factor,
    ).toBe(4);
  });

  it('ne compte une famille qu\'UNE fois, même répétée', () => {
    const elan = computeEngagementElan({
      activeFamilies: ['content', 'content', 'content', 'content'],
      ...sansAssise,
    });
    expect(elan.activeFamilyCount).toBe(1);
    expect(elan.factor).toBe(1);
  });

  it('rend le neutre sans aucune famille active — le tout premier geste d\'un compte', () => {
    expect(computeEngagementElan({ activeFamilies: [], ...sansAssise }).factor).toBe(ELAN_MIN);
  });
});

describe('computeEngagementElan — l\'assise ne vaut qu\'UN cran', () => {
  it('s\'acquiert par dix succès', () => {
    const elan = computeEngagementElan({
      activeFamilies: ['content'],
      achievementCount: 10,
      highBadgeCount: 0,
    });
    expect(elan.hasStanding).toBe(true);
    expect(elan.factor).toBe(2);
  });

  it('s\'acquiert aussi par cinq badges de palier élevé', () => {
    const elan = computeEngagementElan({
      activeFamilies: ['content'],
      achievementCount: 0,
      highBadgeCount: 5,
    });
    expect(elan.hasStanding).toBe(true);
    expect(elan.factor).toBe(2);
  });

  it('ne suffit JAMAIS à porter un compte inactif au-delà de ×2', () => {
    // Un vétéran couvert d'acquis mais actif dans une seule famille reste à 2 ;
    // un nouveau actif dans les quatre familles atteint 4. C'est l'inverse
    // exact qui rendrait l'accélérateur absurde.
    const veteranInactif = computeEngagementElan({
      activeFamilies: ['content'],
      achievementCount: 999,
      highBadgeCount: 999,
    });
    const nouveauTresActif = computeEngagementElan({
      activeFamilies: ['content', 'comment', 'conversation', 'tool'],
      ...sansAssise,
    });
    expect(veteranInactif.factor).toBe(2);
    expect(nouveauTresActif.factor).toBe(4);
    expect(nouveauTresActif.factor).toBeGreaterThan(veteranInactif.factor);
  });
});

describe('computeEngagementElan — le plafond est DUR', () => {
  it('atteint ×5 avec les quatre familles ET l\'assise', () => {
    expect(
      computeEngagementElan({
        activeFamilies: ['content', 'comment', 'conversation', 'tool'],
        achievementCount: 10,
        highBadgeCount: 0,
      }).factor,
    ).toBe(5);
  });

  it('ne dépasse jamais ×5, quelle que soit la composition', () => {
    const extreme = computeEngagementElan({
      activeFamilies: ['content', 'comment', 'conversation', 'tool', 'content', 'tool'],
      achievementCount: Number.MAX_SAFE_INTEGER,
      highBadgeCount: Number.MAX_SAFE_INTEGER,
    });
    expect(extreme.factor).toBe(ELAN_MAX);
  });

  it('ignore une famille inconnue plutôt que de lever — un axe neuf côté serveur', () => {
    const elan = computeEngagementElan({
      activeFamilies: ['content', 'famille-du-futur' as never],
      ...sansAssise,
    });
    expect(elan.activeFamilyCount).toBe(1);
    expect(elan.factor).toBe(1);
  });

  it('traite une entrée non finie ou négative comme zéro', () => {
    const elan = computeEngagementElan({
      activeFamilies: ['content'],
      achievementCount: Number.NaN,
      highBadgeCount: -50,
    });
    expect(elan.hasStanding).toBe(false);
    expect(elan.factor).toBe(1);
  });
});

describe('creditedPoints — le poids appliqué AU MOMENT du crédit', () => {
  it('multiplie le poids de l\'axe par le facteur', () => {
    const elan = computeEngagementElan({
      activeFamilies: ['content', 'comment', 'conversation'],
      ...sansAssise,
    });
    // Un contenu vaut 3 ; à ×3, il en crédite 9.
    expect(creditedPoints(3, elan)).toBe(9);
  });

  it('laisse le poids inchangé au neutre', () => {
    const elan = computeEngagementElan({ activeFamilies: ['tool'], ...sansAssise });
    expect(creditedPoints(1, elan)).toBe(1);
    expect(creditedPoints(5, elan)).toBe(5);
  });
});

/**
 * `elanInputsFromRows` — la traduction des LIGNES de base en entrées de loi.
 *
 * Cette fonction est celle que la passerelle appelle réellement ; la loi
 * au-dessus ne voit jamais une ligne de base. Elle était pourtant sans aucun
 * témoin : la couverture du fichier tenait entièrement à `computeEngagementElan`,
 * qu'on alimente à la main dans les tests. C'est la forme classique du trou —
 * **la fonction la mieux testée est celle qu'on appelle le moins.**
 */
describe('elanInputsFromRows — ce que la base dit, ce que la loi reçoit', () => {
  const maintenant = new Date('2026-09-09T12:00:00.000Z');
  const ilYA = (jours: number) =>
    new Date(maintenant.getTime() - jours * 24 * 60 * 60 * 1000);
  const famillePar = (axisKey: string) =>
    (axisKey.split('.')[0] ?? '') === 'content'
      ? ('content' as const)
      : axisKey.startsWith('comment.')
        ? ('comment' as const)
        : null;

  const entrees = (params: {
    counters?: { axisKey: string; updatedAt: Date | string }[];
    milestones?: { milestoneType: string; milestoneKey: string }[];
  }) =>
    elanInputsFromRows({
      counters: params.counters ?? [],
      milestones: params.milestones ?? [],
      familyOf: famillePar,
      now: maintenant,
    });

  it('retient une famille active DANS la fenêtre de sept jours', () => {
    const vu = entrees({ counters: [{ axisKey: 'content.post', updatedAt: ilYA(3) }] });
    expect(vu.activeFamilies).toEqual(['content']);
  });

  it('écarte un compteur PLUS VIEUX que la fenêtre — un élan se tient, il ne se souvient pas', () => {
    const vu = entrees({ counters: [{ axisKey: 'content.post', updatedAt: ilYA(ELAN_WINDOW_DAYS + 1) }] });
    expect(vu.activeFamilies).toEqual([]);
  });

  it('écarte une date ILLISIBLE plutôt que de la compter comme aujourd\'hui', () => {
    const vu = entrees({ counters: [{ axisKey: 'content.post', updatedAt: 'pas-une-date' }] });
    expect(vu.activeFamilies).toEqual([]);
  });

  it('ne compte une famille QU\'UNE fois, quel que soit le nombre d\'axes', () => {
    const vu = entrees({
      counters: [
        { axisKey: 'content.post', updatedAt: ilYA(1) },
        { axisKey: 'content.story', updatedAt: ilYA(2) },
        { axisKey: 'comment.text', updatedAt: ilYA(2) },
      ],
    });
    expect([...vu.activeFamilies].sort()).toEqual(['comment', 'content']);
  });

  it('ignore un axe dont la famille est INCONNUE, sans le compter pour autant', () => {
    const vu = entrees({ counters: [{ axisKey: 'inconnu.chose', updatedAt: ilYA(1) }] });
    expect(vu.activeFamilies).toEqual([]);
  });

  it('accepte une date TEXTUELLE — la base rend des chaînes sur certains chemins', () => {
    const vu = entrees({ counters: [{ axisKey: 'content.post', updatedAt: ilYA(1).toISOString() }] });
    expect(vu.activeFamilies).toEqual(['content']);
  });

  it('compte les succès, tous paliers confondus', () => {
    const vu = entrees({
      milestones: [
        { milestoneType: 'achievement', milestoneKey: 'a:1' },
        { milestoneType: 'achievement', milestoneKey: 'b:10000' },
      ],
    });
    expect(vu.achievementCount).toBe(2);
  });

  it('ne retient un BADGE que si son palier atteint le seuil d\'assise', () => {
    const vu = entrees({
      milestones: [
        { milestoneType: 'badge', milestoneKey: `x:${ELAN_HIGH_BADGE_THRESHOLD}` },
        { milestoneType: 'badge', milestoneKey: `y:${ELAN_HIGH_BADGE_THRESHOLD - 1}` },
      ],
    });
    expect(vu.highBadgeCount).toBe(1);
  });

  it('ignore un palier dont la clé ne porte AUCUN nombre, sans le compter', () => {
    const vu = entrees({ milestones: [{ milestoneType: 'badge', milestoneKey: 'sans-nombre' }] });
    expect(vu.highBadgeCount).toBe(0);
  });

  it('ignore un type de palier INCONNU — ni succès, ni assise', () => {
    const vu = entrees({ milestones: [{ milestoneType: 'streak', milestoneKey: 'z:1000' }] });
    expect(vu).toEqual({ activeFamilies: [], achievementCount: 0, highBadgeCount: 0 });
  });

  it('prend l\'horloge RÉELLE quand aucune n\'est fournie', () => {
    const vu = elanInputsFromRows({
      counters: [{ axisKey: 'content.post', updatedAt: new Date() }],
      milestones: [],
      familyOf: famillePar,
    });
    expect(vu.activeFamilies).toEqual(['content']);
  });
});
