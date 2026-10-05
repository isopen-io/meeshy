import {
  ENGAGEMENT_OPERATIONS,
  ENGAGEMENT_OPERATION_CATALOG,
  type EngagementOperationKey,
} from '@meeshy/shared/types/engagement-operations';
import {
  parseEngagementScale,
  type EngagementAbuseRules,
  type EngagementLinkVisitRules,
  type EngagementMultiplierRules,
  type EngagementScale,
} from '@meeshy/shared/types/engagement-scale';

/**
 * LE BROUILLON DU BARÈME (#8906, #8959) — ce que l'écran d'administration édite.
 *
 * Un champ numérique se tape : il passe par des états qui ne sont pas des
 * nombres (« », « 1, », « - »). Le brouillon garde donc le TEXTE, et
 * `scaleOfDraft` le relit par la loi partagée `parseEngagementScale` — la même
 * que la passerelle applique au `PUT`. Un brouillon invalide rend `null` et
 * n'est jamais envoyé ; un plafond VIDE veut dire « aucun ».
 */

export type OperationDraft = {
  readonly points: string;
  readonly multiplied: boolean;
  /** `''` ⇒ sans plafond. */
  readonly cap: string;
  /** Les points de chaque variante déclarée par le catalogue. */
  readonly variants: Readonly<Record<string, string>>;
};

export type MultiplierField = Exclude<keyof EngagementMultiplierRules, 'levelCaps'>;
export type LinkVisitField = keyof EngagementLinkVisitRules;
export type AbuseField = keyof EngagementAbuseRules;

export const MULTIPLIER_FIELDS: readonly MultiplierField[] = [
  'windowDays',
  'stepPerExtraFamily',
  'standingBonus',
  'achievementsForStanding',
  'highBadgeThreshold',
  'highBadgesForStanding',
  'maxFactor',
];

export const LINK_VISIT_FIELDS: readonly LinkVisitField[] = [
  'basePoints',
  'firstTier',
  'stepPerDoubling',
  'maxPoints',
  'dedupHours',
  'dailyCapPerCreator',
];

export const ABUSE_FIELDS: readonly AbuseField[] = ['heavyPoints', 'clawbackHours', 'unverifiedMaxPoints'];

export type LevelCapDraft = { readonly minLevel: string; readonly maxFactor: string };
export type StreakBonusDraft = { readonly days: string; readonly points: string };

export type ScaleDraft = {
  readonly operations: Readonly<Record<EngagementOperationKey, OperationDraft>>;
  readonly multiplier: Readonly<Record<MultiplierField, string>>;
  readonly levelCaps: readonly LevelCapDraft[];
  readonly linkVisits: Readonly<Record<LinkVisitField, string>>;
  readonly streakBonuses: readonly StreakBonusDraft[];
  readonly abuse: Readonly<Record<AbuseField, string>>;
};

const textOf = (value: number | null): string => (value === null ? '' : String(value));

export function draftOf(scale: EngagementScale): ScaleDraft {
  const operations = Object.fromEntries(
    ENGAGEMENT_OPERATIONS.map((key) => {
      const rule = scale.operations[key];
      const variants = Object.fromEntries(
        ENGAGEMENT_OPERATION_CATALOG[key].variants.map((variant) => [variant, String(rule.variantPoints[variant] ?? rule.points)]),
      );
      return [key, { points: String(rule.points), multiplied: rule.multiplied, cap: textOf(rule.cap), variants }];
    }),
  ) as Record<EngagementOperationKey, OperationDraft>;
  return {
    operations,
    multiplier: Object.fromEntries(MULTIPLIER_FIELDS.map((field) => [field, String(scale.multiplier[field])])) as Record<
      MultiplierField,
      string
    >,
    levelCaps: scale.multiplier.levelCaps.map((cap) => ({ minLevel: String(cap.minLevel), maxFactor: String(cap.maxFactor) })),
    linkVisits: Object.fromEntries(LINK_VISIT_FIELDS.map((field) => [field, textOf(scale.linkVisits[field])])) as Record<
      LinkVisitField,
      string
    >,
    streakBonuses: scale.streakBonuses.map((bonus) => ({ days: String(bonus.days), points: String(bonus.points) })),
    abuse: Object.fromEntries(ABUSE_FIELDS.map((field) => [field, String(scale.abuse[field])])) as Record<AbuseField, string>,
  };
}

/** Un texte en nombre ; vide ou illisible ⇒ `NaN`, que la loi partagée refuse. */
const numberOf = (text: string): number => {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
};

const optionalNumberOf = (text: string): number | null => (text.trim() === '' ? null : numberOf(text));

export function scaleOfDraft(draft: ScaleDraft): EngagementScale | null {
  return parseEngagementScale({
    operations: Object.fromEntries(
      ENGAGEMENT_OPERATIONS.map((key) => {
        const rule = draft.operations[key];
        return [
          key,
          {
            points: numberOf(rule.points),
            multiplied: rule.multiplied,
            cap: optionalNumberOf(rule.cap),
            variantPoints: Object.fromEntries(Object.entries(rule.variants).map(([variant, points]) => [variant, numberOf(points)])),
          },
        ];
      }),
    ),
    multiplier: {
      ...Object.fromEntries(MULTIPLIER_FIELDS.map((field) => [field, numberOf(draft.multiplier[field])])),
      levelCaps: draft.levelCaps.map((cap) => ({ minLevel: numberOf(cap.minLevel), maxFactor: numberOf(cap.maxFactor) })),
    },
    linkVisits: Object.fromEntries(
      LINK_VISIT_FIELDS.map((field) => [
        field,
        field === 'dailyCapPerCreator' ? optionalNumberOf(draft.linkVisits[field]) : numberOf(draft.linkVisits[field]),
      ]),
    ),
    streakBonuses: draft.streakBonuses.map((bonus) => ({ days: numberOf(bonus.days), points: numberOf(bonus.points) })),
    abuse: Object.fromEntries(ABUSE_FIELDS.map((field) => [field, numberOf(draft.abuse[field])])),
  });
}

export function withOperation(draft: ScaleDraft, key: EngagementOperationKey, patch: Partial<OperationDraft>): ScaleDraft {
  return { ...draft, operations: { ...draft.operations, [key]: { ...draft.operations[key], ...patch } } };
}

export function withVariant(draft: ScaleDraft, key: EngagementOperationKey, variant: string, points: string): ScaleDraft {
  const rule = draft.operations[key];
  return withOperation(draft, key, { variants: { ...rule.variants, [variant]: points } });
}

export function withMultiplier(draft: ScaleDraft, field: MultiplierField, value: string): ScaleDraft {
  return { ...draft, multiplier: { ...draft.multiplier, [field]: value } };
}

export function withLinkVisit(draft: ScaleDraft, field: LinkVisitField, value: string): ScaleDraft {
  return { ...draft, linkVisits: { ...draft.linkVisits, [field]: value } };
}

export function withAbuse(draft: ScaleDraft, field: AbuseField, value: string): ScaleDraft {
  return { ...draft, abuse: { ...draft.abuse, [field]: value } };
}

export function withLevelCap(draft: ScaleDraft, index: number, patch: Partial<LevelCapDraft>): ScaleDraft {
  return { ...draft, levelCaps: draft.levelCaps.map((cap, i) => (i === index ? { ...cap, ...patch } : cap)) };
}

/** Un niveau de plus, un cran au-dessus du dernier, au plafond global. */
export function withAddedLevelCap(draft: ScaleDraft): ScaleDraft {
  const last = draft.levelCaps.reduce((max, cap) => Math.max(max, Number.isFinite(numberOf(cap.minLevel)) ? numberOf(cap.minLevel) : 0), -1);
  return { ...draft, levelCaps: [...draft.levelCaps, { minLevel: String(last + 1), maxFactor: draft.multiplier.maxFactor }] };
}

export function withoutLevelCap(draft: ScaleDraft, index: number): ScaleDraft {
  return { ...draft, levelCaps: draft.levelCaps.filter((_, i) => i !== index) };
}

export function withStreakBonus(draft: ScaleDraft, index: number, patch: Partial<StreakBonusDraft>): ScaleDraft {
  return { ...draft, streakBonuses: draft.streakBonuses.map((bonus, i) => (i === index ? { ...bonus, ...patch } : bonus)) };
}

/** Un palier de plus, au double du dernier. */
export function withAddedStreakBonus(draft: ScaleDraft): ScaleDraft {
  const last = draft.streakBonuses.reduce((max, bonus) => Math.max(max, Number.isFinite(numberOf(bonus.days)) ? numberOf(bonus.days) : 0), 0);
  return { ...draft, streakBonuses: [...draft.streakBonuses, { days: String(Math.max(1, last * 2)), points: '0' }] };
}

export function withoutStreakBonus(draft: ScaleDraft, index: number): ScaleDraft {
  return { ...draft, streakBonuses: draft.streakBonuses.filter((_, i) => i !== index) };
}
