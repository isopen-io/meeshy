import type { GuideAction, GuideMood, GuideMoment, GuideMomentKey, GuideSpeaker, OnboardingStep, OnboardingStepKey } from '@meeshy/shared/utils/game/guide';
import { ONBOARDING_STEPS, onboardingStepSeenKey } from '@meeshy/shared/utils/game/guide';

import type { GameBirdKey } from '@/lib/game/birds';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { momentCopy, stepCopy, type GuideCopy } from '@/lib/view/game-guide-copy';

import { awaitingGesture, stepGesture } from './gesture';

/**
 * LE MODÈLE DE LA CARTE DU GUIDE (#9379) — ce que `GameGuideCard` affiche, bâti
 * depuis la loi partagée : un MOMENT (`guideMoment`) ou une ÉTAPE de
 * l'intégration (`ONBOARDING_STEPS`). La carte ne décide rien — ni qui parle,
 * ni quand, ni en entier ou en court : elle le reçoit.
 */

export type GuideCard = {
  /** La clé « vue » que le serveur garde : celle du moment, ou `onboarding.<étape>`. */
  readonly key: string;
  readonly speaker: GuideSpeaker;
  readonly mood: GuideMood;
  readonly copy: GuideCopy;
  readonly action: GuideAction;
  readonly presentation: 'full' | 'short';
  /** Présent pour une étape d'intégration : « Étape 3 sur 7 ». */
  readonly step?: { readonly index: number; readonly total: number };
  /** Présent pour une étape d'intégration : sa clé, pour la retrouver dans la loi. */
  readonly stepKey?: OnboardingStepKey;
  /**
   * L'étape attend un GESTE du joueur (`gesture.ts`) : son bouton mène là où il
   * se fait sans l'écarter, et elle avance quand le geste a eu lieu.
   */
  readonly awaiting?: boolean;
  /** Le moment se photographie (conception, partie VI) : la carte propose « Immortaliser ». */
  readonly photo: boolean;
};

/**
 * Les moments que la conception range parmi les photos : nouveau rang ou
 * division, nouveau palier de niveau, Prestige, première Meesh, palier du
 * trésor. (La Flamme à 7, 30, 100 et 365 jours et les trophées arrivent avec
 * leur propre événement : la Flamme n'a pas de moment guide, les trophées
 * relèvent de la vague 2.)
 */
const PHOTO_MOMENTS: ReadonlySet<GuideMomentKey> = new Set([
  'new-rank',
  'new-tier',
  'level-100',
  'first-mint',
  'treasury-tier',
]);

export const isPhotoMoment = (key: GuideMomentKey): boolean => PHOTO_MOMENTS.has(key);

type Birds = { readonly mee?: GameBirdKey; readonly meo?: GameBirdKey };

const MEE: Readonly<Record<GuideMood, GameBirdKey>> = {
  guide: 'meeGuide',
  cheer: 'meeJoy',
  minting: 'meeCoin',
  ready: 'meeWink',
  streak: 'meeJoy',
  counting: 'meeCoin',
  calm: 'meeGuide',
  sad: 'meeGuide',
  proud: 'meeCrown',
};

const MEO: Readonly<Record<GuideMood, GameBirdKey>> = {
  guide: 'meoGuide',
  cheer: 'meoHeart',
  minting: 'meoStar',
  ready: 'meoStar',
  streak: 'meoStar',
  counting: 'meoOpen',
  calm: 'meoOpen',
  sad: 'meoTeary',
  proud: 'meoCrown',
};

/** Les figures de la carte : un seul locuteur, ou les deux ensemble pour les grands moments. */
export function guideBirds(speaker: GuideSpeaker, mood: GuideMood): Birds {
  if (speaker === 'mee') return { mee: MEE[mood] };
  if (speaker === 'meo') return { meo: MEO[mood] };
  return { mee: MEE[mood], meo: MEO[mood] };
}

export function cardOfMoment(moment: GuideMoment): GuideCard {
  return {
    key: moment.key,
    speaker: moment.speaker,
    mood: moment.mood,
    copy: momentCopy(moment),
    action: moment.action,
    presentation: moment.presentation,
    photo: isPhotoMoment(moment.key),
  };
}

export function cardOfStep(step: OnboardingStep, view?: EngagementWithGame): GuideCard {
  const awaiting = view !== undefined && awaitingGesture(step.key, view);
  const action = awaiting ? (stepGesture(step.key)?.action ?? step.action) : step.action;
  return {
    key: onboardingStepSeenKey(step.key),
    speaker: step.speaker,
    mood: step.mood,
    copy: stepCopy(step, { awaiting, action }),
    action,
    presentation: 'full',
    step: { index: step.index, total: ONBOARDING_STEPS.length },
    stepKey: step.key,
    awaiting,
    photo: false,
  };
}
