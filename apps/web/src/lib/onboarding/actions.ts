import type { QueryClient } from '@tanstack/react-query';

import type { OnboardingStepOutcome } from '@meeshy/shared/types/onboarding';

import { declareBirthDate, type BirthDateOutcome } from '@/lib/api/birth-date';
import { CONVERSATIONS_QUERY_KEY } from '@/lib/api/conversations';
import {
  ONBOARDING_QUERY_KEY,
  ONBOARDING_STEPS,
  patchOnboarding,
  type OnboardingDeps,
  type OnboardingPatchBody,
  type OnboardingState,
  type OnboardingStepId,
} from '@/lib/api/onboarding';

/**
 * **LES DEUX ÉCRITURES DU PARCOURS, OPTIMISTES** (#7729) — l'étape vue et la
 * fin. Le cache change AU GESTE (la carte suivante ne l'attend pas), puis
 * reçoit l'état SERVI. Un échec ne revient pas en arrière : une carte quittée
 * ne se représente pas sous les doigts ; la route est idempotente, et la
 * reprise suivante relira le serveur, qui arbitre.
 */

export type OnboardingActionDeps = OnboardingDeps & { readonly queryClient: QueryClient };

const patchCache = (queryClient: QueryClient, update: (state: OnboardingState) => OnboardingState): void => {
  queryClient.setQueryData<OnboardingState>(ONBOARDING_QUERY_KEY, (current) => (current === undefined ? current : update(current)));
};

async function send(deps: OnboardingActionDeps, body: OnboardingPatchBody): Promise<boolean> {
  const result = await patchOnboarding(deps, body);
  if (!result.ok) return false;
  deps.queryClient.setQueryData(ONBOARDING_QUERY_KEY, result.data);
  return true;
}

export function recordStep(deps: OnboardingActionDeps, step: OnboardingStepId, outcome: OnboardingStepOutcome): Promise<boolean> {
  patchCache(deps.queryClient, (state) => ({
    ...state,
    seenSteps: ONBOARDING_STEPS.filter((id) => id === step || state.seenSteps.includes(id)),
  }));
  return send(deps, { step, outcome });
}

/**
 * **L'ÂGE DÉCLARÉ** (#9928) — attendu, pas optimiste : c'est la réponse qui
 * dit la carte suivante (Meeshy Global proposée ou non) et le seul refus qui
 * ferme le compte (moins de 13 ans). Ce que la passerelle a tranché entre
 * dans le cache de l'accueil ; un compte devenu fermé en écriture relit sa
 * liste, où Global passe aux archives et son composeur se verrouille.
 */
export async function declareAge(deps: OnboardingActionDeps, birthDate: string): Promise<BirthDateOutcome> {
  const outcome = await declareBirthDate(deps, birthDate);
  if (outcome.kind !== 'saved') return outcome;
  patchCache(deps.queryClient, (state) => ({ ...state, viewerWriteRestriction: outcome.minorGlobal ? 'minor-global' : null }));
  if (outcome.minorGlobal) void deps.queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY });
  return outcome;
}

export function finishJourney(deps: OnboardingActionDeps, now: () => Date = () => new Date()): Promise<boolean> {
  patchCache(deps.queryClient, (state) => ({ ...state, eligible: false, completedAt: state.completedAt ?? now().toISOString() }));
  return send(deps, { finish: true });
}
