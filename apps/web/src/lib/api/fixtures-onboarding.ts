import type { OnboardingPatchBody, OnboardingState, OnboardingSuggestion } from '@meeshy/shared/types/onboarding';

import { CONVERSATION_ID, portraitStandIn } from './fixtures-base';
import { ONBOARDING_STEPS } from './onboarding';

/**
 * **LE CORPUS DE RECETTE DE L'ACCUEIL** (#7729) — ce que sert le port
 * `onboarding.ts` sous la source `fixtures`, chargé en `import()` et élagué des
 * builds `VITE_DATA_SOURCE=gateway`.
 *
 * Un compte neuf, adulte, éligible, qui n'a encore rien vu : c'est l'état que
 * le parcours doit savoir peindre en entier. Meeshy Global y est le fil
 * historique du POC (`CONVERSATION_ID`), pour que « Dis salut » parte vers une
 * conversation que les fixtures connaissent.
 */

const SUGGESTIONS: OnboardingSuggestion[] = [
  { id: 'u-onb-aicha', username: 'aicha', displayName: 'Aïcha', avatarUrl: portraitStandIn('#f472b6', '#7c3aed'), languages: ['fr', 'ar'] },
  { id: 'u-onb-tomas', username: 'tomas', displayName: 'Tomás', avatarUrl: portraitStandIn('#fbbf24', '#ea580c'), languages: ['es', 'fr'] },
  { id: 'u-onb-lena', username: 'lena', displayName: 'Lena', avatarUrl: portraitStandIn('#34d399', '#0f766e'), languages: ['de', 'en'] },
  { id: 'u-onb-kofi', username: 'kofi', displayName: 'Kofi', avatarUrl: null, languages: ['en', 'fr'] },
  { id: 'u-onb-giulia', username: 'giulia', displayName: 'Giulia', avatarUrl: portraitStandIn('#60a5fa', '#1e3a8a'), languages: ['it', 'fr'] },
  { id: 'u-onb-rafa', username: 'rafa', displayName: 'Rafa', avatarUrl: portraitStandIn('#a78bfa', '#312e81'), languages: ['pt', 'es'] },
];

const INITIAL: OnboardingState = {
  eligible: true,
  completedAt: null,
  seenSteps: [],
  prefilledSteps: [],
  globalConversationId: CONVERSATION_ID,
  protectedRegime: false,
  storyDefaultVisibility: 'public',
  suggestions: SUGGESTIONS,
};

let state: OnboardingState = INITIAL;

export const fixtureOnboarding = (): OnboardingState => state;

export function fixturePatchOnboarding(body: OnboardingPatchBody): OnboardingState {
  const finished = (next: OnboardingState): OnboardingState => ({ ...next, eligible: false, completedAt: new Date().toISOString() });
  if ('finish' in body) {
    state = finished(state);
    return state;
  }
  const seen = new Set<string>([...state.seenSteps, body.step]);
  const seenSteps = ONBOARDING_STEPS.filter((id) => seen.has(id));
  state = seenSteps.length === ONBOARDING_STEPS.length ? finished({ ...state, seenSteps }) : { ...state, seenSteps };
  return state;
}

/** Remet le corpus à son état neuf — pour un témoin qui rejoue le parcours. */
export function resetFixtureOnboardingForTests(): void {
  state = INITIAL;
}
