/**
 * L'ÉLAN — le multiplicateur de points (#5749).
 *
 * Ces témoins portent sur la LOI, pas sur son câblage : ils disent quel
 * facteur sort de quelles entrées, et surtout ce que la loi REFUSE de faire.
 */

import { describe, it, expect } from '@jest/globals';
import {
  computeEngagementElan,
  creditedPoints,
  ELAN_MAX,
  ELAN_MIN,
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
