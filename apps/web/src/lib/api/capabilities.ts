/**
 * **LES CAPACITÉS QUE CE CLIENT DÉCLARE** (#9928) — la passerelle ne sert une
 * forme nouvelle qu'au client qui sait la lire : un ancien client, qui
 * n'envoie pas l'en-tête, garde l'ancienne forme (rétrocompatibilité,
 * #9223). `onboarding-age` : l'étape `age` et `viewerWriteRestriction` de
 * `GET`/`PATCH /me/onboarding` (passerelle #9927, PR #9940).
 *
 * Le transport commun (`http.ts`) pose l'en-tête sur CHAQUE appel : une
 * capacité de plus s'ajoute ici, jamais à un site d'appel. `@fastify/cors`,
 * sans liste `allowedHeaders`, reflète les en-têtes demandés au contrôle
 * préalable — comme pour `X-Device-Locale`.
 */
export const CAPABILITIES_HEADER = 'X-Meeshy-Capabilities';

export const CLIENT_CAPABILITIES = ['onboarding-age'] as const;

export const capabilitiesHeaderValue = (capabilities: readonly string[] = CLIENT_CAPABILITIES): string => capabilities.join(',');
