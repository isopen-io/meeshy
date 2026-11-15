import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { loadOnboarding } from '@/lib/api/onboarding';
import { appQueryClient } from '@/lib/api/query-client';
import { navigate } from '@/lib/router';

import { createOnboardingLanding } from './landing';

/**
 * L'INSTANCE que la garde de session (`main.tsx`) charge en `import()` à
 * l'arrivée d'une session sur `/` — hors de la première peinture : ce module
 * et sa lecture ne coûtent rien à qui n'est pas concerné. La navigation
 * REMPLACE l'entrée : le bouton retour du parcours ne ramène pas vers un
 * accueil qui le reproposerait.
 */
export const onboardingLanding = createOnboardingLanding({
  queryClient: appQueryClient,
  load: async () => unwrap(await loadOnboarding(apiDeps)),
  navigate: (path) => navigate(path, true),
});
