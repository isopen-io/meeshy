import { ENGAGEMENT_AXES, type EngagementAxisKey } from '@meeshy/shared/types/engagement';
import {
  parseEngagementScale,
  type EngagementMultiplierRules,
  type EngagementScale,
} from '@meeshy/shared/types/engagement-scale';

/**
 * LE BROUILLON DU BARÈME (#8906) — ce que l'écran d'administration édite.
 *
 * Un champ numérique se tape : il passe par des états qui ne sont pas des
 * nombres (« », « 1, », « - »). Le brouillon garde donc le TEXTE, et
 * `scaleOfDraft` le relit par la loi partagée `parseEngagementScale` — la même
 * que la passerelle applique au `PUT`. Un brouillon invalide rend `null` et
 * n'est jamais envoyé ; un plafond journalier VIDE veut dire « aucun ».
 */

export type OperationDraft = {
  readonly points: string;
  readonly multiplied: boolean;
  /** `''` ⇒ sans plafond. */
  readonly dailyCap: string;
};

export type MultiplierField = Exclude<keyof EngagementMultiplierRules, 'levelCaps'>;

export const MULTIPLIER_FIELDS: readonly MultiplierField[] = [
  'windowDays',
  'stepPerExtraFamily',
  'standingBonus',
  'achievementsForStanding',
  'highBadgeThreshold',
  'highBadgesForStanding',
  'maxFactor',
];

export type LevelCapDraft = { readonly minLevel: string; readonly maxFactor: string };

export type ScaleDraft = {
  readonly operations: Readonly<Record<EngagementAxisKey, OperationDraft>>;
  readonly multiplier: Readonly<Record<MultiplierField, string>>;
  readonly levelCaps: readonly LevelCapDraft[];
};

export function draftOf(scale: EngagementScale): ScaleDraft {
  const operations = Object.fromEntries(
    ENGAGEMENT_AXES.map((axis) => {
      const rule = scale.operations[axis];
      return [
        axis,
        {
          points: String(rule.points),
          multiplied: rule.multiplied,
          dailyCap: rule.dailyCapPerConversation === null ? '' : String(rule.dailyCapPerConversation),
        },
      ];
    }),
  ) as Record<EngagementAxisKey, OperationDraft>;
  const multiplier = Object.fromEntries(
    MULTIPLIER_FIELDS.map((field) => [field, String(scale.multiplier[field])]),
  ) as Record<MultiplierField, string>;
  return {
    operations,
    multiplier,
    levelCaps: scale.multiplier.levelCaps.map((cap) => ({ minLevel: String(cap.minLevel), maxFactor: String(cap.maxFactor) })),
  };
}

/** Un texte en nombre ; vide ou illisible ⇒ `NaN`, que la loi partagée refuse. */
const numberOf = (text: string): number => {
  const trimmed = text.trim().replace(',', '.');
  return trimmed === '' ? Number.NaN : Number(trimmed);
};

export function scaleOfDraft(draft: ScaleDraft): EngagementScale | null {
  return parseEngagementScale({
    operations: Object.fromEntries(
      ENGAGEMENT_AXES.map((axis) => {
        const rule = draft.operations[axis];
        return [
          axis,
          {
            points: numberOf(rule.points),
            multiplied: rule.multiplied,
            dailyCapPerConversation: rule.dailyCap.trim() === '' ? null : numberOf(rule.dailyCap),
          },
        ];
      }),
    ),
    multiplier: {
      ...Object.fromEntries(MULTIPLIER_FIELDS.map((field) => [field, numberOf(draft.multiplier[field])])),
      levelCaps: draft.levelCaps.map((cap) => ({ minLevel: numberOf(cap.minLevel), maxFactor: numberOf(cap.maxFactor) })),
    },
  });
}

export function withOperation(draft: ScaleDraft, axis: EngagementAxisKey, patch: Partial<OperationDraft>): ScaleDraft {
  return { ...draft, operations: { ...draft.operations, [axis]: { ...draft.operations[axis], ...patch } } };
}

export function withMultiplier(draft: ScaleDraft, field: MultiplierField, value: string): ScaleDraft {
  return { ...draft, multiplier: { ...draft.multiplier, [field]: value } };
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
