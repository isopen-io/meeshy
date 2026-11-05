import type { QueryClient } from '@tanstack/react-query';
import * as meEndpoints from '@meeshy/shared/api/endpoints/me';
import { CONSENT_PARENT, CONSENT_POLICY_VERSION_DEFAULT, type ConsentPurpose } from '@meeshy/shared/types/consents';

import { CONSENTS_QUERY_KEY, type ConsentsDeps, type GrantedConsents } from './consents';

/**
 * **UN CONSENTEMENT SE BASCULE EN OPTIMISTE** (#16419) — `PUT
 * /me/consents/{purpose}` (`services/gateway/src/routes/me/consents.ts`),
 * motif `app-preferences-actions.ts` : instantané → application locale →
 * réseau → retour arrière.
 *
 * **La forme locale suit la passerelle** : ACCORDER pose aussi les ancêtres
 * manquants (la cascade de la route), RETIRER ne touche que sa propre colonne.
 * Le retour arrière ne défait que les `purpose` que CE geste a changés : une
 * bascule voisine confirmée entre-temps reste confirmée.
 *
 * **Hors ligne, rien ne part et rien ne change** — le web n'a pas de file
 * d'écriture (#6325) ; une bascule qui dirait « accordé » sans jamais partir
 * serait un consentement qui ment.
 *
 * `policyVersion` cite la politique par défaut (`@meeshy/shared`) : la
 * passerelle seule sait laquelle est en vigueur, et son 409 est un refus.
 */

export type ConsentActionDeps = ConsentsDeps & {
  readonly queryClient: QueryClient;
  readonly isOnline: () => boolean;
};

export type ConsentEditOutcome =
  | { readonly status: 'saved' }
  | { readonly status: 'offline' }
  | { readonly status: 'refused'; readonly error: string };

const chainOf = (purpose: ConsentPurpose): readonly ConsentPurpose[] => {
  const parent = CONSENT_PARENT[purpose];
  return parent === null ? [purpose] : [...chainOf(parent), purpose];
};

const withPurposes = (granted: GrantedConsents, purposes: readonly ConsentPurpose[], on: boolean): GrantedConsents =>
  on ? [...granted, ...purposes.filter((purpose) => !granted.includes(purpose))] : granted.filter((purpose) => !purposes.includes(purpose));

export async function performConsentEdit(params: {
  readonly purpose: ConsentPurpose;
  readonly granted: boolean;
  readonly deps: ConsentActionDeps;
}): Promise<ConsentEditOutcome> {
  const { purpose, granted, deps } = params;
  if (!deps.isOnline()) return { status: 'offline' };

  await deps.queryClient.cancelQueries({ queryKey: CONSENTS_QUERY_KEY });
  const snapshot = deps.queryClient.getQueryData<GrantedConsents>(CONSENTS_QUERY_KEY);
  const affected = (granted ? chainOf(purpose) : [purpose]).filter((candidate) => (snapshot ?? []).includes(candidate) !== granted);
  if (snapshot !== undefined) deps.queryClient.setQueryData<GrantedConsents>(CONSENTS_QUERY_KEY, withPurposes(snapshot, affected, granted));

  const result = await deps.transport.request<unknown>({
    method: 'PUT',
    path: meEndpoints.consentsByPurpose(purpose),
    body: { granted, policyVersion: CONSENT_POLICY_VERSION_DEFAULT },
  });
  if (result.ok) return { status: 'saved' };

  const current = deps.queryClient.getQueryData<GrantedConsents>(CONSENTS_QUERY_KEY);
  if (snapshot !== undefined && current !== undefined) {
    deps.queryClient.setQueryData<GrantedConsents>(CONSENTS_QUERY_KEY, withPurposes(current, affected, !granted));
  }
  return { status: 'refused', error: result.error };
}
