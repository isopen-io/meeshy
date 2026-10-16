import type { EngagementAchievementKey, EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { ENGAGEMENT_ACHIEVEMENT_LABELS, ENGAGEMENT_AXIS_LABELS } from '@meeshy/shared/utils/engagement-labels';
import type { EngagementScaleProgress } from '@meeshy/shared/utils/engagement-progress';
import { achievementLabel } from '@meeshy/shared/utils/achievement-labels';
import type { AchievementFamily, AchievementSection } from '@meeshy/shared/types/achievement-catalog';
import { formatGameNumber, translateGame } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { awardedDate } from '@/lib/view/game-copy-v2';

/**
 * CE QUE L'ÉCRAN « PROGRESSION » DIT (#5547) — les libellés, les glyphes et les
 * phrases de palier, loi PURE à côté de la loi de progression partagée
 * (`@meeshy/shared/utils/engagement-progress`), qui, elle, ne connaît aucun
 * mot : elle rend des clés et des nombres, ce fichier les fait parler.
 *
 * Les libellés d'axe et de succès viennent du catalogue PARTAGÉ
 * (`engagement-labels.ts`) — celui que la passerelle prononce dans les
 * bannières et que le miroir iOS porte (`Localizable.xcstrings`) : « même
 * mot, même icône » (dimension 6), une seule écriture. Les tables locales
 * (glyphes, familles) sont typées `Record<clé, …>` sur les unions du
 * catalogue : un axe ajouté côté serveur sans glyphe ici ne compile plus —
 * c'est le témoin d'exhaustivité que le compilateur tient gratuitement, et
 * `progression.test.ts` le rejoue sur les valeurs.
 *
 * Sous-ensemble de `GlyphName | ProgressionGlyphName` (`@/components`) —
 * délibérément NON importé ici : `src/lib/` reste en amont de `src/components/`,
 * jamais l'inverse (même règle que `RowActionGlyph`). L'écran vérifie la
 * compatibilité structurelle à l'usage.
 */
export type ProgressionGlyph =
  | 'microphone'
  | 'chatText'
  | 'article'
  | 'camera'
  | 'filmStrip'
  | 'waveform'
  | 'chatCircleText'
  | 'user'
  | 'globe'
  | 'usersThree'
  | 'usersFour'
  | 'smiley'
  | 'magicWand'
  | 'linkSimple'
  | 'shareNetwork'
  | 'userPlus'
  | 'handshake'
  | 'paperPlaneTilt'
  | 'heart'
  | 'paperclip';

/**
 * Les MOTS viennent du catalogue partagé (`@meeshy/shared/utils/engagement-labels`),
 * le même que la passerelle prononce dans les bannières et que le miroir iOS
 * porte (`Localizable.xcstrings`, gardé par `engagement-labels-mirror-parity`),
 * dans la langue d'INTERFACE (#10823) — lue à l'appel, jamais figée à l'import.
 */
export const axisLabel = (key: EngagementAxisKey, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  ENGAGEMENT_AXIS_LABELS[language][key];

export const AXIS_GLYPHS: Record<EngagementAxisKey, ProgressionGlyph> = {
  'content.audio_message': 'microphone',
  'content.text_message': 'chatText',
  'content.post': 'article',
  'content.story': 'camera',
  'content.reel': 'filmStrip',
  'comment.audio': 'waveform',
  'comment.text': 'chatCircleText',
  'conversation.private': 'user',
  'conversation.public': 'globe',
  'conversation.community': 'usersThree',
  'conversation.group_created': 'usersFour',
  'tool.sticker': 'smiley',
  'tool.in_app_edit': 'magicWand',
  'tool.direct_publish': 'paperPlaneTilt',
  'tool.reaction': 'heart',
  'tool.attachment': 'paperclip',
  'social.tracked_link': 'linkSimple',
  'social.share': 'shareNetwork',
  'social.invite_joined': 'userPlus',
  'social.friendship': 'handshake',
};

export type AchievementCopy = {
  readonly title: string;
  /** La CONDITION, lisible verrouillée — ce qu'il reste à faire, jamais un mystère. */
  readonly condition: string;
};

export const achievementCopy = (
  key: EngagementAchievementKey,
  language: InterfaceLanguage = currentInterfaceLanguage(),
): AchievementCopy => ENGAGEMENT_ACHIEVEMENT_LABELS[language][key];

/** Le titre d'un succès nommé lu par sa clé SERVIE — une clé que ce client ne connaît pas encore rend `null`, jamais un titre inventé. */
export const namedAchievementTitle = (key: string, language: InterfaceLanguage = currentInterfaceLanguage()): string | null => {
  const known: Readonly<Partial<Record<string, AchievementCopy>>> = ENGAGEMENT_ACHIEVEMENT_LABELS[language];
  return known[key]?.title ?? null;
};

export const progressPercent = (progress: number): number => Math.round(Math.min(1, Math.max(0, progress)) * 100);

/** « Niveau 3 » (« Level 3 ») — le niveau courant, 0 avant le premier palier. */
export const levelTitle = (level: number, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  translateGame(language, 'game.banner.level', { level: formatGameNumber(language, level) });

/**
 * La phrase de la barre d'un badge — ce qu'il reste AVANT le prochain palier,
 * depuis le dernier franchi, ou l'échelle complète. Une barre sans phrase dit
 * une fraction ; la phrase dit le pas. Dans la langue d'interface (#10823),
 * avec les valeurs d'iOS (`progression.next.badge`, `progression.scale.complete`).
 */
export function nextStepLabel(scale: EngagementScaleProgress, language: InterfaceLanguage = currentInterfaceLanguage()): string {
  if (scale.nextThreshold === null) return translateGame(language, 'game.progression.scale_complete');
  const remaining = Math.max(0, scale.nextThreshold - scale.value);
  return translateGame(language, 'game.progression.next_badge', {
    missing: formatGameNumber(language, remaining),
    goal: formatGameNumber(language, scale.nextThreshold),
  });
}

/**
 * « Obtenu le 3 septembre 2026 » (« Earned on September 3, 2026 »), dans la
 * langue d'INTERFACE (#10822), ou `null` quand aucune trace gravée ne date le palier.
 */
export function reachedAtLabel(reachedAt: string | null, language: InterfaceLanguage = currentInterfaceLanguage()): string | null {
  if (reachedAt === null) return null;
  if (Number.isNaN(new Date(reachedAt).getTime())) return null;
  return translateGame(language, 'game.detail.earned_on', { date: awardedDate(reachedAt, language) });
}

/**
 * LES SECTIONS DE SUCCÈS GÉNÉRÉS (#5759) — un titre par rangée horizontale,
 * dans la langue d'interface (#10823, valeurs d'iOS `achievement.section.*`).
 *
 * Les LIBELLÉS des succès viennent du catalogue partagé
 * (`achievementLabel`) ; seuls les TITRES de section sont au catalogue du jeu,
 * parce qu'ils nomment un découpage d'écran, pas un fait de produit.
 */
export const achievementSectionTitle = (section: AchievementSection, language: InterfaceLanguage = currentInterfaceLanguage()): string =>
  translateGame(language, `game.progression.section.${section}`);

/** Le libellé d'un succès généré, dans la langue d'interface. */
export const generatedAchievementLabel = (
  family: AchievementFamily,
  tier: number,
  language: InterfaceLanguage = currentInterfaceLanguage(),
): string => achievementLabel(language, family, tier) ?? '';
