/**
 * LE RATTRAPAGE DU CARNET (#9961, #9962) — chaque étape déjà franchie se photographie, DANS L'ORDRE.
 *
 * Les étapes se DÉDUISENT de l'état du jeu, jamais d'un journal : un moment arrivé écran fermé, ou avant
 * que le carnet n'existe, reste photographiable sans que rien n'ait été gardé. Sept pistes ordonnées —
 * départ, rang (division par division), palier de niveau, sommet et Prestige, Meesh (la première puis
 * chaque dixième), trésor, Flamme. Dans une piste, seule la PREMIÈRE étape sans photo est ouverte : la
 * Meesh 50 attend la Meesh 40. Les pistes ne s'attendent pas entre elles.
 *
 * Les identités sont celles des moments (`apps/web/src/lib/game-photo/moments.ts`, `GamePhotoMoments.swift`) :
 * une photo gardée par la proposition en direct compte pour le rattrapage, et inversement.
 *
 * `photoOfferFor` règle le RYTHME : une transition ne propose qu'UN moment, le plus marquant, et jamais une
 * étape qui en saute une autre — c'est l'étape ouverte de sa piste qui est proposée à sa place.
 *
 * `catchUpStandingOf` lit la situation dans le bloc `game` servi : UNE dérivation, que le web, iOS et le job
 * serveur partagent — deux dérivations jumelles annonceraient des étapes que le carnet ne montre pas.
 *
 * Miroir Swift : `packages/MeeshySDK/Sources/MeeshySDK/Game/GamePhotoCatchUpLaw.swift`, rejoué sur les lois
 * `photo-catch-up`, `photo-offer` et `photo-standing` de `game.vectors.json` (#10155).
 */

import type { GameBlock } from '../../types/game.js';
import { flameForm, type FlameFormKey } from './flame.js';
import { GLORY_RANKS, type GloryDivision5, type GloryRankOrMythic } from './glory.js';
import { GAME_PRESTIGE_LEVEL, LEVEL_TIER_KEYS, levelTierIndex, levelTierStart, type LevelTierKey } from './levels.js';
import { meeshEdition, type MeeshEdition } from './mint.js';
import { TREASURY_TIERS, type TreasuryTierKey } from './treasury.js';
import { PHOTO_ALERT_POLICY, type PhotoAlertPolicy } from './photo-alert-policy.js';

export const PHOTO_TRACKS = ['start', 'rank', 'tier', 'summit', 'meesh', 'treasury', 'flame'] as const;
export type PhotoTrack = (typeof PHOTO_TRACKS)[number];

/** L'ordre de préséance d'une proposition : un rang passe avant un palier, une Meesh en dernier. */
export const PHOTO_OFFER_PRIORITY: readonly PhotoTrack[] = ['start', 'rank', 'tier', 'summit', 'treasury', 'flame', 'meesh'];

export const PHOTO_FLAME_THRESHOLDS = [7, 30, 100, 365] as const;

export type PhotoCatchUpStanding = {
  readonly rank: GloryRankOrMythic;
  /** V (5) à I (1) ; `null` pour le Mythe. */
  readonly division: GloryDivision5 | null;
  /** Le plus haut niveau atteint (`ladder.record`). */
  readonly levelRecord: number;
  readonly prestige: number;
  /** Les Meeshes déjà frappées (`mint.number - 1`). */
  readonly minted: number;
  readonly treasuryTier: TreasuryTierKey | null;
  /** La plus longue Flamme (`ladder.steps.flameRecord`, à défaut les jours en cours). */
  readonly flameRecord: number;
  /**
   * Le record de chaque cycle clos par un Prestige (`ladder.pastCycleRecords`, #10911) — absent devant un serveur
   * antérieur. Il dit combien de fois un palier a été atteint (`levelReachCount`).
   */
  readonly pastCycleRecords?: readonly number[];
};

/** Les cinq blocs du bloc `game` que la situation lit — le job serveur les sert sans le reste. */
export type PhotoStandingSource = Pick<GameBlock, 'glory' | 'level' | 'mint' | 'treasury' | 'flame'>;

/**
 * La situation lue dans le bloc `game` servi : la division V..I (ou héritée devant un ancien serveur), le record
 * de l'échelle ouverte par le rang (ou celui d'hier), les Meeshes déjà frappées (`mint.number` est la PROCHAINE),
 * la plus longue Flamme (le record gravé, ou la série en cours si elle le dépasse).
 */
export function catchUpStandingOf(game: PhotoStandingSource): PhotoCatchUpStanding {
  const ladder = game.level.ladder;
  return {
    rank: game.glory.rank,
    division: game.glory.division5 ?? game.glory.division,
    levelRecord: ladder?.record ?? game.level.record,
    prestige: game.level.prestige,
    minted: Math.max(0, game.mint.number - 1),
    treasuryTier: game.treasury.tier,
    flameRecord: Math.max(ladder?.steps?.flameRecord ?? 0, game.flame.days),
    ...(ladder?.pastCycleRecords === undefined ? {} : { pastCycleRecords: ladder.pastCycleRecords }),
  };
}

export type PhotoStepEmblem =
  | { readonly kind: 'start' }
  | { readonly kind: 'rank'; readonly rank: GloryRankOrMythic; readonly division: GloryDivision5 | null }
  /** `prestige` : le cycle où le palier est atteint ; `times` : combien de cycles l'ont atteint, celui-ci compris (#10911). */
  | { readonly kind: 'tier'; readonly tier: LevelTierKey; readonly level: number; readonly prestige: number; readonly times: number }
  | { readonly kind: 'level-hundred'; readonly prestige: 0 }
  | { readonly kind: 'prestige'; readonly number: number }
  | { readonly kind: 'meesh'; readonly number: number; readonly edition: MeeshEdition }
  | { readonly kind: 'treasury'; readonly tier: TreasuryTierKey }
  | { readonly kind: 'flame'; readonly form: FlameFormKey; readonly days: number };

export type PhotoStep = { readonly track: PhotoTrack; readonly id: string; readonly emblem: PhotoStepEmblem };

export type PhotoCatchUpEntry = PhotoStep & {
  readonly state: 'open' | 'locked';
  /** L'étape à photographier d'abord, `null` pour l'étape ouverte. */
  readonly blockedBy: string | null;
};

const count = (value: number): number => (Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0);

const DIVISIONS: readonly GloryDivision5[] = [5, 4, 3, 2, 1];

const rankSteps = (standing: PhotoCatchUpStanding): PhotoStep[] => {
  const ladder: PhotoStep[] = [
    ...GLORY_RANKS.flatMap((rank) =>
      DIVISIONS.map(
        (division): PhotoStep => ({
          track: 'rank',
          id: `rank:${rank.key}:${division}`,
          emblem: { kind: 'rank', rank: rank.key, division },
        }),
      ),
    ),
    { track: 'rank', id: 'rank:mythe:0', emblem: { kind: 'rank', rank: 'mythe', division: null } },
  ];
  const current = `rank:${standing.rank}:${standing.division ?? 0}`;
  const reached = ladder.findIndex((step) => step.id === current);
  return reached < 0 ? [] : ladder.slice(1, reached + 1);
};

/**
 * L'identité d'une étape de PALIER (#10911) : celle d'hier au premier cycle (`tier:<palier>`), une par cycle ensuite
 * (`tier:<palier>:<Prestige>`) — un palier atteint de nouveau après un Prestige redevient un moment de photo. Les
 * autres pistes gardent une identité unique : un rang, une Meesh, un palier du trésor ou une Flamme ne se refont pas.
 */
export const photoTierStepId = (tier: LevelTierKey, prestige: number): string =>
  count(prestige) === 0 ? `tier:${tier}` : `tier:${tier}:${count(prestige)}`;

/**
 * Combien de cycles ont atteint ce niveau, le cycle en cours compris (#10911) : les records des cycles clos
 * (`pastCycleRecords`), et pour un cycle clos dont le record n'a pas été gardé, le niveau du Prestige (100) que le
 * passage exigeait — jamais plus, rien ne s'invente.
 */
export function levelReachCount(standing: PhotoCatchUpStanding, level: number): number {
  const prestige = count(standing.prestige);
  const kept = (standing.pastCycleRecords ?? []).slice(0, prestige).map(count);
  const closed = [...kept, ...Array.from({ length: prestige - kept.length }, () => GAME_PRESTIGE_LEVEL)];
  return closed.filter((record) => record >= level).length + (count(standing.levelRecord) >= level ? 1 : 0);
}

const tierSteps = (standing: PhotoCatchUpStanding): PhotoStep[] =>
  LEVEL_TIER_KEYS.slice(1, levelTierIndex(count(standing.levelRecord)) + 1).map((tier) => ({
    track: 'tier',
    id: photoTierStepId(tier, standing.prestige),
    emblem: {
      kind: 'tier',
      tier,
      level: levelTierStart(tier),
      prestige: count(standing.prestige),
      times: levelReachCount(standing, levelTierStart(tier)),
    },
  }));

const summitSteps = (standing: PhotoCatchUpStanding): PhotoStep[] => {
  const prestige = count(standing.prestige);
  if (count(standing.levelRecord) < 100 && prestige === 0) return [];
  return [
    { track: 'summit', id: 'level-100:0', emblem: { kind: 'level-hundred', prestige: 0 } },
    ...Array.from({ length: prestige }, (_, index): PhotoStep => ({
      track: 'summit',
      id: `prestige:${index + 1}`,
      emblem: { kind: 'prestige', number: index + 1 },
    })),
  ];
};

const meeshSteps = (standing: PhotoCatchUpStanding): PhotoStep[] => {
  const minted = count(standing.minted);
  if (minted === 0) return [];
  const numbers = [1, ...Array.from({ length: Math.floor(minted / 10) }, (_, index) => (index + 1) * 10)];
  return numbers.map((number) => ({
    track: 'meesh',
    id: `meesh:${number}`,
    emblem: { kind: 'meesh', number, edition: meeshEdition(number) },
  }));
};

const treasurySteps = (standing: PhotoCatchUpStanding): PhotoStep[] => {
  const held = TREASURY_TIERS.findIndex((tier) => tier.key === standing.treasuryTier);
  return TREASURY_TIERS.slice(0, held + 1).map((tier) => ({
    track: 'treasury',
    id: `treasury:${tier.key}`,
    emblem: { kind: 'treasury', tier: tier.key },
  }));
};

const flameSteps = (standing: PhotoCatchUpStanding): PhotoStep[] =>
  PHOTO_FLAME_THRESHOLDS.filter((days) => count(standing.flameRecord) >= days).map((days) => ({
    track: 'flame',
    id: `flame:${days}`,
    emblem: { kind: 'flame', form: flameForm(days) ?? 'braise', days },
  }));

/** Ce que la politique photographie (`PHOTO_ALERT_POLICY.photographs`) : une étape non photographiable ne verrouille pas sa piste. */
type PhotoStepsPolicy = Pick<PhotoAlertPolicy, 'photographs'>;

const isPhotographed = (step: PhotoStep, policy: PhotoStepsPolicy): boolean =>
  policy.photographs === 'every-step' || step.emblem.kind !== 'rank' || step.emblem.division === 5 || step.emblem.division === null;

/** Toutes les étapes franchies que la politique photographie, piste après piste, chacune dans son ordre. */
export function photoStepsReached(standing: PhotoCatchUpStanding, policy: PhotoStepsPolicy = PHOTO_ALERT_POLICY): PhotoStep[] {
  const steps: PhotoStep[] = [
    { track: 'start', id: 'start', emblem: { kind: 'start' } },
    ...rankSteps(standing),
    ...tierSteps(standing),
    ...summitSteps(standing),
    ...meeshSteps(standing),
    ...treasurySteps(standing),
    ...flameSteps(standing),
  ];
  return steps.filter((step) => isPhotographed(step, policy));
}

/** Les étapes franchies sans photo gardée : la première de chaque piste est ouverte, les suivantes l'attendent. */
export function photoCatchUp(standing: PhotoCatchUpStanding, keptIds: Iterable<string>, policy: PhotoStepsPolicy = PHOTO_ALERT_POLICY): PhotoCatchUpEntry[] {
  const kept = new Set(keptIds);
  const missing = photoStepsReached(standing, policy).filter((step) => !kept.has(step.id));
  return missing.map((step) => {
    const first = missing.find((other) => other.track === step.track);
    return first === undefined || first.id === step.id
      ? { ...step, state: 'open', blockedBy: null }
      : { ...step, state: 'locked', blockedBy: first.id };
  });
}

/** La piste d'une identité de moment ; `null` hors des sept pistes (succès, trophée, ligue, saison). */
export function photoTrackOf(momentId: string): PhotoTrack | null {
  const prefix = momentId.split(':')[0];
  switch (prefix) {
    case 'start':
    case 'rank':
    case 'tier':
    case 'meesh':
    case 'treasury':
    case 'flame':
      return prefix;
    case 'level-100':
    case 'prestige':
      return 'summit';
    default:
      return null;
  }
}

/** Le rang de préséance d'une identité : sa piste dans `PHOTO_OFFER_PRIORITY`, une identité hors piste en dernier. */
export const photoOfferPriority = (momentId: string): number => {
  const track = photoTrackOf(momentId);
  return track === null ? PHOTO_OFFER_PRIORITY.length : PHOTO_OFFER_PRIORITY.indexOf(track);
};

/**
 * LA proposition d'une transition : chaque moment d'une piste est remplacé par l'étape OUVERTE de sa piste
 * (aucune si la piste est à jour), puis le plus marquant l'emporte. `null` : rien à proposer.
 */
export function photoOfferFor(
  momentIds: readonly string[],
  standing: PhotoCatchUpStanding,
  keptIds: Iterable<string>,
  policy: PhotoStepsPolicy = PHOTO_ALERT_POLICY,
): string | null {
  const open = photoCatchUp(standing, keptIds, policy).filter((entry) => entry.state === 'open');
  const candidates = momentIds.flatMap((id) => {
    const track = photoTrackOf(id);
    if (track === null) return [id];
    const step = open.find((entry) => entry.track === track);
    return step === undefined ? [] : [step.id];
  });
  return [...new Set(candidates)].sort((a, b) => photoOfferPriority(a) - photoOfferPriority(b))[0] ?? null;
}
