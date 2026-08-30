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
 * Le nombre de maillons s'exprime par une FONCTION, pas par un entier.
 *
 * `trustProxy: 3` est pourtant la forme naturelle, et Fastify la supporte au
 * runtime. Mais son TYPE a cessé de déclarer `number` en 5.12 — la déclaration
 * y est `boolean | string | string[] | TrustProxyFunction`. Le passer casse
 * alors la compilation, et pas seulement sur la ligne fautive : TypeScript ne
 * choisit plus la surcharge de `fastify()` (TS2769) et fait ensuite échouer le
 * cast `as FastifyInstance` des deux constructions de `server.ts` (TS2352).
 *
 * Le piège est qu'il ne se voit pas partout : plusieurs versions de Fastify
 * cohabitent dans le magasin local (5.8, 5.10, 5.11 déclarent encore `number`),
 * si bien que la compilation locale passait pendant que l'image Docker, qui
 * résout `^5.12.1` proprement, échouait.
 *
 * `TrustProxyFunction` est acceptée par TOUTES les versions et dit exactement
 * la même chose : `hop` est l'index du maillon depuis le serveur (0 = le proxy
 * le plus proche), donc « faire confiance aux n derniers » s'écrit `hop < n`.
 */
export type TrustProxySetting = boolean | ((address: string, hop: number) => boolean);

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
  const hops = resolveTrustedHops(raw);
  return hops === 0 ? NO_PROXY : trustUpToHops(hops);
}

/**
 * Le nombre de maillons de confiance, en clair — c'est LUI que les témoins
 * exercent. `resolveTrustProxy` n'en est que la mise en forme pour Fastify :
 * une fonction ne se compare pas, donc un témoin posé sur elle ne pourrait
 * attester ni le défaut, ni le plafond, ni le refus de `true`.
 */
export function resolveTrustedHops(
  raw: string | undefined = process.env.TRUST_PROXY_HOPS
): number {
  if (raw === undefined || raw.trim() === '') return DEFAULT_HOPS;

  const normalized = raw.trim().toLowerCase();
  if (normalized === 'false' || normalized === 'none' || normalized === '0') return 0;

  const hops = Number(normalized);
  if (!Number.isInteger(hops) || hops < 0) return DEFAULT_HOPS;
  if (hops > MAX_REASONABLE_HOPS) return MAX_REASONABLE_HOPS;

  return hops;
}

/**
 * « Faire confiance aux `hops` maillons les plus proches du serveur. »
 *
 * `hop` est l'index depuis le serveur : 0 est le proxy immédiat — le nôtre —
 * et les valeurs croissantes remontent vers le client, donc vers ce qu'un
 * appelant peut écrire lui-même dans `X-Forwarded-For`. Rendre `false` au-delà
 * du seuil est ce qui empêche l'appelant de choisir l'adresse qu'on lui
 * attribue.
 */
function trustUpToHops(hops: number): (address: string, hop: number) => boolean {
  return (_address: string, hop: number) => hop < hops;
}
