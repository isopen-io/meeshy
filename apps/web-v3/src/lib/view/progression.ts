import type { EngagementAchievementKey, EngagementAxisFamily, EngagementAxisKey } from '@meeshy/shared/types/engagement';
import type { EngagementScaleProgress } from '@meeshy/shared/utils/engagement-progress';

/**
 * CE QUE L'ÉCRAN « PROGRESSION » DIT (#5547) — les libellés, les glyphes et les
 * phrases de palier, loi PURE à côté de la loi de progression partagée
 * (`@meeshy/shared/utils/engagement-progress`), qui, elle, ne connaît aucun
 * mot : elle rend des clés et des nombres, ce fichier les fait parler.
 *
 * Les libellés sont ceux d'iOS (`apps/ios/Meeshy/Localizable.xcstrings`,
 * clés `progression.*`, posées dans le MÊME lot — #5698) : « même mot, même
 * icône » (dimension 6). Les tables sont typées `Record<clé, …>` sur les
 * unions du catalogue partagé : un axe ou un succès ajouté côté serveur sans
 * libellé ici ne compile plus — c'est le témoin d'exhaustivité que le
 * compilateur tient gratuitement, et `progression.test.ts` le rejoue sur les
 * valeurs.
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
  | 'smiley'
  | 'magicWand'
  | 'paperPlaneTilt';

export const AXIS_LABELS: Record<EngagementAxisKey, string> = {
  'content.audio_message': 'Messages vocaux',
  'content.text_message': 'Messages texte',
  'content.post': 'Publications',
  'content.story': 'Stories',
  'content.reel': 'Réels',
  'comment.audio': 'Commentaires vocaux',
  'comment.text': 'Commentaires écrits',
  'conversation.private': 'Conversations privées',
  'conversation.public': 'Conversations publiques',
  'conversation.community': 'Conversations de communauté',
  'tool.sticker': 'Stickers posés',
  'tool.in_app_edit': 'Montages dans l’app',
  'tool.direct_publish': 'Publications directes',
};

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
  'tool.sticker': 'smiley',
  'tool.in_app_edit': 'magicWand',
  'tool.direct_publish': 'paperPlaneTilt',
};

export const FAMILY_LABELS: Record<EngagementAxisFamily, string> = {
  content: 'Contenu produit',
  comment: 'Commentaires',
  conversation: 'Conversations',
  tool: 'Outils',
};

export type AchievementCopy = {
  readonly title: string;
  /** La CONDITION, lisible verrouillée — ce qu'il reste à faire, jamais un mystère. */
  readonly condition: string;
};

export const ACHIEVEMENT_COPY: Record<EngagementAchievementKey, AchievementCopy> = {
  'achievement.first_content': {
    title: 'Premier pas',
    condition: 'Publier un premier contenu, quel qu’il soit',
  },
  'achievement.all_content_types': {
    title: 'Touche-à-tout',
    condition: 'Un message vocal, un message texte, une publication, une story et un réel',
  },
  'achievement.first_voice': {
    title: 'Première voix',
    condition: 'Un premier message ou commentaire vocal',
  },
  'achievement.editor': {
    title: 'Monteur',
    condition: 'Un premier montage dans l’app avant de publier',
  },
  'achievement.three_conversation_kinds': {
    title: 'Trois cercles',
    condition: 'Écrire dans une conversation privée, une publique et une de communauté',
  },
};

export const progressPercent = (progress: number): number => Math.round(Math.min(1, Math.max(0, progress)) * 100);

const plural = (count: number, singular: string, pluralForm: string): string =>
  `${count} ${count > 1 ? pluralForm : singular}`;

/** « Niveau 3 » — le niveau courant, 0 avant le premier palier. */
export const levelTitle = (level: number): string => `Niveau ${level}`;

/** « 350 points » — le score qui porte le niveau. */
export const scoreLabel = (score: number): string => plural(score, 'point', 'points');

/** « 5 jours d’affilée » / « Aucune série en cours ». */
export const streakLabel = (currentDays: number): string =>
  currentDays === 0 ? 'Aucune série en cours' : `${plural(currentDays, 'jour', 'jours')} d’affilée`;

/** « Record : 12 jours » — la série la plus longue, qui tient les jalons pour atteints. */
export const streakRecordLabel = (longestDays: number): string => `Record : ${plural(longestDays, 'jour', 'jours')}`;

/**
 * La phrase de la barre — ce qu'il reste AVANT le prochain palier, depuis le
 * dernier franchi, ou l'échelle complète. Une barre sans phrase dit une
 * fraction ; la phrase dit le pas.
 */
export function nextStepLabel(scale: EngagementScaleProgress, unit: { readonly singular: string; readonly plural: string; readonly goal: string }): string {
  if (scale.nextThreshold === null) return 'Échelle complète';
  const remaining = Math.max(0, scale.nextThreshold - scale.value);
  const counted = unit.plural === '' ? `${remaining}` : plural(remaining, unit.singular, unit.plural);
  return `Encore ${counted} avant ${unit.goal} ${scale.nextThreshold}`;
}

export const BADGE_UNIT = { singular: '', plural: '', goal: 'le palier' } as const;
export const LEVEL_UNIT = { singular: 'point', plural: 'points', goal: 'le niveau' } as const;
export const STREAK_UNIT = { singular: 'jour', plural: 'jours', goal: 'le jalon de' } as const;

/** « Obtenu le 3 septembre 2026 », ou `null` quand aucune trace gravée ne date le palier. */
export function reachedAtLabel(reachedAt: string | null): string | null {
  if (reachedAt === null) return null;
  const date = new Date(reachedAt);
  if (Number.isNaN(date.getTime())) return null;
  return `Obtenu le ${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}`;
}
