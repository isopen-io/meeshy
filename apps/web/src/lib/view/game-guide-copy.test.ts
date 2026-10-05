import { describe, expect, test } from 'bun:test';

import {
  GUIDE_ACTIONS,
  GUIDE_MOMENT_KEYS,
  ONBOARDING_STEPS,
  guideMoment,
  type GuideEvent,
  type GuideMomentKey,
} from '@meeshy/shared/utils/game/guide';

import { ACTION_LABELS, GAME_RULES, momentCopy, stepCopy } from './game-guide-copy';

/**
 * CE QUE DISENT MEE ET MEO (#9379) — la structure de la conception, partie
 * III : « Ce qui vient d'arriver → Ce que ça veut dire → L'étape d'après → Un
 * bouton qui y mène ». La loi partagée choisit le MOMENT ; ce fichier le dit.
 */

const EVENTS: Readonly<Record<GuideMomentKey, GuideEvent>> = {
  'first-level': { kind: 'first-level', level: 2, pointsToNext: 50 },
  'new-tier': { kind: 'new-tier', tier: 'lueur', nextTierLevel: 20 },
  'missions-unlocked': { kind: 'missions-unlocked' },
  'first-mint-possible': { kind: 'first-mint-possible', price: 1221, levelsLost: 5, gloryGain: 100 },
  'first-mint': { kind: 'first-mint', levelBefore: 14, levelAfter: 9, tailwindUntilLevel: 14 },
  'badge-extinguished': { kind: 'badge-extinguished', missingActions: 37 },
  'price-rises': { kind: 'price-rises', nextPrice: 1294 },
  'new-rank': { kind: 'new-rank', rank: 'voix', division: 2, glory: 1700, gloryMissing: 300 },
  'treasury-tier': { kind: 'treasury-tier', tier: 'escarcelle', nextTierMissing: 40 },
  'flame-at-risk': { kind: 'flame-at-risk', days: 6 },
  'flame-out': { kind: 'flame-out', lostDays: 9, relightPrice: 3, canRelight: true },
  'return-after-absence': { kind: 'return-after-absence', daysAway: 9 },
  'level-100': { kind: 'level-100', canPrestige: true },
};

/** Les milliers s'écrivent avec une espace insécable fine : on compare sur des espaces ordinaires. */
const plain = (copy: ReturnType<typeof momentCopy>) => ({
  ...copy,
  means: copy.means.replace(/\s/g, ' '),
  next: copy.next.replace(/\s/g, ' '),
});
const copyOf = (key: GuideMomentKey, seen: readonly string[] = []) => plain(momentCopy(guideMoment(EVENTS[key], seen)));

describe('chaque moment du catalogue a ses quatre parties', () => {
  for (const key of GUIDE_MOMENT_KEYS) {
    test(`${key} : ce qui arrive, ce que ça veut dire, la suite, le bouton, la version courte`, () => {
      const copy = copyOf(key);
      for (const part of [copy.what, copy.means, copy.next, copy.short, copy.action]) {
        expect(part.length).toBeGreaterThan(3);
        expect(part).not.toContain('undefined');
        expect(part).not.toContain('NaN');
        expect(part).not.toContain('{');
      }
    });
  }
});

describe('les chiffres du moment se disent', () => {
  test('premier niveau : ce qu’il manque pour le suivant', () => {
    expect(copyOf('first-level').next).toContain('50 points');
    expect(copyOf('first-level').next).toContain('niveau 3');
  });
  test('première frappe possible : le prix, les niveaux perdus, la Gloire', () => {
    const copy = copyOf('first-mint-possible');
    expect(copy.means).toContain('1 221 points');
    expect(copy.means).toContain('5 niveaux');
    expect(copy.means).toContain('+100 de Gloire');
  });
  test('un seul niveau perdu s’accorde au singulier', () => {
    const moment = guideMoment({ kind: 'first-mint-possible', price: 1221, levelsLost: 1, gloryGain: 100 }, []);
    expect(momentCopy(moment).means).toContain('1 niveau,');
  });
  test('première frappe : 14 → 9 et le Vent arrière', () => {
    const copy = copyOf('first-mint');
    expect(copy.means).toContain('de 14 à 9');
    expect(copy.means).toContain('Vent arrière');
    expect(copy.next).toContain('niveau 14');
  });
  test('un badge éteint : la distance pour le rallumer', () => {
    expect(copyOf('badge-extinguished').next).toContain('37 actions');
  });
  test('un seul pas pour rallumer', () => {
    expect(momentCopy(guideMoment({ kind: 'badge-extinguished', missingActions: 1 }, [])).next).toContain('1 action ');
  });
  test('le prix monte : la prochaine', () => {
    expect(copyOf('price-rises').next).toContain('1 294 points');
  });
  test('nouveau rang : le nom, la division', () => {
    expect(copyOf('new-rank').what).toContain('Voix II');
    expect(copyOf('new-rank').next).toContain('300');
  });
  test('Flamme éteinte : le prix du rallumage quand c’est possible', () => {
    expect(copyOf('flame-out').next).toContain('3 Meeshes');
  });
  test('Flamme éteinte et plus rallumable : on dit ce qui arrive ensuite', () => {
    const moment = guideMoment({ kind: 'flame-out', lostDays: 0, relightPrice: 3, canRelight: false }, []);
    expect(momentCopy(moment).next).toContain('prochain geste');
  });
  test('retour : les jours d’absence', () => {
    expect(copyOf('return-after-absence').means).toContain('9 jours');
  });
  test('niveau 100 : Prestige ou sommet', () => {
    expect(copyOf('level-100').next).toContain('Prestige');
  });
});

describe('les boutons mènent quelque part', () => {
  for (const action of GUIDE_ACTIONS) {
    test(`${action} a son libellé`, () => {
      expect(ACTION_LABELS[action].length).toBeGreaterThan(3);
    });
  }
});

describe('l’intégration en sept étapes', () => {
  test('sept cartes, chacune complète', () => {
    expect(ONBOARDING_STEPS).toHaveLength(7);
    for (const step of ONBOARDING_STEPS) {
      const copy = stepCopy(step);
      expect(copy.what.length).toBeGreaterThan(3);
      expect(copy.means.length).toBeGreaterThan(3);
      expect(copy.next.length).toBeGreaterThan(3);
      expect(copy.action).toBe(ACTION_LABELS[step.action]);
    }
  });
});

describe('le carnet des règles', () => {
  test('huit règles, numérotées, chacune avec son titre et sa phrase', () => {
    expect(GAME_RULES).toHaveLength(8);
    GAME_RULES.forEach((rule, i) => {
      expect(rule.index).toBe(i + 1);
      expect(rule.title.length).toBeGreaterThan(3);
      expect(rule.body.length).toBeGreaterThan(10);
    });
  });
});
