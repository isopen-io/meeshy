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
 *
 * ## `skipOnError: true` — le sens de l'échec, ÉCRIT (#4687)
 *
 * Cette ligne ne change RIEN au comportement : elle rend explicite ce que ce
 * module héritait déjà en silence. `registerGlobalRateLimiter`
 * (`middleware/rate-limiter.ts`, monté par `server.ts`) enregistre le plugin
 * avec `skipOnError: true`, et `mergeParams` (`Object.assign`,
 * @fastify/rate-limit `index.js:190`) étale cette valeur dans toute config de
 * route qui se tait. Le piège est que le DÉFAUT DU PLUGIN, lui, vaut `false`
 * (`index.js:138`) : qui vérifie « et si je ne déclare rien ? » dans la
 * dépendance lit *fail-closed* et conclut que l'omission est prudente. Elle
 * l'est ici à l'envers.
 *
 * Les deux côtés sont des EXTRÊMES, et il faut le dire avant de choisir : une
 * route qui déclare `config.rateLimit` perd le limiteur global — `onRoute`
 * (`index.js:174`) monte le sien À LA PLACE, jamais en plus. Fail-open veut
 * donc dire « plus aucun plafond sur ces trois routes », et fail-closed « 500
 * sur CHAQUE requête », pas seulement sur celles qui dépassent : l'erreur du
 * magasin est relancée avant tout verdict (`index.js:301`).
 *
 * Le côté OUVERT est retenu, pour ce que les trois routes FONT :
 *
 * - `read` (300/min) est la lecture d'un écran de réglages. Lui répondre 500
 *   pendant une panne Redis fabrique la panne que le produit s'interdit
 *   (« cache-first, jamais de spinner sur un cache non vide ») sur la moitié
 *   la plus sollicitée du module — un plafond de 300/min est fait pour
 *   n'attraper personne.
 * - `write` (120/min) `PATCH` des préférences sur la ligne `User` de
 *   L'APPELANT. Rien n'est créé, rien ne part vers un tiers, rien ne grossit :
 *   une rafale ne fait que réécrire les valeurs de son auteur.
 * - `reset` (20/min) est destructeur mais IDEMPOTENT et tout aussi
 *   auto-adressé — remettre deux fois à zéro rend le même état.
 *
 * Aucune des trois ne laisse quoi que ce soit derrière elle qu'une panne du
 * compteur rendrait irrattrapable. C'est le critère : on ferme quand le côté
 * ouvert fabrique quelque chose que le produit ne peut pas reprendre (une
 * ligne créée sans plafond, un envoi vers un tiers) ; on ouvre quand il ne
 * laisse à un compte que le droit de brasser son propre état. Le jour où une
 * de ces routes se met à CRÉER des lignes, ce choix se repèse — c'est
 * exactement la distinction que `categories.ts` porte, label par label.
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
  readonly skipOnError: true;
  readonly keyGenerator: (request: FastifyRequest) => string;
  readonly errorResponseBuilder: () => object;
} {
  return {
    max: USAGE_LIMITS[usage],
    timeWindow: '1 minute',
    hook: 'preHandler',
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) =>
      `preferences:${usage}:${accountOf(request) ?? 'anonymous'}`,
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de requetes (preferences/${usage}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}
