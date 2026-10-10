import { beforeAll, describe, expect, test } from 'bun:test';

import {
  GUIDE_ACTIONS,
  GUIDE_MOMENT_KEYS,
  ONBOARDING_STEPS,
  guideMoment,
  type GuideEvent,
  type GuideMomentKey,
} from '@meeshy/shared/utils/game/guide';

import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { actionLabel, momentCopy, stepCopy } from './game-guide-copy';
import { gameRules } from './game-rules-copy';

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});

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
const copyOf = (key: GuideMomentKey, seen: readonly string[] = []) => plain(momentCopy(guideMoment(EVENTS[key], seen), 'fr'));

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
    expect(momentCopy(moment, 'fr').means).toContain('1 niveau,');
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
    expect(momentCopy(guideMoment({ kind: 'badge-extinguished', missingActions: 1 }, []), 'fr').next).toContain('1 action ');
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
    expect(momentCopy(moment, 'fr').next).toContain('prochain geste');
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
      expect(actionLabel(action, 'fr').length).toBeGreaterThan(3);
    });
  }
});

describe('l’intégration en sept étapes', () => {
  test('sept cartes, chacune complète', () => {
    expect(ONBOARDING_STEPS).toHaveLength(7);
    for (const step of ONBOARDING_STEPS) {
      const copy = stepCopy(step, { language: 'fr' });
      expect(copy.what.length).toBeGreaterThan(3);
      expect(copy.means.length).toBeGreaterThan(3);
      expect(copy.next.length).toBeGreaterThan(3);
      expect(copy.action).toBe(actionLabel(step.action, 'fr'));
    }
  });
});

describe('le carnet des règles', () => {
  test('huit règles, numérotées, chacune avec son titre et sa phrase', () => {
    const rules = gameRules('fr');
    expect(rules).toHaveLength(8);
    rules.forEach((rule, i) => {
      expect(rule.index).toBe(i + 1);
      expect(rule.title.length).toBeGreaterThan(3);
      expect(rule.body.length).toBeGreaterThan(10);
    });
  });
});

describe('l’étape qui attend son geste nomme le geste', () => {
  const stepOf = (key: string) => {
    const step = ONBOARDING_STEPS.find((candidate) => candidate.key === key);
    if (step === undefined) throw new Error(`étape attendue : ${key}`);
    return step;
  };

  test('missions et Flamme remplacent « l’étape d’après » par le geste attendu', () => {
    expect(stepCopy(stepOf('missions'), { awaiting: true, language: 'fr' }).next).toContain('mission la plus facile');
    expect(stepCopy(stepOf('flame'), { awaiting: true, language: 'fr' }).next).toContain('Reviens demain');
    expect(stepCopy(stepOf('missions'), { language: 'fr' }).next).toBe('Une Flamme grandit tant que tu reviens.');
  });

  test('le bouton suit l’action qu’on lui donne', () => {
    expect(stepCopy(stepOf('missions'), { awaiting: true, action: 'see-missions', language: 'fr' }).action).toBe('Voir les missions');
  });
});

/**
 * LES SEPT LANGUES (#9379) — le guide dit la même chose au même moment partout :
 * chaque moment, chaque étape, chaque action et chaque règle existe dans les
 * sept langues, sans paramètre resté en clair ni clé nue.
 */
describe('Mee et Meo parlent les sept langues', () => {
  const clean = (text: string): boolean => text.trim().length > 3 && !/\{\w+\}|undefined|NaN|^game\./.test(text);

  for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
    test(`${language} : les treize moments, les sept étapes, les vingt et une actions, les huit règles`, () => {
      for (const key of GUIDE_MOMENT_KEYS) {
        const copy = momentCopy(guideMoment(EVENTS[key], []), language);
        for (const part of [copy.what, copy.means, copy.next, copy.short, copy.action]) expect({ key, part, ok: clean(part) }).toEqual({ key, part, ok: true });
      }
      for (const step of ONBOARDING_STEPS) {
        const copy = stepCopy(step, { language });
        for (const part of [copy.what, copy.means, copy.next, copy.action]) expect({ step: step.key, part, ok: clean(part) }).toEqual({ step: step.key, part, ok: true });
        const awaiting = stepCopy(step, { awaiting: true, language });
        expect(clean(awaiting.next)).toBe(true);
      }
      for (const action of GUIDE_ACTIONS) expect({ action, ok: clean(actionLabel(action, language)) }).toEqual({ action, ok: true });
      for (const rule of gameRules(language)) expect({ rule: rule.index, ok: clean(rule.title) && clean(rule.body) }).toEqual({ rule: rule.index, ok: true });
    });
  }

  test('les variantes d’un moment suivent la donnée : premier rang du dernier palier, Flamme rallumable ou non, Prestige ou sommet', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const variants: GuideEvent[] = [
        { kind: 'new-tier', tier: 'galaxie', nextTierLevel: null },
        { kind: 'new-rank', rank: 'mythe', division: null, glory: 99999, gloryMissing: null },
        { kind: 'treasury-tier', tier: 'reserve', nextTierMissing: null },
        { kind: 'flame-out', lostDays: 0, relightPrice: 3, canRelight: false },
        { kind: 'level-100', canPrestige: false },
        { kind: 'first-mint-possible', price: 1221, levelsLost: 0, gloryGain: 100 },
      ];
      for (const event of variants) {
        const copy = momentCopy(guideMoment(event, []), language);
        for (const part of [copy.what, copy.means, copy.next, copy.short]) expect({ event: event.kind, part, ok: clean(part) }).toEqual({ event: event.kind, part, ok: true });
      }
    }
  });

  test('une phrase traduite n’est pas celle du français', () => {
    const french = momentCopy(guideMoment(EVENTS['first-mint'], []), 'fr');
    for (const language of SUPPORTED_INTERFACE_LANGUAGES.filter((code) => code !== 'fr')) {
      expect(momentCopy(guideMoment(EVENTS['first-mint'], []), language).what).not.toBe(french.what);
    }
  });
});
