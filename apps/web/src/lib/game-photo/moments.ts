import type { GameBlock } from '@meeshy/shared/types/game';
import type { EngagementAchievementKey } from '@meeshy/shared/types/engagement';
import { engagementAchievementTitle } from '@meeshy/shared/utils/engagement-labels';
import { flameForm, type FlameFormKey } from '@meeshy/shared/utils/game/flame';
import type { AchievementRarity, GloryDivision5, GloryRankOrMythic, MythicSeatRef } from '@meeshy/shared/utils/game/glory';
import type { GuideMomentKey } from '@meeshy/shared/utils/game/guide';
import { photoMomentId, photoMomentOfGuideEvent, type PhotoMomentEmblemV2 } from '@meeshy/shared/utils/game/photo-moments';
import type { LeagueKey } from '@meeshy/shared/utils/game/league';
import { LEVEL_TIER_KEYS, levelTierStart, type LevelTierKey } from '@meeshy/shared/utils/game/levels';
import { levelReading } from '@/lib/game/ladder';
import { meeshEdition, type MeeshEdition } from '@meeshy/shared/utils/game/mint';
import { TREASURY_TIERS, type TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';

import type { EngagementWithGame } from '@/lib/api/engagement';
import { transitionGuideEventsV2 } from '@/lib/game-guide/events-v2';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { editionName, formatCount, levelTierName, standingLabel, treasuryName, shownRank } from '@/lib/view/game-copy';
import { leagueName, rarityName, trophyView } from '@/lib/view/game-copy-v2';
import { translateGame } from '@/lib/i18n-game-catalog';

/**
 * LES MOMENTS QUI SE PHOTOGRAPHIENT (#9382) — conception, partie VI : « les
 * grands moments se photographient ». Photo de départ, nouveau rang ou
 * division, nouveau palier de niveau et Prestige, première Meesh, chaque 10e
 * et chaque édition or ou prisme, palier du trésor, Flamme à 7, 30, 100 et 365
 * jours.
 *
 * Un moment est une DONNÉE : une identité stable (`id`), l'emblème que le
 * cadre grave (`emblem`), et deux lignes (`kicker`, `title`). L'identité fait
 * qu'un « plus tard » puis un retour ne propose jamais deux fois la même photo,
 * et qu'une division nouvelle est un moment nouveau.
 *
 * Trois sources, qui se recoupent par les MÊMES constructeurs :
 *  - `photoMomentFromCard` : la carte du guide propose « Immortaliser » pour le
 *    moment qu'elle vient de dire ;
 *  - `photoMomentsOfTransition` : ce qui arrive pendant que l'écran est ouvert ;
 *  - `startMoment` : la photo de départ, à la fin de l'intégration.
 */

export type PhotoEmblem =
  | { readonly kind: 'start' }
  | { readonly kind: 'rank'; readonly rank: GloryRankOrMythic; readonly division: GloryDivision5 | null; readonly mythic: MythicSeatRef | null }
  | { readonly kind: 'tier'; readonly tier: LevelTierKey; readonly level: number }
  | { readonly kind: 'level-hundred'; readonly prestige: number }
  | { readonly kind: 'meesh'; readonly number: number; readonly edition: MeeshEdition }
  | { readonly kind: 'treasury'; readonly tier: TreasuryTierKey }
  | { readonly kind: 'flame'; readonly form: FlameFormKey; readonly days: number }
  /* `rarity` : la rareté MESURÉE, présente seulement quand on a le droit de la montrer (`visibleRarity`). */
  | { readonly kind: 'achievement'; readonly key: EngagementAchievementKey; readonly rarity?: AchievementRarity }
  /* LA VAGUE 2 (#9481) — les quatre moments que la loi range parmi les photos (`photo-moments.ts`). */
  | { readonly kind: 'trophy'; readonly trophyKey: string }
  | { readonly kind: 'league-up'; readonly league: LeagueKey; readonly weekKey: string }
  | { readonly kind: 'season'; readonly season: number }
  | { readonly kind: 'prestige'; readonly number: number };

export type PhotoMoment = {
  readonly id: string;
  readonly emblem: PhotoEmblem;
  /** La ligne du dessus : « Nouveau rang ». Dans la langue de l'interface à la construction ; `momentLines` la redonne dans une autre. */
  readonly kicker: string;
  /** La ligne forte : « Voix II ». */
  readonly title: string;
};

/**
 * Les deux lignes d'un moment, dans la langue de l'interface : elles se DÉDUISENT
 * de l'emblème, jamais d'un texte gardé. Une entrée du carnet écrite hier en
 * français se relit donc dans la langue d'aujourd'hui (`progression-carnet.tsx`),
 * et la carte qu'on photographie dit ce que l'écran dit.
 */
export function momentLines(
  emblem: PhotoEmblem,
  language: InterfaceLanguage = currentInterfaceLanguage(),
): { readonly kicker: string; readonly title: string } {
  switch (emblem.kind) {
    case 'start':
      return { kicker: translateGame(language, 'game.photo.kicker.start'), title: translateGame(language, 'game.photo.title.start') };
    case 'rank':
      return { kicker: translateGame(language, 'game.photo.kicker.rank'), title: standingLabel(emblem, language) };
    case 'tier':
      return {
        kicker: translateGame(language, 'game.photo.kicker.tier', { level: formatCount(emblem.level, language) }),
        title: translateGame(language, 'game.photo.title.tier', { tier: levelTierName(emblem.tier, language) }),
      };
    case 'level-hundred':
      return emblem.prestige === 0
        ? { kicker: translateGame(language, 'game.photo.kicker.summit'), title: translateGame(language, 'game.photo.title.level_100') }
        : {
            kicker: translateGame(language, 'game.photo.kicker.new_lap'),
            title: translateGame(language, 'game.photo.title.prestige', { count: formatCount(emblem.prestige, language) }),
          };
    case 'meesh': {
      const number = formatCount(emblem.number, language);
      const title =
        emblem.number === 1
          ? translateGame(language, 'game.photo.title.meesh_first')
          : emblem.edition === 'silver'
            ? translateGame(language, 'game.photo.title.meesh_number', { number })
            : translateGame(language, 'game.photo.title.meesh_number_edition', { number, edition: editionName(emblem.edition, language) });
      return { kicker: translateGame(language, 'game.photo.kicker.meesh'), title };
    }
    case 'treasury':
      return { kicker: translateGame(language, 'game.photo.kicker.treasury'), title: treasuryName(emblem.tier, language) };
    case 'flame':
      return {
        kicker: translateGame(language, 'game.photo.kicker.flame'),
        title: translateGame(language, 'game.photo.title.flame_days', { count: formatCount(emblem.days, language) }),
      };
    case 'achievement':
      return {
        kicker:
          emblem.rarity === undefined
            ? translateGame(language, 'game.photo.kicker.achievement')
            : translateGame(language, 'game.photo.kicker.achievement_rarity', { rarity: rarityName(emblem.rarity, language) }),
        title: engagementAchievementTitle(language, emblem.key),
      };
    case 'trophy': {
      const kicker = translateGame(language, 'game.photo.kicker.trophy');
      return { kicker, title: trophyView(emblem.trophyKey, language)?.title ?? kicker };
    }
    case 'league-up':
      return { kicker: translateGame(language, 'game.photo.kicker.league_up'), title: translateGame(language, 'game.photo.title.league_up', { league: leagueName(emblem.league, language) }) };
    case 'season':
      return { kicker: translateGame(language, 'game.photo.kicker.season'), title: translateGame(language, 'game.door.season', { number: formatCount(emblem.season, language) }) };
    case 'prestige':
      return { kicker: translateGame(language, 'game.photo.kicker.prestige'), title: translateGame(language, 'game.photo.title.prestige', { count: formatCount(emblem.number, language) }) };
  }
}

const moment = (id: string, emblem: PhotoEmblem): PhotoMoment => ({ id, emblem, ...momentLines(emblem) });

export const startMoment = (): PhotoMoment => moment('start', { kind: 'start' });

export const rankMoment = (params: { readonly rank: GloryRankOrMythic; readonly division: GloryDivision5 | null; readonly mythic?: MythicSeatRef | null }): PhotoMoment =>
  moment(`rank:${params.rank}:${params.division ?? 0}`, { kind: 'rank', rank: params.rank, division: params.division, mythic: params.mythic ?? null });

export const tierMoment = (params: { readonly tier: LevelTierKey; readonly level: number }): PhotoMoment =>
  moment(`tier:${params.tier}`, { kind: 'tier', tier: params.tier, level: params.level });

export const levelHundredMoment = (prestige: number): PhotoMoment =>
  moment(`level-100:${prestige}`, { kind: 'level-hundred', prestige });

export const meeshMoment = (params: { readonly number: number; readonly edition: MeeshEdition }): PhotoMoment =>
  moment(`meesh:${params.number}`, { kind: 'meesh', number: params.number, edition: params.edition });

/**
 * Un succès qui vient de se révéler (#7742) : la même carte se propose, avec le bandeau de parrainage.
 * `rarity` n'est posée que si l'écran a le DROIT de la montrer : l'identité du moment n'en dépend pas.
 */
export const achievementMoment = (key: EngagementAchievementKey, rarity?: AchievementRarity | null): PhotoMoment =>
  moment(`achievement:${key}`, { kind: 'achievement', key, ...(rarity == null ? {} : { rarity }) });

/** Le moment photo que la loi de la vague 2 nomme (`photoMomentOfGuideEvent`) : son identité est celle de la loi. */
export const photoMomentOfEmblemV2 = (emblem: PhotoMomentEmblemV2): PhotoMoment => {
  const id = photoMomentId(emblem);
  switch (emblem.kind) {
    case 'trophy':
      return moment(id, { kind: 'trophy', trophyKey: emblem.trophyKey });
    case 'league-up':
      return moment(id, { kind: 'league-up', league: emblem.league, weekKey: emblem.weekKey });
    case 'season':
      return moment(id, { kind: 'season', season: emblem.season });
    case 'prestige':
      return moment(id, { kind: 'prestige', number: emblem.number });
  }
};

export const treasuryMoment = (tier: TreasuryTierKey): PhotoMoment => moment(`treasury:${tier}`, { kind: 'treasury', tier });

const FLAME_THRESHOLDS = [7, 30, 100, 365] as const;

const flameThreshold = (days: number): number | null =>
  [...FLAME_THRESHOLDS].reverse().find((threshold) => days >= threshold) ?? null;

export const flameMoment = (days: number): PhotoMoment => {
  const threshold = flameThreshold(days) ?? days;
  return moment(`flame:${threshold}`, { kind: 'flame', form: flameForm(threshold) ?? 'braise', days: threshold });
};

const tierLevel = (tier: LevelTierKey): number => levelTierStart(tier);

/** Le moment que propose une carte du guide, dans l'état courant du jeu ; `null` si elle ne se photographie pas. */
export function photoMomentFromCard(key: GuideMomentKey, game: GameBlock): PhotoMoment | null {
  switch (key) {
    case 'new-rank':
      return rankMoment(shownRank(game.glory));
    case 'new-tier':
      return tierMoment({ tier: levelReading(game.level).tier, level: tierLevel(levelReading(game.level).tier) });
    case 'first-mint': {
      /* `mint.number` est la PROCHAINE pièce : celle qui vient d'être frappée porte le numéro d'avant. */
      const number = Math.max(1, game.mint.number - 1);
      return meeshMoment({ number, edition: meeshEdition(number) });
    }
    case 'treasury-tier':
      return game.treasury.tier === null ? null : treasuryMoment(game.treasury.tier);
    case 'level-100':
      return levelHundredMoment(game.level.prestige);
    default:
      return null;
  }
}

const treasuryIndex = (game: GameBlock): number => TREASURY_TIERS.findIndex((tier) => tier.key === game.treasury.tier);

/** Les moments que la transition vient de produire : ce que Mee propose APRÈS la célébration. */
export function photoMomentsOfTransition(previous: EngagementWithGame, next: EngagementWithGame): PhotoMoment[] {
  const before = previous.game;
  const after = next.game;
  if (before === undefined || after === undefined) return [];

  const minted = before.mint.number;
  const crossedFlame = FLAME_THRESHOLDS.some((threshold) => before.flame.days < threshold && after.flame.days >= threshold);
  const shownBefore = shownRank(before.glory);
  const shownAfter = shownRank(after.glory);
  const rankUp =
    shownAfter.rank !== shownBefore.rank ||
    (shownAfter.division !== null && shownBefore.division !== null && shownAfter.division < shownBefore.division);

  /* La vague 2 : trophée, montée de ligue, saison terminée, Prestige. Le Prestige a sa propre carte (le
     trophée numéroté) : la carte « niveau 100 » de la vague 1 ne la double pas. */
  const emblemsV2 = transitionGuideEventsV2(previous, next).flatMap((event) => {
    const emblem = photoMomentOfGuideEvent(event);
    return emblem === null ? [] : [emblem];
  });
  const prestigeCard = emblemsV2.some((emblem) => emblem.kind === 'prestige');

  const moments: (PhotoMoment | null)[] = [
    rankUp && after.glory.glory > before.glory.glory ? rankMoment(shownAfter) : null,
    LEVEL_TIER_KEYS.indexOf(levelReading(after.level).tier) > LEVEL_TIER_KEYS.indexOf(levelReading(before.level).tier)
      ? tierMoment({ tier: levelReading(after.level).tier, level: tierLevel(levelReading(after.level).tier) })
      : null,
    after.level.prestige > before.level.prestige && !prestigeCard ? levelHundredMoment(after.level.prestige) : null,
    after.mint.number > before.mint.number && (minted === 1 || minted % 10 === 0)
      ? meeshMoment({ number: minted, edition: meeshEdition(minted) })
      : null,
    treasuryIndex(after) > treasuryIndex(before) && after.treasury.tier !== null ? treasuryMoment(after.treasury.tier) : null,
    crossedFlame ? flameMoment(after.flame.days) : null,
    ...emblemsV2.map(photoMomentOfEmblemV2),
  ];
  return moments.filter((moment): moment is PhotoMoment => moment !== null);
}
