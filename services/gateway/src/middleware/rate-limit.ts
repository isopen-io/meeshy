/**
 * Rate Limiting Middleware - Protects REST endpoints from DoS attacks
 *
 * CVE-002 Fix: Implements configurable rate limiting using @fastify/rate-limit
 * to prevent denial-of-service attacks via excessive requests
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { logger } from '../utils/logger.js';
import { UnifiedAuthRequest } from './auth';

/**
 * Rate limit configuration per endpoint
 */
export const RATE_LIMITS = {
  // Call initiation - strict limit to prevent spam
  INITIATE_CALL: {
    max: 5,
    timeWindow: '1 minute',
    description: 'POST /api/calls'
  },

  // Join call - moderate limit
  JOIN_CALL: {
    max: 20,
    timeWindow: '1 minute',
    description: 'GET /api/calls/:callId, POST /api/calls/:callId/participants'
  },

  // General call operations
  CALL_OPERATIONS: {
    max: 10,
    timeWindow: '1 minute',
    description: 'Other call-related endpoints'
  },

  // Default for all other endpoints
  DEFAULT: {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000')
  }
};

/**
 * Register global rate limiting plugin
 *
 * @param fastify - Fastify instance
 */
export async function registerRateLimiting(fastify: FastifyInstance): Promise<void> {
  // Check if rate limiting is enabled
  const isEnabled = process.env.ENABLE_RATE_LIMITING !== 'false';

  if (!isEnabled) {
    logger.warn('⚠️ Rate limiting is DISABLED - not recommended for production');
    return;
  }

  // Register rate limit plugin with Redis for distributed rate limiting
  await fastify.register(rateLimit, {
    global: true,
    max: RATE_LIMITS.DEFAULT.max,
    timeWindow: RATE_LIMITS.DEFAULT.timeWindow,
    cache: 10000,
    // Pas d'`allowList` fondée sur la forme de l'adresse. Elle valait
    // `(req) => isLocalIp(req.ip)`, ce qui, derrière Traefik sur un réseau
    // Docker (`request.ip` en 172.16.0.0/12 pour tout le monde), exemptait la
    // planète entière. Cette fonction n'est aujourd'hui montée nulle part —
    // raison de plus pour ne pas y laisser le piège en attendant : la remonter
    // telle quelle aurait rouvert le défaut de #4137 sans qu'aucun témoin ne
    // rougisse.
    redis: fastify.redis ?? undefined, // Use Redis for distributed rate limiting (if available)
    skipOnError: true, // Don't block requests if Redis is down
    // Ce générateur ANNONCE une clé par compte et rend TOUJOURS l'adresse : au
    // niveau du PLUGIN, il s'évalue au hook `onRequest` — avant toute garde de
    // route — donc `authContext` n'existe jamais encore. C'est SANS
    // CONSÉQUENCE ici, `registerRateLimiting` n'étant montée nulle part
    // (mesuré) et un limiteur global devant de toute façon compter par
    // adresse : il doit aussi freiner les flots NON authentifiés, qui
    // n'atteignent jamais un `preHandler`. C'est le raisonnement écrit par
    // `registerGlobalRateLimiter` (`rate-limiter.ts`), le seul des deux qui
    // soit monté.
    //
    // Ce qui n'est PAS sans conséquence, c'est de laisser la branche
    // `if (userId)` se lire comme un patron : c'est elle, recopiée sous
    // `config.rateLimit`, qui a produit le défaut de `createRateLimitConfig`
    // ci-dessous et ses jumeaux. Une clé de route se compte par compte, et
    // exige alors `hook: 'preHandler'`. Cliquet :
    // `__tests__/unit/middleware/account-keyed-rate-limit-sweep.test.ts`.
    keyGenerator: (request) => {
      const userId = (request as UnifiedAuthRequest).authContext?.userId;
      if (userId) {
        return `user:${userId}`;
      }
      return request.ip || 'unknown';
    },
    errorResponseBuilder: (request, context) => {
      logger.warn('Rate limit exceeded', {
        ip: request.ip,
        userId: (request as UnifiedAuthRequest).authContext?.userId,
        path: request.url,
        limit: context.max,
        after: context.after
      });

      return {
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests. Please try again after ${context.after}`,
          retryAfter: context.after
        }
      };
    },
    onExceeding: (request, key) => {
      logger.debug('Rate limit warning', {
        key,
        ip: request.ip,
        path: request.url
      });
    }
  });

  logger.info('✅ Rate limiting enabled', {
    defaultMax: RATE_LIMITS.DEFAULT.max,
    defaultWindow: RATE_LIMITS.DEFAULT.timeWindow,
    redisEnabled: !!fastify.redis
  });
}

/**
 * `userId` SENTINELLE de `createUnauthenticatedContext()` (`middleware/auth.ts`).
 *
 * Un visiteur sans justificatif reçoit un `authContext` COMPLET dont le
 * `userId` vaut la chaîne `'anonymous'` — une valeur VRAIE. Un générateur qui
 * se contente de `userId ?? repli` la prend donc pour un compte et range TOUS
 * les visiteurs de la planète dans UN seul seau : le premier arrivé refuse
 * tous les autres. Aucune route d'appel ne peut l'atteindre aujourd'hui
 * (`requiredAuth` y répond 401 avant de poser le contexte, cf. `resolveCallerKey`),
 * mais cette fabrique est EXPORTÉE : le piège se refermerait sur le premier
 * montage qui admettrait les visiteurs.
 */
const VISITEUR_SANS_COMPTE = 'anonymous';

/**
 * Identité de débit de l'appelant, avec des préfixes DISJOINTS par population.
 *
 * `acct:` et `ip:` ne peuvent pas se confondre : sans préfixe côté compte, une
 * population dont l'identifiant ressemblerait à l'autre partagerait son seau.
 * Deux espaces de noms, deux préfixes — la règle tient quelle que soit la
 * forme des identifiants.
 */
function resolveCallerKey(request: FastifyRequest): string {
  const userId = (request as UnifiedAuthRequest).authContext?.userId;
  if (userId && userId !== VISITEUR_SANS_COMPTE) {
    return `acct:${userId}`;
  }
  return `ip:${request.ip}`;
}

/**
 * Sens de l'échec quand le MAGASIN de compteurs tombe (Redis indisponible).
 *
 * Mesuré sur le plugin réel : `skipOnError: false` laisse l'erreur du magasin
 * remonter, donc un **500** — jamais un 429 lisible ; `true` laisse passer la
 * requête. Le choix n'est donc pas « strict ou laxiste » mais « quel dommage
 * on préfère pendant la panne ».
 */
type SensDeLEchec = 'ferme' | 'ouvert';

/**
 * Limiteur d'une route d'appel.
 *
 * ## La clé compte le COMPTE — et il a fallu poser le hook pour ça
 *
 * `config.rateLimit` s'applique par défaut au hook `onRequest`
 * (`defaultHook`, @fastify/rate-limit/index.js), qui court AVANT le
 * `preValidation` où `requiredAuth` (`routes/calls.ts`) pose `authContext`.
 * Un `keyGenerator` qui lit `authContext?.userId` y recevait donc
 * `undefined` et retombait sur `ip:${request.ip}` — non pas dans un cas
 * limite, mais À CHAQUE APPEL : la clé « par utilisateur » que le
 * commentaire d'origine annonçait n'a jamais été calculée une seule fois.
 * `hook: 'preHandler'` referme le trou. Mesuré sur le vrai plugin, pas
 * déduit : deux comptes, même adresse, `initiate` — sans hook le second est
 * refusé dès son premier appel parce que le premier a vidé le seau de
 * l'ADRESSE qu'ils partagent ; avec le hook, chacun dispose de son crédit.
 *
 * Ce doc-comment affirmait « même pattern que
 * `createPostRouteRateLimitConfig` / `createSoundRouteRateLimitConfig` /
 * `createSignalProtocolRateLimitConfig` » en NOMMANT ses trois jumelles.
 * C'était faux, et c'est ce qui a tenu ce fichier hors de #4347 : les trois
 * jumelles posent le hook (`GARDES_DE_CLE`, `middleware/rate-limiter.ts`),
 * celle-ci ne l'a jamais posé. Un commentaire qui énonce un invariant de
 * PAIRE ne garde que l'exemplaire qui le porte — et rend l'autre CRÉDIBLE.
 *
 * ## La population servie : des comptes, rien d'autre
 *
 * Les neuf routes de `routes/calls.ts` montent toutes
 * `preValidation: [requiredAuth, …]`, où `requiredAuth` vaut
 * `createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false })` :
 * un visiteur sans justificatif reçoit 401, un invité de lien partagé
 * (`Participant`) reçoit 403. Aucune de ces routes n'admet d'anonyme, donc
 * la clé est le COMPTE sans arbitrage — le repli `ip:` de `resolveCallerKey`
 * n'y est jamais atteint et n'est conservé que comme défense du montage
 * suivant.
 *
 * ## Ce que le déplacement du hook CÈDE, et pourquoi c'est le bon échange
 *
 * Au `preHandler`, le limiteur ne voit plus que les requêtes qui ont franchi
 * `preValidation` : une rafale de jetons invalides (401) ou de corps malformés
 * (400) ne consomme plus le plafond de `calls:*`. Ce n'est pas une perte de
 * protection mais un DÉPLACEMENT — ces requêtes-là n'ont pas de compte à
 * facturer, et c'est le limiteur global (`registerGlobalRateLimiter`, 300/min
 * par adresse, resté à `onRequest` précisément pour ça) qui les freine. Le
 * plafond par route retrouve en échange son objet : borner ce qu'un COMPTE
 * demande, sans qu'un voisin de NAT le lui prenne.
 *
 * ## Le refus se lit 429, et il fallait le DIRE
 *
 * Le plugin `throw`e ce que rend `errorResponseBuilder`
 * (`rateLimitRequestHandler`) ; Fastify lit `statusCode` sur l'objet lancé
 * pour choisir le statut. Sans ce champ, chaque refus de débit des neuf
 * routes d'appels répondait **500** : le client ne pouvait pas distinguer
 * « ralentis » de « le serveur est cassé », et la supervision comptait des
 * pannes serveur là où le produit se défendait normalement. Les fabriques
 * de `middleware/rate-limiter.ts` portent toutes `statusCode: 429` ; c'est
 * encore une parité que le commentaire revendiquait sans que le code la
 * tienne.
 *
 * @param max - plafond de requêtes sur la fenêtre
 * @param timeWindow - fenêtre, en ms ou en toutes lettres ('1 minute')
 * @param label - espace de noms du seau (deux routes ne se mélangent jamais)
 * @param sensDeLEchec - que faire quand le magasin de compteurs est en panne.
 *   Défaut FERMÉ : un montage qui ne se prononce pas obtient le côté
 *   prudent, et doit écrire son choix pour obtenir l'autre.
 */
export function createRateLimitConfig(
  max: number,
  timeWindow: number | string,
  label: string,
  sensDeLEchec: SensDeLEchec = 'ferme'
) {
  return {
    config: {
      rateLimit: {
        max,
        timeWindow,
        hook: 'preHandler' as const,
        skipOnError: sensDeLEchec === 'ouvert',
        keyGenerator: (request: FastifyRequest) => `calls:${label}:${resolveCallerKey(request)}`,
        errorResponseBuilder: () => ({
          success: false,
          statusCode: 429,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests (calls/${label}). Please try again later.`
          }
        })
      }
    }
  };
}

/**
 * Les trois limiteurs de la surface d'appels, chacun avec le sens d'échec
 * qu'il ASSUME — plus la valeur globale héritée en silence.
 *
 * `registerGlobalRateLimiter` (`middleware/rate-limiter.ts`, monté en
 * `server.ts`) pose `skipOnError: true`, qu'@fastify/rate-limit fusionne par
 * `Object.assign` (`mergeParams`) dans toute config de route qui ne le
 * redéclare pas. Les trois entrées ci-dessous héritaient donc du côté ouvert
 * sans que personne l'ait décidé. Elles le DÉCLARENT désormais, ce qui ne
 * change pas le comportement mais change ce qu'on peut en dire — et fait
 * rougir un témoin le jour où quelqu'un l'inverse sans y penser.
 *
 * Le domaine des appels échoue OUVERT, sur les trois labels (#4334, critère 2 :
 * « fail-open assumé là où la disponibilité prime — sons, appels ») :
 * `operations` couvre RACCROCHER (`DELETE /calls/:callId`), QUITTER
 * (`DELETE /calls/:callId/participants`) et lire l'appel en cours ; `join`
 * couvre le rejoindre. Les refuser pendant une panne Redis n'économiserait
 * rien et ENFERMERAIT l'utilisateur dans un appel qu'il ne peut plus
 * quitter — au prix d'un 500, en plus. Le plafond protège d'un abus ; ici
 * l'échec fermé fabriquerait la panne qu'il prétend contenir.
 *
 * `initiate` est le seul des trois dont l'action porte hors du produit (elle
 * fait SONNER l'appareil de chaque participant), donc le seul pour lequel le
 * côté fermé se plaide. Il reste OUVERT ici, comme le critère l'écrit, parce
 * que le fermer tuerait toute émission d'appel pendant une panne Redis — un
 * dommage certain et total contre un abus hypothétique et borné par
 * l'autorisation de conversation vérifiée dans le handler. Inverser ce choix
 * est une décision produit, pas un correctif : elle se prend dans une issue,
 * pas dans ce fichier.
 */
export const ROUTE_RATE_LIMITS = {
  initiateCall: createRateLimitConfig(
    RATE_LIMITS.INITIATE_CALL.max,
    RATE_LIMITS.INITIATE_CALL.timeWindow,
    'initiate',
    'ouvert'
  ),
  joinCall: createRateLimitConfig(
    RATE_LIMITS.JOIN_CALL.max,
    RATE_LIMITS.JOIN_CALL.timeWindow,
    'join',
    'ouvert'
  ),
  callOperations: createRateLimitConfig(
    RATE_LIMITS.CALL_OPERATIONS.max,
    RATE_LIMITS.CALL_OPERATIONS.timeWindow,
    'operations',
    'ouvert'
  )
};
