import type { EngagementAxisFamily } from '@meeshy/shared/types/engagement';
import type { FlameFormKey } from '@meeshy/shared/utils/game/flame';
import type { GloryDivision, GloryRankOrMythic } from '@meeshy/shared/utils/game/glory';
import type { LevelTierKey } from '@meeshy/shared/utils/game/levels';
import type { MeeshEdition } from '@meeshy/shared/utils/game/mint';
import type { MissionDifficulty } from '@meeshy/shared/utils/game/missions';
import type { TreasuryTierKey } from '@meeshy/shared/utils/game/treasury';
import { GAME_ERROR_CODES } from '@meeshy/shared/types/game-routes';

import {
  formatGameNumber,
  translateGame,
  translateGamePlural,
  type GameCatalogKey,
  type GamePluralBase,
  type TranslateGameArgs,
} from '@/lib/i18n-game-catalog';
import type { GameMaterial } from '@/lib/game/materials';
import type { Medal } from '@/lib/game/medal';
import { tierOrdinal } from '@/lib/game/tier-emblem';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';

/**
 * CE QUE LE JEU DIT (#9383, #9379) — les noms, les accords et les phrases de
 * refus. La loi partagée (`@meeshy/shared/utils/game`) ne prononce rien : elle
 * rend des clés stables, ce fichier les habille depuis le catalogue du jeu
 * (`i18n-game-catalog.ts`, sept langues) — même séparation que
 * `progression.ts` pour les axes.
 *
 * LA LANGUE est celle de l'interface, lue à l'appel (`currentInterfaceLanguage`)
 * et jamais figée à l'import : changer de langue redessine l'écran dans la
 * nouvelle. Chaque fonction accepte la langue en dernier paramètre — c'est ce
 * qui permet de la tester dans les sept. L'accord passe par `Intl.PluralRules`
 * de la langue (`translateGamePlural`), jamais par un `=== 1`.
 */

type Language = InterfaceLanguage;

/** Une phrase du catalogue dans la langue COURANTE de l'interface — la forme que les écrans du jeu appellent. */
export function gameText<K extends GameCatalogKey>(key: K, ...params: TranslateGameArgs<K>): string;
export function gameText(key: GameCatalogKey, params?: Readonly<Record<string, string>>): string {
  return (translateGame as (language: Language, key: GameCatalogKey, params?: Readonly<Record<string, string>>) => string)(
    currentInterfaceLanguage(),
    key,
    params,
  );
}

export const formatCount = (count: number, language: Language = currentInterfaceLanguage()): string =>
  formatGameNumber(language, count);

/** Un pourcentage servi se borne ICI, à l'affichage : la frontière (`lib/api/game.ts`) ne refuse que la forme. */
export const boundedPercent = (value: number): number => Math.min(100, Math.max(0, value));

export const pointsLabel = (count: number, language: Language = currentInterfaceLanguage()): string =>
  translateGamePlural(language, 'game.points', count);

export const convertiblePointsLabel = (count: number, language: Language = currentInterfaceLanguage()): string =>
  translateGamePlural(language, 'game.points.convertible', count);

export const meeshCount = (count: number, language: Language = currentInterfaceLanguage()): string =>
  count === 0 ? translateGame(language, 'game.meeshes.none') : translateGamePlural(language, 'game.meeshes', count);

export const daysLabel = (count: number, language: Language = currentInterfaceLanguage()): string =>
  translateGamePlural(language, 'game.days', count);

export const actionsLabel = (count: number, language: Language = currentInterfaceLanguage()): string =>
  translateGamePlural(language, 'game.actions', count);

export const levelsLabel = (count: number, language: Language = currentInterfaceLanguage()): string =>
  translateGamePlural(language, 'game.levels', count);

export const levelTierName = (tier: LevelTierKey, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.tier.${tier}`);

const TIER_ORDINALS = [
  'game.tier.ordinal.1',
  'game.tier.ordinal.2',
  'game.tier.ordinal.3',
  'game.tier.ordinal.4',
  'game.tier.ordinal.5',
  'game.tier.ordinal.6',
  'game.tier.ordinal.7',
  'game.tier.ordinal.8',
  'game.tier.ordinal.9',
  'game.tier.ordinal.10',
] as const;

/** Ce que lit un lecteur d'écran sur l'anneau de niveau : « Niveau 34, palier Éclat, quatrième palier » (#9481). */
export const levelRingLabel = (level: number, tier: LevelTierKey, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, 'game.level.ring_label', {
    level: formatGameNumber(language, level),
    tier: levelTierName(tier, language),
    ordinal: translateGame(language, TIER_ORDINALS[tierOrdinal(tier) - 1] ?? TIER_ORDINALS[0]),
  });

export const familyName = (family: EngagementAxisFamily, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.family.${family}`);

export const materialName = (material: GameMaterial, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.material.${material}`);

/** Ce que la médaille d'un axe donne à lire : « Messages texte, Or, 100 sur 500 vers Platine » (#9466). */
export function medalLabel(
  medal: Pick<Medal, 'tier' | 'material' | 'nextMaterial' | 'value' | 'nextThreshold' | 'missing'>,
  axisName: string,
  language: Language = currentInterfaceLanguage(),
): string {
  const { material, nextMaterial, value, nextThreshold, missing } = medal;
  if (material === null) {
    return translateGame(language, 'game.medal.label_off', { axis: axisName, missing: formatGameNumber(language, missing ?? 0) });
  }
  const base = { axis: axisName, material: materialName(material, language), value: formatGameNumber(language, value) };
  if (nextThreshold === null || nextMaterial === null) return translateGame(language, 'game.medal.label_top', base);
  return translateGame(language, 'game.medal.label', {
    ...base,
    next: formatGameNumber(language, nextThreshold),
    nextMaterial: materialName(nextMaterial, language),
  });
}

export const rankName = (rank: GloryRankOrMythic, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.rank.${rank}`);

export const treasuryName = (tier: TreasuryTierKey, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.treasury.${tier}`);

export const flameFormName = (form: FlameFormKey, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.flame.form.${form}`);

export const difficultyName = (difficulty: MissionDifficulty, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.difficulty.${difficulty}`);

export const editionName = (edition: MeeshEdition, language: Language = currentInterfaceLanguage()): string =>
  translateGame(language, `game.edition.${edition}`);

const DIVISIONS: Readonly<Record<GloryDivision, string>> = { 3: 'III', 2: 'II', 1: 'I' };

export const divisionLabel = (division: GloryDivision): string => DIVISIONS[division];

export const rankLabel = (rank: GloryRankOrMythic, division: GloryDivision | null, language: Language = currentInterfaceLanguage()): string =>
  division === null ? rankName(rank, language) : `${rankName(rank, language)} ${divisionLabel(division)}`;

/** Un gabarit de mission : une phrase qui s'accorde au nombre, ou une phrase unique qui le porte. */
type SingleMissionKey =
  | 'game.mission.reply_conversations'
  | 'game.mission.prism_foreign_exchange'
  | 'game.mission.long_chat'
  | 'game.mission.gold_replies_received';
type MissionPhrase = { readonly plural: GamePluralBase } | { readonly single: SingleMissionKey };

const plural = (base: GamePluralBase): MissionPhrase => ({ plural: base });
const single = (key: SingleMissionKey): MissionPhrase => ({ single: key });

const MISSION_PHRASES: Readonly<Record<string, MissionPhrase>> = {
  'react-messages': plural('game.mission.react_messages'),
  'send-voice': plural('game.mission.send_voice'),
  'send-texts': plural('game.mission.send_texts'),
  'use-stickers': plural('game.mission.use_stickers'),
  'send-attachments': plural('game.mission.send_attachments'),
  'reply-conversations': single('game.mission.reply_conversations'),
  'reply-conversations-wide': single('game.mission.reply_conversations'),
  'comment-text': plural('game.mission.comment_text'),
  'publish-story': plural('game.mission.publish_story'),
  'publish-post': plural('game.mission.publish_post'),
  'publish-posts': plural('game.mission.publish_post'),
  'share-link': plural('game.mission.share_link'),
  'prism-foreign-messages': plural('game.mission.prism_foreign_messages'),
  'prism-foreign-exchange': single('game.mission.prism_foreign_exchange'),
  'voice-comments': plural('game.mission.voice_comments'),
  'publish-reel': plural('game.mission.publish_reel'),
  'long-chat': single('game.mission.long_chat'),
  'gold-replies-received': single('game.mission.gold_replies_received'),
  'gold-reply-conversations': single('game.mission.reply_conversations'),
};

/** La mission en clair ; un gabarit que ce client ne connaît pas encore reste « Mission du jour ». */
export function missionTitle(templateKey: string, target: number, language: Language = currentInterfaceLanguage()): string {
  const phrase = MISSION_PHRASES[templateKey];
  if (phrase === undefined) return translateGame(language, 'game.mission.generic');
  if ('plural' in phrase) return translateGamePlural(language, phrase.plural, target);
  return translateGame(language, phrase.single, { count: formatGameNumber(language, target) });
}

type ErrorKey =
  | 'game.error.insufficient_points'
  | 'game.error.insufficient_meeshes'
  | 'game.error.freeze_at_maximum'
  | 'game.error.relight_not_allowed'
  | 'game.error.mission_not_found'
  | 'game.error.mission_reroll_exhausted'
  | 'game.error.mission_reroll_unavailable'
  | 'game.error.missions_locked'
  | 'game.error.chest_not_ready'
  | 'game.error.request_id_conflict';

const ERRORS: Readonly<Record<string, ErrorKey>> = {
  [GAME_ERROR_CODES.insufficientPoints]: 'game.error.insufficient_points',
  [GAME_ERROR_CODES.insufficientMeeshes]: 'game.error.insufficient_meeshes',
  [GAME_ERROR_CODES.freezeAtMaximum]: 'game.error.freeze_at_maximum',
  [GAME_ERROR_CODES.relightNotAllowed]: 'game.error.relight_not_allowed',
  [GAME_ERROR_CODES.missionNotFound]: 'game.error.mission_not_found',
  [GAME_ERROR_CODES.missionRerollExhausted]: 'game.error.mission_reroll_exhausted',
  [GAME_ERROR_CODES.missionRerollUnavailable]: 'game.error.mission_reroll_unavailable',
  [GAME_ERROR_CODES.missionsLocked]: 'game.error.missions_locked',
  [GAME_ERROR_CODES.chestNotReady]: 'game.error.chest_not_ready',
  [GAME_ERROR_CODES.requestIdConflict]: 'game.error.request_id_conflict',
};

export function gameErrorMessage(code: string | undefined, language: Language = currentInterfaceLanguage()): string {
  const key = code === undefined ? undefined : ERRORS[code];
  return translateGame(language, key ?? 'game.error.generic');
}
