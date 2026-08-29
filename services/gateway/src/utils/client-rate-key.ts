import type { FastifyRequest } from 'fastify';

/**
 * La clé de débit d'un appelant NON authentifié.
 *
 * ## Pourquoi `request.ip`, et surtout pourquoi PAS les en-têtes
 *
 * Le dépôt contient `extractIpFromRequest` (`services/GeoIPService.ts:64`), qui
 * lit `cf-connecting-ip` → `x-real-ip` → premier saut de `x-forwarded-for` →
 * `request.ip`. Elle est juste pour son usage — la GÉOLOCALISATION, où se
 * tromper coûte un drapeau de pays — et serait un **contresens** ici.
 *
 * Ces en-têtes sont écrits par l'APPELANT. Les prendre pour clé de débit
 * laisserait n'importe qui choisir son propre seau : un en-tête différent à
 * chaque requête, et le limiteur ne compte plus rien. C'est précisément le
 * contournement que #4137 vient de fermer.
 *
 * Depuis #4137, `request.ip` est la valeur RÉSOLUE par Fastify sous
 * `trustProxy`, borné par `TRUST_PROXY_HOPS` : il ne fait confiance qu'aux `n`
 * derniers maillons de `X-Forwarded-For`, ceux que notre propre infrastructure
 * a posés. Un client peut mentir sur la gauche de la chaîne, jamais sur le
 * maillon de notre proxy.
 *
 * > La note de #4158 demandait d'adosser cette clé à `extractIpFromRequest`.
 * > Elle a été écrite quand le gateway tournait **sans** `trustProxy`, où
 * > `request.ip` valait l'adresse du conteneur Traefik pour tout le monde et où
 * > lire les en-têtes était le moindre mal. Ce n'est plus vrai : suivre ce
 * > critère à la lettre rouvrirait le trou.
 */
export function clientRateKey(request: FastifyRequest): string {
  return `ip:${request.ip}`;
}

/**
 * La clé d'un appelant, authentifié ou non.
 *
 * Un compte connecté se compte sur SON identifiant : deux personnes derrière la
 * même sortie NAT ne doivent pas se gêner, et une même personne ne doit pas
 * multiplier ses quotas en changeant de réseau.
 */
export function callerRateKey(request: FastifyRequest): string {
  const userId = (request as { authContext?: { userId?: string } }).authContext?.userId;
  return userId ? `user:${userId}` : clientRateKey(request);
}
