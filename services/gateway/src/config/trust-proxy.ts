/**
 * Combien de mandataires (« proxies ») séparent le gateway de son appelant.
 *
 * Sans cette option, Fastify lit `request.ip` sur la socket TCP — c'est-à-dire,
 * en production, l'adresse du conteneur Traefik sur le réseau Docker
 * (`172.16.0.0/12`), IDENTIQUE pour tous les appelants. Toute limitation « par
 * IP », tout journal d'accès et toute décision géographique portaient donc sur
 * une seule et même adresse (#4137).
 *
 * Pourquoi un NOMBRE plutôt que `true` : `trustProxy: true` fait confiance à la
 * chaîne `X-Forwarded-For` ENTIÈRE, que n'importe quel client peut préfixer —
 * l'appelant choisit alors l'adresse qu'on lui attribue, ce qui rend la
 * limitation contournable d'un en-tête. Un nombre `n` compte depuis la DROITE :
 * on ne fait confiance qu'aux `n` derniers maillons, ceux que notre propre
 * infrastructure a ajoutés. Un client peut mentir sur la gauche de la chaîne,
 * jamais sur le maillon posé par notre proxy.
 *
 * Le défaut est 1 : un seul mandataire, Traefik. Si un CDN vient s'ajouter
 * devant, poser `TRUST_PROXY_HOPS=2` — et pas davantage, chaque maillon de plus
 * étant un maillon dont on cesse de vérifier l'origine.
 */

/** Un déploiement sans mandataire (test, exécution directe) ne fait confiance à personne. */
export const NO_PROXY = false;

/**
 * `boolean | number`, et non `number | false`.
 *
 * L'union avec le littéral `false` empêche TypeScript de choisir la surcharge
 * de `fastify()` (TS2769), et fait ensuite échouer le cast `as FastifyInstance`
 * que `server.ts` applique aux deux constructions (TS2352). Le type large est
 * exactement celui que Fastify déclare pour cette option ; le fait que nous ne
 * rendions jamais `true` est une propriété de `resolveTrustProxy`, garantie par
 * ses témoins, pas quelque chose que le type doive porter.
 */
export type TrustProxySetting = boolean | number;

const DEFAULT_HOPS = 1;
const MAX_REASONABLE_HOPS = 4;

/**
 * Rend la valeur à passer à `fastify({ trustProxy })`.
 *
 * Toute entrée illisible retombe sur le défaut plutôt que sur `true` : se
 * tromper vers « je fais confiance à moins de maillons » ne fait que rendre la
 * limitation plus stricte, alors que l'inverse la rend contournable.
 */
export function resolveTrustProxy(
  raw: string | undefined = process.env.TRUST_PROXY_HOPS
): TrustProxySetting {
  if (raw === undefined || raw.trim() === '') return DEFAULT_HOPS;

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'false' || normalized === 'none' || normalized === '0') return NO_PROXY;

  const hops = Number(normalized);
  if (!Number.isInteger(hops) || hops < 0) return DEFAULT_HOPS;
  if (hops > MAX_REASONABLE_HOPS) return MAX_REASONABLE_HOPS;

  return hops === 0 ? NO_PROXY : hops;
}
