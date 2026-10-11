/**
 * LA LOI DU CARNET, MISE EN VECTEURS (#10155) — le rattrapage (`photo-catch-up`), la proposition d'une
 * transition (`photo-offer`) et la situation lue dans le bloc `game` (`photo-standing`).
 *
 * Même contrat que `game-vectors-law-v2.ts`, qui les déclare et les assemble : chaque cas porte `input.law`,
 * `expected` est la sortie de la loi TS, rejouée par iOS (`GameLawVectorEvaluatorPhoto.swift`) sur le miroir
 * du SDK (`GamePhotoCatchUpLaw.swift`). Sur divergence, c'est le TS qui a raison.
 *
 * `photo-standing` ne porte que les cinq blocs que la situation lit (`glory`, `level`, `mint`, `treasury`,
 * `flame`), produits par `buildGameBlock` ; le rejeu Swift les pose sur un bloc complet du même producteur.
 *
 * Les cas reprennent ceux de `GamePhotoCatchUpTests.swift` et de `moments-catch-up.test.ts` : les témoins
 * qui vivaient de chaque côté deviennent UN contrat.
 */

import type { GameBlock } from '../../types/game.js';
import { drawDailyMissions } from '../../utils/game/missions.js';
import { buildGameBlock, type GameBlockFacts } from '../../utils/game/game-block.js';
import {
  catchUpStandingOf,
  photoCatchUp,
  photoOfferFor,
  photoStepsReached,
  photoTrackOf,
  type PhotoCatchUpStanding,
  type PhotoStandingSource,
} from '../../utils/game/photo-catch-up.js';

export type GameVectorInputPhoto =
  | { readonly law: 'photo-catch-up'; readonly standing: PhotoCatchUpStanding; readonly kept: readonly string[] }
  | {
      readonly law: 'photo-offer';
      readonly momentIds: readonly string[];
      readonly standing: PhotoCatchUpStanding;
      readonly kept: readonly string[];
    }
  | { readonly law: 'photo-standing'; readonly game: PhotoStandingSource };

export const GAME_VECTOR_LAWS_PHOTO = ['photo-catch-up', 'photo-offer', 'photo-standing'] as const;

export function evaluateGameVectorPhoto(input: GameVectorInputPhoto): unknown {
  switch (input.law) {
    case 'photo-catch-up':
      return {
        steps: photoStepsReached(input.standing),
        entries: photoCatchUp(input.standing, input.kept).map(({ id, track, state, blockedBy }) => ({ id, track, state, blockedBy })),
      };
    case 'photo-offer':
      return {
        offer: photoOfferFor(input.momentIds, input.standing, input.kept),
        tracks: input.momentIds.map(photoTrackOf),
      };
    case 'photo-standing':
      return catchUpStandingOf(input.game);
  }
}

const vector = (_label: string, input: GameVectorInputPhoto) => ({ _label, input, expected: evaluateGameVectorPhoto(input) });

const standing = (over: Partial<PhotoCatchUpStanding> = {}): PhotoCatchUpStanding => ({
  rank: 'murmure',
  division: 5,
  levelRecord: 1,
  prestige: 0,
  minted: 0,
  treasuryTier: null,
  flameRecord: 0,
  ...over,
});

const facts = (over: Partial<GameBlockFacts> = {}): GameBlockFacts => ({
  userId: 'u1',
  today: '2026-10-05',
  score: 121_800,
  levelRecord: 36,
  prestige: 0,
  glory: 7000,
  mythic: false,
  mintedLifetime: 12,
  missionsDone: 3,
  flameRecord: 23,
  debitablePoints: 121_800,
  balance: 9,
  streak: 4,
  lastActiveDay: '2026-10-05',
  broken: null,
  freezes: 1,
  lastRelightDay: null,
  missions: drawDailyMissions({ userId: 'u1', dayKey: '2026-10-05', level: 34, flameDays: 4, treasury: 0 }).missions.map((m, i) => ({
    ...m,
    id: `64b7f0c2a1b2c3d4e5f6a7b${i}`,
    progress: 0,
    completedAt: null,
  })),
  rerollsUsedToday: 0,
  chestClaimed: false,
  chestReward: null,
  guideSeen: [],
  ...over,
});

/** Un bloc servi par une passerelle d'avant l'échelle ouverte et les cinq divisions : ni `ladder`, ni `division5`. */
const legacyBlock = (game: GameBlock): GameBlock => {
  const { ladder: _ladder, ...level } = game.level;
  const { division5: _division5, ...glory } = game.glory;
  return { ...game, level, glory };
};

/** Les seuls blocs que la situation lit : un vecteur ne bouge pas quand le reste du bloc `game` évolue. */
const source = ({ glory, level, mint, treasury, flame }: GameBlock): PhotoStandingSource => ({ glory, level, mint, treasury, flame });

const MEESH_UP_TO_30 = ['start', 'meesh:1', 'meesh:10', 'meesh:20', 'meesh:30'];

export function buildGameVectorsPhoto() {
  const catchUps = (
    [
      ['un compte neuf', standing(), []],
      ['53 Meeshes frappées', standing({ minted: 53 }), []],
      ['la centième Meesh', standing({ minted: 100 }), []],
      ['Écho IV', standing({ rank: 'echo', division: 4 }), []],
      ['le Mythe', standing({ rank: 'mythe', division: null }), []],
      ['le Murmure sans division', standing({ division: null }), []],
      ['record de niveau 34', standing({ levelRecord: 34 }), []],
      ['le sommet et deux Prestiges', standing({ levelRecord: 100, prestige: 2 }), []],
      ['un Prestige sous le niveau 100', standing({ levelRecord: 12, prestige: 1 }), []],
      ['le coffret et 45 jours de Flamme', standing({ treasuryTier: 'coffret', flameRecord: 45 }), []],
      ['53 Meeshes, les quatre premières gardées', standing({ minted: 53 }), MEESH_UP_TO_30],
      ['53 Meeshes, la 40e gardée', standing({ minted: 53 }), [...MEESH_UP_TO_30, 'meesh:40']],
      ['les pistes ne s’attendent pas', standing({ minted: 12, flameRecord: 8 }), []],
      ['un carnet complet', standing({ minted: 1 }), ['start', 'meesh:1']],
      ['toutes les pistes', standing({ levelRecord: 100, prestige: 1, minted: 10, treasuryTier: 'bourse', flameRecord: 7 }), []],
      [
        'Légende II, une photo gardée au milieu de chaque piste',
        standing({ rank: 'legende', division: 2, levelRecord: 160, prestige: 3, minted: 41, treasuryTier: 'tresor', flameRecord: 400 }),
        ['rank:voix:3', 'tier:eclat', 'prestige:2', 'meesh:20', 'treasury:coffret', 'flame:30', 'achievement:first_message'],
      ],
      ['des valeurs négatives', standing({ levelRecord: -3, prestige: -1, minted: -5, flameRecord: -2 }), []],
    ] as const
  ).map(([label, s, kept]) => vector(`rattrapage — ${label}`, { law: 'photo-catch-up', standing: s, kept }));

  const offers = (
    [
      ['le plus marquant d’une transition', ['meesh:10', 'tier:lueur', 'rank:murmure:4'], standing({ division: 4, levelRecord: 10, minted: 10 }), ['start', 'meesh:1']],
      ['la 50e sans la 40e propose la 40e', ['meesh:50'], standing({ minted: 50 }), MEESH_UP_TO_30],
      ['un moment hors piste passe tel quel', ['achievement:first_message'], standing(), ['start']],
      ['une piste déjà photographiée', ['meesh:1'], standing({ minted: 1 }), ['start', 'meesh:1']],
      ['aucun moment', [], standing(), []],
      ['deux moments hors piste : le premier', ['trophy:trophy.flame.100', 'season:3'], standing(), ['start']],
      ['deux Meeshes de la même transition', ['meesh:10', 'meesh:20'], standing({ minted: 20 }), ['start']],
      ['le sommet passe avant la ligue', ['league-up:2026-W40:or', 'prestige:3', 'level-100:0'], standing({ levelRecord: 100, prestige: 3 }), ['start']],
      ['un rang dont la piste est à jour', ['rank:voix:5'], standing({ rank: 'voix', division: 5 }), [
        'start', 'rank:murmure:4', 'rank:murmure:3', 'rank:murmure:2', 'rank:murmure:1',
        'rank:echo:5', 'rank:echo:4', 'rank:echo:3', 'rank:echo:2', 'rank:echo:1',
      ]],
      ['une identité inconnue', ['rank', 'tier:', 'nimporte:quoi'], standing({ levelRecord: 20 }), []],
    ] as const
  ).map(([label, momentIds, s, kept]) => vector(`proposition — ${label}`, { law: 'photo-offer', momentIds, standing: s, kept }));

  const standings = (
    [
      ['Voix V, record 36', buildGameBlock(facts())],
      ['devant un ancien serveur', legacyBlock(buildGameBlock(facts()))],
      ['la série en cours dépasse le record', buildGameBlock(facts({ flameRecord: 4, streak: 9 }))],
      ['aucune Meesh frappée, Prestige 2', buildGameBlock(facts({ mintedLifetime: 0, prestige: 2 }))],
      ['le Mythe', buildGameBlock(facts({ glory: 400_000, mythic: true, balance: 5_000 }))],
    ] as const
  ).map(([label, game]) => vector(`situation — ${label}`, { law: 'photo-standing', game: source(game) }));

  return [...catchUps, ...offers, ...standings];
}
