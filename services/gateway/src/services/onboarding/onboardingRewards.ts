import {
  ENGAGEMENT_AXIS_WEIGHTS,
  engagementAxisFamily,
  isEngagementAxisKey,
  type EngagementAxisKey,
} from '@meeshy/shared/types/engagement';
import {
  computeEngagementElan,
  creditedPoints,
  elanInputsFromRows,
  type EngagementElanInput,
} from '@meeshy/shared/utils/engagement-elan';
import type { OnboardingStepRewards } from '@meeshy/shared/types/onboarding';

/**
 * **CE QUE CHAQUE GESTE DE L'ONBOARDING CRÉDITERA, À L'ÉLAN COURANT** (#7908).
 *
 * Les axes que chaque geste crédite, tels que les producteurs les écrivent :
 * - le salut dans Meeshy Global — `content.text_message`
 *   (`messagePostSaveEffects`) + `conversation.public` au premier message de
 *   la conversation (`recordConversationActivity`, Global est publique) ;
 * - la story — `content.story` + `tool.direct_publish` (`publication.ts` ;
 *   un montage in-app crédite `tool.in_app_edit`, même poids) ;
 * - l'amitié acceptée — `social.friendship`, à CHACUNE des deux parties, à
 *   son propre élan (`friend-requests-core.ts`) : la part servie est celle du
 *   lecteur.
 *
 * Chaque axe crédite `poids × élan(familles récentes ∪ sa famille)` — la même
 * loi qu'`EngagementService.elanFor`, donc le chiffre annoncé est celui qui
 * sera appliqué (au cache d'une minute de l'élan près).
 */
const STEP_AXES = {
  global: ['content.text_message', 'conversation.public'],
  story: ['content.story', 'tool.direct_publish'],
  friendship: ['social.friendship'],
} as const satisfies Record<keyof OnboardingStepRewards, readonly EngagementAxisKey[]>;

export function onboardingStepRewards(input: EngagementElanInput): OnboardingStepRewards {
  const credit = (axes: readonly EngagementAxisKey[]): number =>
    axes.reduce(
      (sum, axis) =>
        sum +
        creditedPoints(
          ENGAGEMENT_AXIS_WEIGHTS[axis],
          computeEngagementElan({ ...input, activeFamilies: [...input.activeFamilies, engagementAxisFamily(axis)] }),
        ),
      0,
    );
  return {
    global: credit(STEP_AXES.global),
    story: credit(STEP_AXES.story),
    friendship: credit(STEP_AXES.friendship),
  };
}

/** Les entrées de l'élan, depuis les lignes que `OnboardingService` lit. */
export function elanInputOf(params: {
  readonly counters: readonly { readonly axisKey: string; readonly updatedAt: Date }[];
  readonly milestones: readonly { readonly milestoneType: string; readonly milestoneKey: string }[];
  readonly now: Date;
}): EngagementElanInput {
  return elanInputsFromRows({
    counters: params.counters,
    milestones: params.milestones,
    now: params.now,
    familyOf: (axisKey) => (isEngagementAxisKey(axisKey) ? engagementAxisFamily(axisKey) : null),
  });
}
