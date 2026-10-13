import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { resolveEngagementProgress } from '@meeshy/shared/utils/engagement-progress';
import { PROGRESSION_CONCEPTS, progressionConcepts, type ProgressionConcept } from '@meeshy/shared/utils/progression-layout';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { ENGAGEMENT_PROGRESS_FIXTURE } from '@/lib/api/engagement-fixture';
import { ALL_LEVEL_STEPS, GAME_EXTRAS_TODAY, gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { loadGameCatalog } from '@/lib/i18n-game-catalog';
import { interfaceDirection, SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { conceptView } from './progression-concepts';
import { conceptState } from './progression-state';

/**
 * LA PHRASE D'ÉTAT D'UN CONCEPT (#10540) — retour du porteur : « j'ai 77 099 points, il te manque 1 839
 * points, points à convertir 5 823, niveau 27 ». Trois chiffres justes, qui mesurent trois choses, et
 * aucun ne disait laquelle. Chaque valeur en cours est désormais suivie d'une phrase qui dit l'étape où
 * l'on est et ce que le chiffre vise.
 */
beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression' });
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadGameCatalog(language)));
});
afterEach(() => {
  document.documentElement.lang = 'fr';
  document.documentElement.dir = 'ltr';
});
afterAll(async () => {
  await releaseHappyDomIfRegistered();
});

const NOW = new Date(`${GAME_EXTRAS_TODAY}T10:00:00.000Z`);
const before = resolveEngagementProgress(ENGAGEMENT_PROGRESS_FIXTURE);
const playing: EngagementWithGame = { ...before, game: gameBlockWithExtrasFixture(), mintBadgeLoss: 2 };

type Facts = Parameters<typeof gameBlockWithExtrasFixture>[0];
type Extras = Parameters<typeof gameBlockWithExtrasFixture>[1];

const wallet = before.meesh;
if (wallet === undefined) throw new Error('la fixture sert un porte-monnaie');

/** Le compte du porteur, mesuré en production le 2026-10-13 : niveau 27, 78 Meeshes frappées. */
const JCNM: Facts = { ...ALL_LEVEL_STEPS, score: 77_099, levelRecord: 27, debitablePoints: 5_823, mintedLifetime: 78, balance: 3 };
const jcnm: EngagementWithGame = {
  ...before,
  game: gameBlockWithExtrasFixture(JCNM),
  meesh: { ...wallet, balance: 3, mintedLifetime: 78, debitablePoints: 5_823, mintCost: 7_662, missingPoints: 1_839, canMint: false },
};

const plain = (text: string | null): string => (text ?? '').replace(/\s+/g, ' ');
const state = (concept: ProgressionConcept, view: EngagementWithGame = jcnm): string => plain(conceptState(concept, view, NOW));
const withFacts = (facts: Facts, extras: Extras = {}): EngagementWithGame => ({ ...before, game: gameBlockWithExtrasFixture(facts, extras) });

const inLanguage = (language: InterfaceLanguage): void => {
  document.documentElement.lang = language;
  document.documentElement.dir = interfaceDirection(language);
};

describe('le compte du porteur : trois chiffres, trois phrases', () => {
  test('le niveau dit ce qui est fait dans CE niveau, et ce qu’il reste pour le suivant', () => {
    expect(state('level')).toBe('Niveau 27 : tu as fait 4 199 points sur les 5 500 de ce niveau. Il en reste 1 301 pour le niveau 28.');
  });

  test('les points nomment leurs deux soldes, et « il manque » vise la Meesh, pas le niveau', () => {
    expect(state('points')).toBe(
      'Tu as 77 099 points en poche et 5 823 points à convertir. La Meesh n° 79 coûte 7 662 points : il manque 1 839 points à convertir.',
    );
  });

  test('les Meeshes disent le solde gardé, les frappes faites et ce que la prochaine demande', () => {
    expect(state('meesh')).toBe('Tu gardes 3 Meeshes. Depuis le début, tu en as frappé 78. La Meesh n° 79 coûte 7 662 points : il te manque 1 839 points à convertir.');
  });

  test('1 301 et 1 839 ne se confondent plus : chacun porte sa cible', () => {
    expect(state('level')).toContain('1 301 pour le niveau 28');
    expect(state('level')).not.toContain('1 839');
    expect(state('points')).toContain('1 839 points à convertir');
    expect(state('points')).not.toContain('1 301');
  });
});

describe('le niveau', () => {
  test('retenu par une étape : la phrase dit l’étape, jamais « il reste 0 »', () => {
    const held = withFacts({ score: 100 * 25 * 25, levelRecord: 19, mintedLifetime: 1, missionsDone: 0, flameRecord: 0, glory: 0 });
    expect(state('level', held)).toContain('pour passer le niveau 20');
    expect(state('level', held)).not.toContain('Il en reste 0');
  });

  test('devant un ancien serveur, le reste garde sa cible', () => {
    const { level } = before;
    if (level.nextThreshold === null) throw new Error('la fixture d’avant n’est pas au sommet');
    expect(state('level', before)).toContain(`pour le niveau ${level.level + 1}`);
  });
});

describe('les points', () => {
  test('assez pour frapper : la phrase le dit, sans « il manque »', () => {
    const rich: EngagementWithGame = { ...playing, meesh: { ...wallet, debitablePoints: 1_244 } };
    expect(state('points', rich)).toBe('Tu as 12 440 points en poche et 1 244 points à convertir : assez pour la Meesh n° 4, qui coûte 1 221 points.');
  });

  test('sans porte-monnaie servi, le solde à convertir se déduit du prix et du manque, jamais du score', () => {
    const { meesh: _meesh, ...bare } = jcnm;
    expect(state('points', bare)).toContain('5 823 points à convertir');
  });
});

describe('la Flamme, les missions, la ligue, la saison : l’étape où l’on est', () => {
  test('une Flamme en danger dit quoi faire, et avant quand', () => {
    const risky = withFacts({ streak: 6, lastActiveDay: '2026-10-04' });
    expect(risky.game?.flame.status).toBe('at-risk');
    expect(state('flame', risky)).toBe('Ta Flamme de 6 jours est en danger : fais un geste avant minuit pour la garder.');
  });

  test('une Flamme allumée dit depuis quand, et ce qu’elle rapporte', () => {
    expect(playing.game?.flame.status).toBe('lit');
    expect(state('flame', playing)).toContain('Ta Flamme tient depuis 6 jours');
    expect(state('flame', playing)).toContain('12 % de plus');
  });

  test('les missions disent combien sont faites et ce qu’il reste pour le coffre', () => {
    expect(state('missions', playing)).toBe('Missions faites : 1 sur 3. Il en reste 2 pour ouvrir le coffre.');
  });

  test('avant le niveau 5, les missions disent où elles s’ouvrent et où tu en es', () => {
    const early = withFacts({ score: 400, levelRecord: 2 });
    expect(state('missions', early)).toContain('Les missions s’ouvrent au niveau 5');
    expect(state('missions', early)).toContain('Tu es au niveau 2');
  });

  test('la ligue dit la place, les points de la semaine et la zone', () => {
    const current = playing.game?.league?.current;
    if (current === null || current === undefined) throw new Error('la fixture est placée en ligue');
    const line = state('league', playing);
    expect(line).toContain(`rang ${current.rank} sur ${current.groupSize}`);
    expect(line).toContain('410 points cette semaine');
    expect(line).toMatch(/zone de montée/);
  });

  test('la saison dit la semaine, l’étape, et ce qu’il manque pour la suivante', () => {
    const season = playing.game?.season;
    if (season === null || season === undefined) throw new Error('la fixture sert une saison');
    const line = state('season', playing);
    expect(line).toContain(`Saison ${season.number}, semaine ${season.week} sur 8`);
    expect(line).toContain(`étape ${season.steps} sur ${season.stepsTotal}`);
    expect(line).toMatch(/Il manque \d+ étoiles? pour l’étape suivante/);
  });

  test('le Prestige dit où il s’ouvre et où tu en es', () => {
    expect(state('prestige', playing)).toBe('Le Prestige s’ouvre au niveau 100. Tu es au niveau 11.');
  });
});

describe('chaque concept servi a sa phrase d’état, dans les sept langues', () => {
  for (const language of SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[]) {
    test(`${language} : quinze phrases, sans paramètre nu ni clé nue`, () => {
      inLanguage(language);
      for (const view of [playing, jcnm]) {
        for (const concept of PROGRESSION_CONCEPTS) {
          const line = conceptState(concept, view, NOW);
          expect({ language, concept, present: line !== null && line.trim() !== '' }).toEqual({ language, concept, present: true });
          expect({ language, concept, line, naked: /\{[a-z]+\}|game\.[a-z]/i.test(line ?? '') }).toEqual({ language, concept, line, naked: false });
        }
      }
    });
  }

  test('les phrases sont traduites, pas recopiées du français', () => {
    const french = PROGRESSION_CONCEPTS.map((concept) => conceptState(concept, jcnm, NOW));
    for (const language of (SUPPORTED_INTERFACE_LANGUAGES as readonly InterfaceLanguage[]).filter((code) => code !== 'fr')) {
      inLanguage(language);
      const copied = PROGRESSION_CONCEPTS.filter((concept, index) => conceptState(concept, jcnm, NOW) === french[index]);
      expect({ language, copied }).toEqual({ language, copied: [] });
    }
  });

  test('devant un ancien serveur, un concept sans donnée ne promet rien : pas de phrase inventée', () => {
    for (const concept of progressionConcepts(before)) {
      const line = conceptState(concept, before, NOW);
      expect({ concept, naked: /\{[a-z]+\}|game\.[a-z]/i.test(line ?? '') }).toEqual({ concept, naked: false });
    }
    expect(conceptState('glory', before, NOW)).toBeNull();
  });
});

describe('la vue du concept porte la phrase : la carte et la fiche lisent la même', () => {
  test('conceptView rend la phrase d’état de conceptState', () => {
    for (const concept of PROGRESSION_CONCEPTS) expect(conceptView(concept, jcnm, NOW).state).toBe(conceptState(concept, jcnm, NOW));
  });
});
