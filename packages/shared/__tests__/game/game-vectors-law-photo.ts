/**
 * LA LOI DU CARNET, MISE EN VECTEURS (#10155) — le rattrapage (`photo-catch-up`), la proposition d'une
 * transition (`photo-offer`), la situation lue dans le bloc `game` (`photo-standing`) ; et la loi des alertes
 * d'immortalisation (`photo-alert`, #10173), avec l'identité de la réalisation du jour (`photo-moment`).
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
import {
  PHOTO_ALERT_POLICY,
  isBigPhotoMoment,
  photoAlertDigest,
  photoAlertFor,
  photoAlertPacing,
  type PhotoAlertPacing,
  type PhotoAlertPolicy,
  type PhotoMomentRecord,
} from '../../utils/game/photo-alerts.js';
import { photoDayMomentId, photoDayOfMomentId } from '../../utils/game/photo-moments.js';
import type { TreasuryTierKey } from '../../utils/game/treasury.js';
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
  | { readonly law: 'photo-standing'; readonly game: PhotoStandingSource }
  | {
      readonly law: 'photo-alert';
      readonly kind: 'alert';
      readonly reached: readonly string[];
      readonly standing: PhotoCatchUpStanding;
      readonly kept: readonly string[];
      readonly presented: readonly string[];
      readonly baseline: PhotoCatchUpStanding | null;
      readonly policy: PhotoAlertPolicy;
      readonly treasuryPeak: TreasuryTierKey | null;
      readonly pacing: PhotoAlertPacing | null;
    }
  | { readonly law: 'photo-alert'; readonly kind: 'pacing'; readonly pacing: PhotoAlertPacing; readonly policy: PhotoAlertPolicy }
  | { readonly law: 'photo-alert'; readonly kind: 'steps'; readonly standing: PhotoCatchUpStanding; readonly policy: PhotoAlertPolicy }
  | { readonly law: 'photo-alert'; readonly kind: 'digest'; readonly moments: readonly PhotoMomentRecord[] }
  | { readonly law: 'photo-alert'; readonly kind: 'big'; readonly ids: readonly string[] }
  | { readonly law: 'photo-alert'; readonly kind: 'policy' };

/** La réalisation du jour rejoint la loi `photo-moment` (déclarée par la vague 2) par une entrée à part. */
export type GameVectorInputPhotoDay = { readonly law: 'photo-moment'; readonly dayKey: string };

export const GAME_VECTOR_LAWS_PHOTO = ['photo-catch-up', 'photo-offer', 'photo-standing', 'photo-alert'] as const;

export const evaluatePhotoDayVector = (input: GameVectorInputPhotoDay): unknown => {
  const id = photoDayMomentId(input.dayKey);
  return { id, day: photoDayOfMomentId(`day:${input.dayKey}`) };
};

const evaluatePhotoAlert = (input: Extract<GameVectorInputPhoto, { readonly law: 'photo-alert' }>): unknown => {
  switch (input.kind) {
    case 'alert':
      return {
        alert: photoAlertFor({
          reached: input.reached,
          standing: input.standing,
          kept: input.kept,
          presented: input.presented,
          baseline: input.baseline,
          policy: input.policy,
          treasuryPeak: input.treasuryPeak,
          ...(input.pacing === null ? {} : { pacing: input.pacing }),
        }),
      };
    case 'pacing':
      return { pace: photoAlertPacing(input.pacing, input.policy) };
    case 'steps':
      return { ids: photoStepsReached(input.standing, input.policy).map((step) => step.id) };
    case 'digest':
      return { digest: photoAlertDigest(input.moments) };
    case 'big':
      return { big: input.ids.map(isBigPhotoMoment) };
    case 'policy':
      return PHOTO_ALERT_POLICY;
  }
};

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
    case 'photo-alert':
      return evaluatePhotoAlert(input);
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
      ['un palier refait après un Prestige (#10911)', standing({ levelRecord: 34, prestige: 1 }), ['start', 'tier:lueur', 'tier:lumiere', 'tier:eclat']],
      ['au-delà de 100, le record des cycles clos (#10911)', standing({ levelRecord: 120, prestige: 2, pastCycleRecords: [150, 100] }), []],
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
      ['le record des cycles clos (#10911)', buildGameBlock(facts({ prestige: 2, pastCycleRecords: [150, 100] }))],
    ] as const
  ).map(([label, game]) => vector(`situation — ${label}`, { law: 'photo-standing', game: source(game) }));

  return [...catchUps, ...offers, ...standings, ...buildPhotoAlertVectors(), ...buildPhotoDayVectors()];
}

const policy = (over: Partial<PhotoAlertPolicy> = {}): PhotoAlertPolicy => ({ ...PHOTO_ALERT_POLICY, ...over });

const MINUTE = 60_000;
const at = (minutes: number): number => Date.UTC(2026, 9, 11, 8, 0) + minutes * MINUTE;
const pacing = (over: Partial<PhotoAlertPacing> = {}): PhotoAlertPacing => ({
  now: at(600),
  dayKey: '2026-10-11',
  sessionStartedAt: at(0),
  surface: 'passive',
  shown: [],
  ...over,
});

type AlertCase = {
  readonly reached: readonly string[];
  readonly standing: PhotoCatchUpStanding;
  readonly kept?: readonly string[];
  readonly presented?: readonly string[];
  readonly baseline?: PhotoCatchUpStanding | null;
  readonly policy?: PhotoAlertPolicy;
  readonly treasuryPeak?: TreasuryTierKey | null;
  readonly pacing?: PhotoAlertPacing | null;
};

const NEW_ACCOUNT = standing();
const RANK_PASSAGE = policy({ photographs: 'rank-passage' });

function buildPhotoAlertVectors() {
  const alerts = (
    [
      ['ligne de base sans alerte', { reached: ['rank:murmure:4'], standing: standing({ division: 4 }), baseline: null }],
      ['une étape par transition', { reached: ['meesh:10', 'tier:lueur', 'rank:murmure:4'], standing: standing({ division: 4, levelRecord: 10, minted: 10 }), kept: ['start', 'meesh:1'] }],
      ['l’étape ouverte remplace celle qui saute', { reached: ['meesh:50'], standing: standing({ minted: 50 }), kept: MEESH_UP_TO_30, baseline: standing({ minted: 49 }) }],
      ['Légende II sans photo de rang (D20 a)', { reached: ['rank:legende:2'], standing: standing({ rank: 'legende', division: 2 }), kept: ['start'], baseline: standing({ rank: 'legende', division: 3 }) }],
      ['Légende II sans photo de rang (D20 b)', { reached: ['rank:legende:2'], standing: standing({ rank: 'legende', division: 2 }), kept: ['start'], baseline: standing({ rank: 'legende', division: 3 }), policy: policy({ backlog: 'apart' }) }],
      ['déjà franchie à la ligne de base', { reached: ['rank:voix:4'], standing: standing({ rank: 'voix', division: 4 }), baseline: standing({ rank: 'voix', division: 4 }) }],
      ['présentée, jamais reproposée', { reached: ['rank:voix:4'], standing: standing({ rank: 'voix', division: 4 }), presented: ['rank:voix:4'] }],
      ['déjà photographiée', { reached: ['meesh:1'], standing: standing({ minted: 1 }), kept: ['meesh:1'] }],
      ['le départ', { reached: ['start'], standing: NEW_ACCOUNT }],
      ['« rang seul » : Oracle III', { reached: ['rank:oracle:3'], standing: standing({ rank: 'oracle', division: 3 }), policy: RANK_PASSAGE }],
      ['« rang seul » : Voix V propose Écho V', { reached: ['rank:voix:5'], standing: standing({ rank: 'voix', division: 5 }), kept: ['start'], policy: RANK_PASSAGE }],
      ['« grands moments » : une division', { reached: ['rank:voix:4'], standing: standing({ rank: 'voix', division: 4 }), policy: policy({ invitations: 'big-moments' }) }],
      ['« grands moments » : un passage de rang', { reached: ['rank:voix:5'], standing: standing({ rank: 'voix', division: 5 }), policy: policy({ invitations: 'big-moments' }) }],
      ['« jamais »', { reached: ['rank:voix:5'], standing: standing({ rank: 'voix', division: 5 }), policy: policy({ invitations: 'never' }) }],
      ['trésor au plus haut palier', { reached: ['treasury:coffret'], standing: standing({ treasuryTier: 'bourse' }), treasuryPeak: 'coffret', kept: ['treasury:bourse', 'treasury:escarcelle'] }],
      ['trésor au palier courant', { reached: ['treasury:coffret'], standing: standing({ treasuryTier: 'bourse' }) }],
      ['réalisation du jour', { reached: ['day:2026-10-11'], standing: NEW_ACCOUNT }],
      ['réalisation du jour déjà présentée', { reached: ['day:2026-10-11'], standing: NEW_ACCOUNT, presented: ['day:2026-10-11'] }],
      ['deux réalisations du jour : la plus récente', { reached: ['day:2026-10-10', 'day:2026-10-11'], standing: NEW_ACCOUNT }],
      ['une étape de piste avant la réalisation du jour', { reached: ['day:2026-10-11', 'meesh:1'], standing: standing({ minted: 1 }) }],
      ['deux divisions d’une transition : la plus haute', { reached: ['rank:murmure:3', 'rank:murmure:2'], standing: standing({ division: 2 }), kept: ['rank:murmure:4', 'rank:murmure:3'] }],
      ['un moment hors piste seul', { reached: ['trophy:trophy.flame.100', 'meesh:1'], standing: standing({ minted: 1 }), kept: ['meesh:1'] }],
      ['hors rythme : plafond du jour', { reached: ['meesh:1'], standing: standing({ minted: 1 }), pacing: pacing({ shown: [{ at: at(0), dayKey: '2026-10-11' }] }) }],
      ['dans le rythme', { reached: ['meesh:1'], standing: standing({ minted: 1 }), pacing: pacing() }],
    ] as const satisfies readonly (readonly [string, AlertCase])[]
  ).map(([label, c]) =>
    vector(`alerte — ${label}`, {
      law: 'photo-alert',
      kind: 'alert',
      reached: c.reached,
      standing: c.standing,
      kept: 'kept' in c ? c.kept : [],
      presented: 'presented' in c ? c.presented : [],
      baseline: 'baseline' in c ? c.baseline : NEW_ACCOUNT,
      policy: 'policy' in c ? c.policy : PHOTO_ALERT_POLICY,
      treasuryPeak: 'treasuryPeak' in c ? c.treasuryPeak : null,
      pacing: 'pacing' in c ? c.pacing : null,
    }),
  );

  const twoPerDay = policy({ inApp: { ...PHOTO_ALERT_POLICY.inApp, perDay: 2 } });
  const paces = (
    [
      ['plafond du jour atteint', pacing({ shown: [{ at: at(0), dayKey: '2026-10-11' }] }), PHOTO_ALERT_POLICY],
      ['la veille ne compte pas', pacing({ shown: [{ at: at(-1440), dayKey: '2026-10-10' }] }), PHOTO_ALERT_POLICY],
      ['écart de 3 h 59', pacing({ shown: [{ at: at(361), dayKey: '2026-10-11' }] }), twoPerDay],
      ['écart de 4 h', pacing({ shown: [{ at: at(360), dayKey: '2026-10-11' }] }), twoPerDay],
      ['délai de grâce, passive à 9 min', pacing({ now: at(9) }), PHOTO_ALERT_POLICY],
      ['délai de grâce, passive à 10 min', pacing({ now: at(10) }), PHOTO_ALERT_POLICY],
      ['délai de grâce, geste à 1 min', pacing({ now: at(1), surface: 'gesture' }), PHOTO_ALERT_POLICY],
      ['session inconnue', pacing({ now: at(1), sessionStartedAt: null }), PHOTO_ALERT_POLICY],
    ] as const
  ).map(([label, p, pol]) => vector(`rythme — ${label}`, { law: 'photo-alert', kind: 'pacing', pacing: p, policy: pol }));

  const stepsUnder = (
    [
      ['« rang seul », Oracle III', standing({ rank: 'oracle', division: 3, minted: 12 }), RANK_PASSAGE],
      ['« rang seul », le Mythe', standing({ rank: 'mythe', division: null }), RANK_PASSAGE],
      ['chaque étape, Voix IV', standing({ rank: 'voix', division: 4 }), PHOTO_ALERT_POLICY],
    ] as const
  ).map(([label, s, pol]) => vector(`étapes photographiées — ${label}`, { law: 'photo-alert', kind: 'steps', standing: s, policy: pol }));

  const digests = [
    [
      { stepId: 'rank:voix:5', presentedAt: null, notifiedAt: null },
      { stepId: 'meesh:10', presentedAt: '2026-10-11T08:00:00.000Z', notifiedAt: null },
      { stepId: 'tier:lueur', presentedAt: null, notifiedAt: '2026-10-11T08:00:00.000Z' },
      { stepId: 'flame:7', presentedAt: null, notifiedAt: null },
      { stepId: 'start', presentedAt: null, notifiedAt: null },
      { stepId: 'day:2026-10-11', presentedAt: null, notifiedAt: null },
      { stepId: 'flame:7', presentedAt: null, notifiedAt: null },
    ],
    [{ stepId: 'meesh:10', presentedAt: '2026-10-11T08:00:00.000Z', notifiedAt: null }],
    [],
  ].map((moments, i) => vector(`résumé du push, cas ${i + 1}`, { law: 'photo-alert', kind: 'digest', moments }));

  const big = vector('les grands moments', {
    law: 'photo-alert',
    kind: 'big',
    ids: ['rank:echo:5', 'rank:mythe:0', 'level-100:0', 'prestige:2', 'meesh:100', 'meesh:1000', 'flame:100', 'flame:365',
      'rank:echo:4', 'tier:lueur', 'meesh:10', 'meesh:1', 'meesh:0', 'flame:30', 'treasury:bourse', 'start', 'day:2026-10-11', 'prestige', 'rank:Echo:5'],
  });

  return [...alerts, ...paces, ...stepsUnder, ...digests, big, vector('la politique par défaut', { law: 'photo-alert', kind: 'policy' })];
}

function buildPhotoDayVectors() {
  return ['2026-10-11', '2026-02-29', '2026-13-01', '11/10/2026', ''].map((dayKey) =>
    ({ _label: `réalisation du jour « ${dayKey} »`, input: { law: 'photo-moment', dayKey } as GameVectorInputPhotoDay, expected: evaluatePhotoDayVector({ law: 'photo-moment', dayKey }) }),
  );
}
