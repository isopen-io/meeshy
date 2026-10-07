/**
 * LES CONCEPTS DE « PROGRESSION », DANS L'ORDRE (#9563).
 *
 * La première page ne porte plus que des lignes : une par concept, avec sa
 * valeur et un chevron. La fiche de chaque concept et le tableau de bord
 * parcourent la MÊME liste. Cette liste est donc écrite une fois, ici, pour le
 * web et pour iOS : deux clients qui la composeraient chacun de leur côté
 * finiraient par ranger « Ligue » à deux places différentes.
 */

import { describe, it, expect } from 'vitest';
import { resolveEngagementProgress } from '../utils/engagement-progress.js';
import type { EngagementProgressPayload } from '../types/engagement.js';
import { PROGRESSION_CONCEPTS, progressionConcepts } from '../utils/progression-layout.js';

const VIDE: EngagementProgressPayload = {
  counters: [],
  milestones: [],
  streak: { currentStreakDays: 0, longestStreakDays: 0 },
  level: { engagementScore: 0 },
};

const AVEC_MEESH = {
  ...VIDE,
  meesh: { balance: 1, mintedLifetime: 1, debitablePoints: 0, floorPoints: 0, missingPoints: 0, mintCost: 1200 },
} as EngagementProgressPayload;

const AVANT = resolveEngagementProgress(VIDE);

describe("l'ordre des concepts", () => {
  it("est celui de l'issue, clé pour clé", () => {
    expect([...PROGRESSION_CONCEPTS]).toEqual([
      'level',
      'points',
      'meesh',
      'glory',
      'flame',
      'missions',
      'league',
      'season',
      'prestige',
      'elans',
      'badges',
      'defis',
      'succes',
      'showcase',
      'atlas',
    ]);
  });

  it('sert les quinze concepts quand la passerelle sert tout', () => {
    const tout = {
      ...resolveEngagementProgress({ ...AVEC_MEESH, achievementReach: {} }),
      game: { league: {}, season: {}, trophies: {}, atlas: {}, prestige: {} },
    };
    expect(progressionConcepts(tout)).toEqual([...PROGRESSION_CONCEPTS]);
  });

  it("garde l'ordre déclaré, quelles que soient les lignes absentes", () => {
    const servis = progressionConcepts({ ...AVANT, game: { atlas: {}, league: {} } });
    const rangs = servis.map((cle) => PROGRESSION_CONCEPTS.indexOf(cle));
    expect(rangs).toEqual([...rangs].sort((a, b) => a - b));
    expect(new Set(servis).size).toBe(servis.length);
  });
});

describe("une ligne n'existe que si sa donnée est servie", () => {
  it('devant un ancien serveur (aucun bloc `game`) : niveau, Flamme, Élans, badges, succès', () => {
    expect(progressionConcepts(AVANT)).toEqual(['level', 'flame', 'elans', 'badges', 'succes']);
  });

  it('ajoute les Meeshes dès que le solde est servi, même sans bloc `game`', () => {
    expect(progressionConcepts(resolveEngagementProgress(AVEC_MEESH))).toEqual([
      'level',
      'meesh',
      'flame',
      'elans',
      'badges',
      'succes',
    ]);
  });

  it("n'ouvre les défis que si la carte d'atteignabilité est servie", () => {
    expect(progressionConcepts(AVANT)).not.toContain('defis');
    expect(progressionConcepts(resolveEngagementProgress({ ...VIDE, achievementReach: {} }))).toContain('defis');
  });

  it('le bloc `game` sert points, Meeshes, gloire et missions', () => {
    expect(progressionConcepts({ ...AVANT, game: {} })).toEqual([
      'level',
      'points',
      'meesh',
      'glory',
      'flame',
      'missions',
      'elans',
      'badges',
      'succes',
    ]);
  });

  it.each([
    ['league', 'league'],
    ['season', 'season'],
    ['prestige', 'prestige'],
    ['trophies', 'showcase'],
    ['atlas', 'atlas'],
  ] as const)("l'extension `%s` ouvre la ligne `%s`, et elle seule", (extension, concept) => {
    const sans = progressionConcepts({ ...AVANT, game: {} });
    const avec = progressionConcepts({ ...AVANT, game: { [extension]: {} } });
    expect(sans).not.toContain(concept);
    expect(avec.filter((cle) => !sans.includes(cle))).toEqual([concept]);
  });

  it("garde la ligne « Saison » quand la passerelle dit qu'aucune saison ne court (`null`)", () => {
    expect(progressionConcepts({ ...AVANT, game: { season: null } })).toContain('season');
  });
});
