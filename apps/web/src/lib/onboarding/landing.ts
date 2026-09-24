import type { QueryClient } from '@tanstack/react-query';

import type { OnboardingState } from '@meeshy/shared/types/onboarding';

import type { DataSource } from '@/lib/api/config';
import { ONBOARDING_QUERY_KEY, ONBOARDING_STALE_TIME } from '@/lib/api/onboarding';
import type { SessionState } from '@/lib/api/session';

/**
 * **L'ACCUEIL POST-INSCRIPTION SE PROPOSE À L'ARRIVÉE, UNE FOIS** (#7729).
 *
 * Une session qui s'ouvre — connexion, inscription vérifiée, lien magique —
 * atterrit sur l'accueil (`/`). C'est LÀ, et seulement là, que le parcours se
 * propose : un lien profond (une invitation `/chat/…`, un fil nommé, une
 * story) mène où il promet, jamais dans un détour. Le serveur tranche
 * l'éligibilité (compte neuf, non fini, moins de sept jours) ; ce module ne
 * fait que lire sa réponse, en cache d'abord.
 *
 * **Une fois par lancement et par compte** : « Plus tard » ou le bouton retour
 * doivent pouvoir sortir du parcours sans qu'il revienne à la navigation
 * suivante — un parcours qui revient est une porte, et le produit l'interdit
 * (§ 5, « il n'existe pas d'écran bloquant »). La reprise se fait au lancement
 * suivant, à la première étape manquante.
 *
 * **Jamais en fixtures** — même doctrine que `resolveRouteAccess` : le POC et
 * ses captures ne sont pas détournés de l'écran qu'ils visent. La route
 * `/onboarding` reste ouverte pour la recette.
 */

export const ONBOARDING_PATH = '/onboarding';

export type LandingInput = {
  readonly source: DataSource;
  readonly sessionStatus: SessionState['status'];
  readonly routeKey: string;
};

const isLandingMoment = (input: LandingInput): boolean =>
  input.source === 'gateway' && input.sessionStatus === 'authenticated' && input.routeKey === 'list';

const isOpenJourney = (state: OnboardingState | undefined): boolean =>
  state !== undefined && state.eligible && state.completedAt === null;

export function shouldOfferOnboarding(input: LandingInput & { readonly state: OnboardingState | undefined }): boolean {
  return isLandingMoment(input) && isOpenJourney(input.state);
}

export type OnboardingLandingDeps = {
  readonly queryClient: QueryClient;
  readonly load: () => Promise<OnboardingState>;
  readonly navigate: (path: string) => void;
};

export type OnboardingLanding = {
  offer(input: LandingInput & { readonly viewerId: string | null }): Promise<void>;
};

export function createOnboardingLanding(deps: OnboardingLandingDeps): OnboardingLanding {
  const decided = new Set<string>();

  const stateOf = async (): Promise<OnboardingState | undefined> => {
    const cached = deps.queryClient.getQueryData<OnboardingState>(ONBOARDING_QUERY_KEY);
    if (cached !== undefined) return cached;
    try {
      return await deps.queryClient.fetchQuery({ queryKey: ONBOARDING_QUERY_KEY, queryFn: deps.load, staleTime: ONBOARDING_STALE_TIME });
    } catch {
      return undefined;
    }
  };

  return {
    offer: async (input) => {
      if (input.viewerId === null || decided.has(input.viewerId)) return;
      if (!isLandingMoment(input)) return;
      const state = await stateOf();
      if (state === undefined || decided.has(input.viewerId)) return;
      decided.add(input.viewerId);
      if (shouldOfferOnboarding({ ...input, state })) deps.navigate(ONBOARDING_PATH);
    },
  };
}
