import * as z from 'zod/mini';

import type { OnboardingDeps } from './onboarding';

/**
 * **LA DÉCLARATION DE L'ÂGE** (#9928, contrat #9927) — `PUT
 * /api/v1/me/birth-date` `{ birthDate: 'AAAA-MM-JJ' }`, écrite UNE fois.
 *
 * La passerelle seule calcule la classe d'âge : ce port ne compare aucune
 * date, il rend ce que le serveur a tranché. Les refus nommés deviennent des
 * issues que l'écran sait dire — `409` (déjà posée) vaut une étape faite,
 * `422` (moins de 13 ans) ferme le compte, `404` (passerelle antérieure à la
 * route) ne bloque rien.
 *
 * Le chemin vit ici tant que `@meeshy/shared/api/endpoints/me` ne le déclare
 * pas : le lot passerelle (#9927) porte le fichier partagé, ce lot ne l'écrit
 * pas.
 */
export const BIRTH_DATE_PATH = '/api/v1/me/birth-date';

export type BirthDateOutcome =
  | { readonly kind: 'saved'; readonly minorGlobal: boolean }
  | { readonly kind: 'already-set' }
  | { readonly kind: 'below-minimum' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unsupported' }
  | { readonly kind: 'failed'; readonly offline: boolean };

const Served = z.object({ viewerWriteRestrictionGlobal: z.optional(z.boolean()) });

export async function declareBirthDate(deps: OnboardingDeps, birthDate: string): Promise<BirthDateOutcome> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { kind: 'saved', minorGlobal: false };
  const result = await deps.transport.request<unknown>({ method: 'PUT', path: BIRTH_DATE_PATH, body: { birthDate } });
  if (result.ok) {
    const parsed = Served.safeParse(result.data);
    return { kind: 'saved', minorGlobal: parsed.success && parsed.data.viewerWriteRestrictionGlobal === true };
  }
  if (result.status === 409 || result.code === 'BIRTH_DATE_ALREADY_SET') return { kind: 'already-set' };
  if (result.status === 422 || result.code === 'AGE_BELOW_MINIMUM') return { kind: 'below-minimum' };
  if (result.status === 400) return { kind: 'invalid' };
  if (result.status === 404) return { kind: 'unsupported' };
  return { kind: 'failed', offline: result.status === 0 };
}
