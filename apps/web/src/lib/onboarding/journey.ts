import type { OnboardingState, OnboardingStepId } from '@meeshy/shared/types/onboarding';

import { ONBOARDING_STEPS } from '@/lib/api/onboarding';

/**
 * **LA LOI DU PARCOURS D'ACCUEIL** (#7729) — pure : elle décide quelle carte
 * vient, ce qu'elle rapporte et ce que dit le récapitulatif. L'écran
 * (`routes/onboarding.tsx`) l'applique, il ne la réécrit pas.
 *
 * Source produit : `docs/marketing/campagne-2026-09/onboarding-parcours.md`
 * § 2 (les cinq cartes) et § 3 (reprise, étape 5 contextuelle).
 */

export type JourneyStep = OnboardingStepId | 'recap';

/**
 * Ce que CE client a vu se CONFIRMER pendant le parcours — un accusé de
 * message, une story publiée, une demande d'ami acceptée par la passerelle.
 * Jamais un geste simplement tenté : la récompense ne s'affiche qu'une fois
 * l'accusé reçu (§ 3, « jamais inventée »).
 */
export type JourneyProgress = {
  readonly done: readonly OnboardingStepId[];
  readonly friendRequests: readonly string[];
};

export const EMPTY_PROGRESS: JourneyProgress = { done: [], friendRequests: [] };

export type JourneyContext = {
  readonly state: OnboardingState;
  readonly progress: JourneyProgress;
  /** La fenêtre système peut-elle encore s'ouvrir (API présente, jamais répondue) ? */
  readonly notificationsAskable: boolean;
};

export const withDone = (progress: JourneyProgress, step: OnboardingStepId): JourneyProgress =>
  progress.done.includes(step) ? progress : { ...progress, done: ONBOARDING_STEPS.filter((id) => id === step || progress.done.includes(id)) };

export const withFriendRequest = (progress: JourneyProgress, userId: string): JourneyProgress =>
  progress.friendRequests.includes(userId) ? progress : { ...progress, friendRequests: [...progress.friendRequests, userId] };

/**
 * **L'ÉTAPE 5 N'EST PROPOSÉE QUE SI 2, 3 OU 4 A PRODUIT QUELQUE CHOSE** qui
 * peut appeler une réponse — un salut, une story (y compris publiée ailleurs,
 * que le serveur pré-coche), une demande d'ami. C'est ce que le carrousel
 * #5218 a appris : la permission demandée à froid est refusée.
 */
export function producedSomething(context: Pick<JourneyContext, 'state' | 'progress'>): boolean {
  const { progress, state } = context;
  return (
    progress.done.includes('global') ||
    progress.done.includes('story') ||
    progress.friendRequests.length > 0 ||
    state.prefilledSteps.includes('global') ||
    state.prefilledSteps.includes('story')
  );
}

/**
 * **UNE ÉTAPE EST RÉGLÉE DÈS QU'ELLE S'EST CONFIRMÉE ICI** — vue par le
 * serveur, pré-cochée par lui, OU confirmée sur cet appareil (`progress.done`).
 * Le troisième terme ferme la fenêtre entre l'accusé et l'écriture serveur :
 * un salut accusé puis un rechargement avant que la passerelle ait enregistré
 * l'étape rouvrirait sinon un composeur neuf — et un second salut partirait.
 */
const isSettled = (step: OnboardingStepId, context: JourneyContext): boolean =>
  context.state.seenSteps.includes(step) || context.state.prefilledSteps.includes(step) || context.progress.done.includes(step);

const isOffered = (step: OnboardingStepId, context: JourneyContext): boolean =>
  step !== 'notifications' || (context.notificationsAskable && producedSomething(context));

const firstOpenFrom = (index: number, context: JourneyContext): JourneyStep =>
  ONBOARDING_STEPS.slice(index).find((step) => !isSettled(step, context) && isOffered(step, context)) ?? 'recap';

export const resumeStep = (context: JourneyContext): JourneyStep => firstOpenFrom(0, context);

export const nextStepAfter = (current: OnboardingStepId, context: JourneyContext): JourneyStep =>
  firstOpenFrom(ONBOARDING_STEPS.indexOf(current) + 1, context);

/**
 * **CE QUE LES RÈGLES DU SERVEUR CRÉDITENT** (§ 1 du parcours) — un premier
 * message dans une conversation : `content.text_message` (9) +
 * `recordConversationActivity` (5) ; une story : `content.story` (9) +
 * `tool.direct_publish` (1). Une demande d'ami ne crédite rien tant qu'elle
 * n'est pas acceptée (+7 à chacun, alors). Le premier niveau est à 10.
 */
const STEP_POINTS: Readonly<Partial<Record<OnboardingStepId, number>>> = { global: 14, story: 10 };

export const FRIENDSHIP_POINTS = 7;
export const LEVEL_ONE_POINTS = 10;

export const stepPoints = (step: OnboardingStepId): number => STEP_POINTS[step] ?? 0;

export const pointsOf = (progress: JourneyProgress): number => progress.done.reduce((sum, step) => sum + stepPoints(step), 0);

export type JourneyRecap = {
  readonly points: number;
  readonly levelReached: boolean;
  readonly streakDays: number;
  readonly badges: number;
  readonly pendingFriends: number;
};

export function recapOf(progress: JourneyProgress): JourneyRecap {
  const points = pointsOf(progress);
  const contents = progress.done.filter((step) => step === 'global' || step === 'story').length;
  return {
    points,
    levelReached: points >= LEVEL_ONE_POINTS,
    streakDays: contents > 0 ? 1 : 0,
    badges: contents,
    pendingFriends: progress.friendRequests.length,
  };
}

export type GreetingDraft = { readonly text: string; readonly holeStart: number; readonly holeEnd: number };

const HOLE = /\[\[([^\]]+)\]\]/;

/**
 * **UN SALUT PRÉ-REMPLI, JAMAIS LE MÊME** (§ 5, parade anti-spam) — un
 * gabarit tiré au hasard parmi ceux de la langue, `{name}` et `{languages}`
 * remplis, et un TROU personnel (`[[…]]`) que le composeur SÉLECTIONNE : taper
 * le remplace, ne rien taper l'envoie tel quel.
 */
export function greetingDraft(input: {
  readonly templates: readonly string[];
  readonly index: number;
  readonly name: string;
  readonly languages: string;
}): GreetingDraft {
  const template = input.templates[Math.min(Math.max(0, input.index), input.templates.length - 1)] ?? '';
  const filled = template.replaceAll('{name}', input.name).replaceAll('{languages}', input.languages);
  const match = HOLE.exec(filled);
  if (match === null || match[1] === undefined) return { text: filled, holeStart: filled.length, holeEnd: filled.length };
  const text = filled.replace(HOLE, match[1]);
  return { text, holeStart: match.index, holeEnd: match.index + match[1].length };
}
