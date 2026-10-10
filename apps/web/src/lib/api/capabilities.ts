/**
 * **LES CAPACITÉS QUE CE CLIENT DÉCLARE** (#9928) — la passerelle ne sert une
 * forme nouvelle qu'au client qui sait la lire : un ancien client, qui
 * n'envoie pas l'en-tête, garde l'ancienne forme (rétrocompatibilité,
 * #9223). `onboarding-age` : l'étape `age` et `viewerWriteRestriction` de
 * `GET`/`PATCH me.onboarding` (passerelle #9927, PR #9940).
 *
 * L'en-tête part avec les seuls appels qui en dépendent (`onboarding.ts`),
 * jamais par le transport commun : posé là, ses octets entraient dans la
 * première peinture (`budgets.json › first_paint`, plafond atteint). Une
 * capacité de plus s'ajoute à cette liste ; le port qui la consomme pose
 * `capabilitiesHeaders()`. `@fastify/cors`, sans liste `allowedHeaders`,
 * reflète les en-têtes demandés au contrôle préalable.
 */
export const CAPABILITIES_HEADER = 'X-Meeshy-Capabilities';

export const CLIENT_CAPABILITIES = ['onboarding-age'] as const;

export const capabilitiesHeaderValue = (capabilities: readonly string[] = CLIENT_CAPABILITIES): string => capabilities.join(',');

export const capabilitiesHeaders = (): Readonly<Record<string, string>> => ({ [CAPABILITIES_HEADER]: capabilitiesHeaderValue() });
