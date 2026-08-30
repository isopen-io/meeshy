/**
 * Débit des trois routes unifiées de préférences — par COMPTE, jamais par IP.
 *
 * ## Pourquoi ces routes ont besoin d'un limiteur à elles
 *
 * `PUT` et `PATCH /me/preferences/{catégorie}` n'en avaient AUCUN. Le seul seau
 * qui s'appliquait était le limiteur global (`middleware/rate-limiter.ts`,
 * 300 req/min, clé `global:${request.ip}`) — un seau posé sur l'ADRESSE, donc
 * partagé par tous les comptes derrière une même sortie NAT, et longtemps
 * partagé par la plateforme entière (`request.ip` valait l'adresse du conteneur
 * Traefik avant que #4137 ne pose `trustProxy`). Un compte pouvait donc écrire
 * ses préférences sans limite propre, et un seul saturateur faisait répondre 429
 * à tous les autres. Trois seaux par compte remplacent cela :
 *
 * | usage    | seuil    | pourquoi ce seuil |
 * |----------|----------|-------------------|
 * | `read`   | 300/min  | un écran de réglages relit à chaque retour ; `If-None-Match` rend 304 sans corps, la lecture doit rester quasi gratuite |
 * | `write`  | 120/min  | 2/s : un interrupteur basculé au doigt, pas une boucle |
 * | `reset`  | 20/min   | une remise à zéro est un geste rare et DESTRUCTEUR |
 *
 * ## `hook: 'preHandler'` — le détail sans lequel la clé serait l'adresse
 *
 * `@fastify/rate-limit` accroche son handler en `onRequest` par DÉFAUT, et
 * l'authentification de ce module est un hook `preHandler`
 * (`index.ts` → `createUnifiedAuthMiddleware`). En laissant le défaut, le
 * limiteur s'exécuterait AVANT elle : `request.auth` serait `undefined`, le
 * repli sur l'adresse s'appliquerait à CHAQUE requête, et une configuration qui
 * dit « par compte » compterait en réalité par adresse — un limiteur qui ment
 * sur ce qu'il compte, ce qui est pire qu'un limiteur absent puisqu'il a l'air
 * posé. Fastify compose les hooks d'INSTANCE avant les hooks de ROUTE
 * (`fastify/lib/route.js` : `this[kHooks][hook].concat(opts[hook] || [])`) :
 * demander `preHandler` place donc le limiteur derrière l'authentification, où
 * l'appelant est connu.
 *
 * Le repli, quand l'identité manque malgré tout, n'est PAS l'adresse : c'est un
 * seau unique `anonymous`. Une requête sans compte sur ces routes rend 401 de
 * toute façon ; lui donner un seau par adresse ne protégerait rien et
 * rouvrirait exactement le partage que ce module ferme. L'axe « une adresse qui
 * inonde » reste couvert par le limiteur global, qui est fait pour lui.
 */

import type { FastifyRequest } from 'fastify';
import type { UnifiedAuthRequest } from '../../../middleware/auth';

export type PreferenceRateLimitUsage = 'read' | 'write' | 'reset';

const USAGE_LIMITS: Readonly<Record<PreferenceRateLimitUsage, number>> = {
  read: 300,
  write: 120,
  reset: 20,
};

/** L'appelant, tel que l'authentification l'a posé — les deux noms qu'elle écrit. */
function accountOf(request: FastifyRequest): string | undefined {
  const unified = request as UnifiedAuthRequest;
  return unified.authContext?.userId ?? (request as { auth?: { userId?: string } }).auth?.userId;
}

/**
 * Configuration `config.rateLimit` d'une route de préférences.
 *
 * Rendue par une fonction et non écrite en ligne : le seuil, la clé et la phase
 * doivent rester SOLIDAIRES. Les trois séparés, on retrouve la faute que ce
 * module documente — un seuil juste sur une clé fausse.
 */
export function createPreferenceRateLimitConfig(usage: PreferenceRateLimitUsage): {
  readonly max: number;
  readonly timeWindow: string;
  readonly hook: 'preHandler';
  readonly keyGenerator: (request: FastifyRequest) => string;
  readonly errorResponseBuilder: () => object;
} {
  return {
    max: USAGE_LIMITS[usage],
    timeWindow: '1 minute',
    hook: 'preHandler',
    keyGenerator: (request: FastifyRequest) =>
      `preferences:${usage}:${accountOf(request) ?? 'anonymous'}`,
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de requetes (preferences/${usage}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}
