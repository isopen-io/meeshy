import {
  engagementAxisFamily,
  isEngagementAxisKey,
  type EngagementAxisKey,
} from '@meeshy/shared/types/engagement';
import { visibilityVariant } from '@meeshy/shared/types/engagement-operations';
import {
  elanUnderScaleFromRows,
  pointsForOperation,
  type EngagementScale,
} from '@meeshy/shared/types/engagement-scale';
import type { OnboardingStepRewards } from '@meeshy/shared/types/onboarding';

/**
 * **CE QUE CHAQUE GESTE DE L'ONBOARDING CRÉDITERA, À L'ÉLAN COURANT** (#7908).
 *
 * Les axes que chaque geste crédite, tels que les producteurs les écrivent :
 * - le salut dans Meeshy Global — `content.text_message`
 *   (`messagePostSaveEffects`) + `conversation.public` au premier message de
 *   la conversation (`recordConversationActivity`, Global est publique) ;
 * - la story — `content.story` + `tool.direct_publish` (`publication.ts` ;
 *   un montage in-app crédite `tool.in_app_edit`, même poids). Depuis #8959
 *   la story vaut selon sa VISIBILITÉ : la part annoncée est celle de la
 *   visibilité par défaut que l'étape propose (`storyVisibility`) ;
 * - l'amitié acceptée — `social.friendship`, à CHACUNE des deux parties, à
 *   son propre élan (`friend-requests-core.ts`) : la part servie est celle du
 *   lecteur.
 *
 * Chaque axe crédite `pointsForOperation(barème, axe, élan(familles récentes
 * ∪ sa famille))` — la même loi qu'`EngagementService`, sous le MÊME barème de
 * l'administration (#8906), donc le chiffre annoncé est celui qui sera
 * appliqué (au cache d'une minute de l'élan près).
 */
const STEP_AXES = {
  global: ['content.text_message', 'conversation.public'],
  story: ['content.story', 'tool.direct_publish'],
  friendship: ['social.friendship'],
} as const satisfies Record<keyof OnboardingStepRewards, readonly EngagementAxisKey[]>;

export type OnboardingRewardRows = {
  readonly scale: EngagementScale;
  readonly counters: readonly { readonly axisKey: string; readonly updatedAt: Date }[];
  readonly milestones: readonly { readonly milestoneType: string; readonly milestoneKey: string }[];
  readonly engagementScore: number;
  readonly now: Date;
  readonly storyVisibility: 'public' | 'friends';
};

export function onboardingStepRewards(rows: OnboardingRewardRows): OnboardingStepRewards {
  const familyOf = (axisKey: string) => (isEngagementAxisKey(axisKey) ? engagementAxisFamily(axisKey) : null);
  const credit = (axes: readonly EngagementAxisKey[], variant?: string): number =>
    axes.reduce(
      (sum, axis) =>
        sum +
        pointsForOperation(
          rows.scale,
          axis,
          elanUnderScaleFromRows({
            rules: rows.scale.multiplier,
            counters: rows.counters,
            milestones: rows.milestones,
            familyOf,
            engagementScore: rows.engagementScore,
            extraFamily: engagementAxisFamily(axis),
            now: rows.now,
          }).factor,
          variant,
        ),
      0,
    );
  return {
    global: credit(STEP_AXES.global),
    story: credit(STEP_AXES.story, visibilityVariant(rows.storyVisibility)),
    friendship: credit(STEP_AXES.friendship),
  };
}
