import { describeFrameUsage, type FrameMomentFamily, type FrameUsage } from '@meeshy/shared/types/frame-usage';
import type { AchievementRarity, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';

import { frameUsageText } from '@/lib/i18n-frame-usage-catalog';
import { translateGame, type GameCatalogKey } from '@/lib/i18n-game-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE LIBELLÉ D'USAGE D'UN CADRE, TRADUIT (#10146) — la loi partagée choisit la
 * clé (`describeFrameUsage`), le jeu donne les noms du rang, de la rareté et de
 * la famille (les mots d'iOS, #10273). Extrait de la boutique des cadres pour
 * que la bande de cadres du déroulé photo (#10164) dise la même chose sans
 * charger la boutique. Les deux catalogues (usage, jeu) doivent être chargés.
 */
const RANK_KEYS = {
  murmure: 'game.rank.murmure',
  echo: 'game.rank.echo',
  voix: 'game.rank.voix',
  conteur: 'game.rank.conteur',
  passeur: 'game.rank.passeur',
  polyglotte: 'game.rank.polyglotte',
  ambassadeur: 'game.rank.ambassadeur',
  orateur: 'game.rank.orateur',
  oracle: 'game.rank.oracle',
  legende: 'game.rank.legende',
  mythe: 'game.rank.mythe',
} as const satisfies Readonly<Record<GloryRankOrMythic, GameCatalogKey>>;

const RARITY_KEYS = {
  common: 'game.rarity.common',
  rare: 'game.rarity.rare',
  epic: 'game.rarity.epic',
  legendary: 'game.rarity.legendary',
  mythic: 'game.rarity.mythic',
} as const satisfies Readonly<Record<AchievementRarity, GameCatalogKey>>;

const FAMILY_KEYS = {
  tier: 'game.frame.family.tier',
  meesh: 'game.frame.family.meesh',
  treasury: 'game.frame.family.treasury',
  flame: 'game.frame.family.flame',
  day: 'game.frame.family.day',
  'level-100': 'game.frame.family.level-100',
} as const satisfies Readonly<Record<FrameMomentFamily, GameCatalogKey>>;

const usageNames = (language: InterfaceLanguage, usage: FrameUsage): Readonly<Record<string, string>> => {
  if (usage.kind === 'rank') return { rank: translateGame(language, RANK_KEYS[usage.rank]) };
  if (usage.kind === 'achievement' && usage.rarity !== undefined) return { rarity: translateGame(language, RARITY_KEYS[usage.rarity]) };
  if (usage.kind === 'moment') return { family: translateGame(language, FAMILY_KEYS[usage.family]) };
  return {};
};

/** « Rang Ambassadeur IV uniquement », « Succès Légendaire uniquement », « Moment « Niveau 100 » uniquement » — la loi choisit la clé, le rang, la rareté et la famille reçoivent leur nom traduit (les mots d'iOS, #10273). */
export const usageText = (language: InterfaceLanguage, usage: FrameUsage): string => frameUsageText(language, describeFrameUsage(usage), usageNames(language, usage));
