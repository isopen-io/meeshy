import type { EngagementAchievementKey, EngagementAxisFamily, EngagementAxisKey } from '@meeshy/shared/types/engagement';
import { ENGAGEMENT_ACHIEVEMENT_LABELS, ENGAGEMENT_AXIS_LABELS } from '@meeshy/shared/utils/engagement-labels';
import type { EngagementScaleProgress } from '@meeshy/shared/utils/engagement-progress';
import { achievementLabel } from '@meeshy/shared/utils/achievement-labels';
import type { AchievementFamily, AchievementSection } from '@meeshy/shared/types/achievement-catalog';

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
  | 'smiley'
  | 'magicWand'
  | 'linkSimple'
  | 'shareNetwork'
  | 'userPlus'
  | 'handshake'
  | 'paperPlaneTilt';

/**
 * Les MOTS viennent du catalogue partagé (`@meeshy/shared/utils/engagement-labels`),
 * le même que la passerelle prononce dans les bannières et que le miroir iOS
 * porte (`Localizable.xcstrings`, gardé par `engagement-labels-mirror-parity`).
 * La v3.1 parle français sur tous ses écrans à ce jour — le jour où elle
 * suivra la langue du lecteur, seule cette constante bouge.
 */
const WEB_LANGUAGE = 'fr';

export const AXIS_LABELS: Record<EngagementAxisKey, string> = ENGAGEMENT_AXIS_LABELS[WEB_LANGUAGE];

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
  'social.tracked_link': 'linkSimple',
  'social.share': 'shareNetwork',
  'social.invite_joined': 'userPlus',
  'social.friendship': 'handshake',
};

export const FAMILY_LABELS: Record<EngagementAxisFamily, string> = {
  content: 'Contenu produit',
  comment: 'Commentaires',
  conversation: 'Conversations',
  tool: 'Outils',
  social: 'Lien social',
};

export type AchievementCopy = {
  readonly title: string;
  /** La CONDITION, lisible verrouillée — ce qu'il reste à faire, jamais un mystère. */
  readonly condition: string;
};

export const ACHIEVEMENT_COPY: Record<EngagementAchievementKey, AchievementCopy> = ENGAGEMENT_ACHIEVEMENT_LABELS[WEB_LANGUAGE];

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
export function nextStepLabel(
  scale: EngagementScaleProgress,
  unit: { readonly singular: string; readonly plural: string; readonly goal: string },
  /**
   * Ce que la phrase NOMME comme but — le prochain palier par défaut. Le
   * niveau passe son RANG (« niveau 4 »), jamais son seuil de points
   * (« niveau 400 ») : c'est le défaut de la notification `level_up`
   * relevé en production, et la carte de niveau le rejouait.
   */
  goalValue: number | null = scale.nextThreshold,
): string {
  if (scale.nextThreshold === null || goalValue === null) return 'Échelle complète';
  const remaining = Math.max(0, scale.nextThreshold - scale.value);
  const counted = unit.plural === '' ? `${remaining}` : plural(remaining, unit.singular, unit.plural);
  return `Encore ${counted} avant ${unit.goal} ${goalValue}`;
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

/**
 * LES SECTIONS DE SUCCÈS GÉNÉRÉS (#5759) — un titre par rangée horizontale.
 *
 * Les LIBELLÉS des succès viennent du catalogue partagé
 * (`achievementLabel`) ; seuls les TITRES de section sont ici, parce qu'ils
 * nomment un découpage d'écran, pas un fait de produit.
 */
export const ACHIEVEMENT_SECTION_TITLES: Record<AchievementSection, string> = {
  cercles: 'Cercles',
  parole: 'Parole',
  retouche: 'Retouches',
  appels: 'Appels',
  ambassade: 'Ambassade',
  constance: 'Constance',
  monnaie: 'Monnaie',
  decouverte: 'Découverte',
};

/** Le libellé d'un succès généré, dans la langue de l'écran. */
export const generatedAchievementLabel = (family: AchievementFamily, tier: number): string =>
  achievementLabel(WEB_LANGUAGE, family, tier) ?? '';
