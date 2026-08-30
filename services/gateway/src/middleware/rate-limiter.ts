/**
 * Rate Limiting Middleware for Meeshy Gateway
 *
 * Protects against:
 * - Message spam (max 20 messages/minute)
 * - Mention abuse (max 50 mentions/message, max 5 mentions/minute per recipient)
 * - API abuse (max 300 requests/minute)
 */

import { apiPath } from '@meeshy/shared/api/prefix';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { UnifiedAuthRequest } from './auth';
import { getCacheStore } from '../services/CacheStore';

/**
 * Rate limiter pour les messages
 * Max 20 messages par minute par utilisateur
 */
export async function registerMessageRateLimiter(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    max: 20,
    timeWindow: '1 minute',
    // RedisStore natif du plugin via l'option `redis`. NE PAS passer une
    // instance à `store` : @fastify/rate-limit fait `new Store(opts)` dessus
    // (index.js) → `new <instance>()` crashe au boot dès que Redis est présent
    // (ex. staging ; en dev sans Redis `makeRedisStore` renvoyait undefined,
    // donc ça ne pétait pas). `skipOnError: true` = fail-open (Redis KO → on
    // laisse passer), comme l'ancien store custom.
    redis: getCacheStore().getNativeClient() ?? undefined,
    skipOnError: true,
    keyGenerator: (request: FastifyRequest) => {
      // Rate limit par utilisateur
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (authContext && authContext.userId) {
        return `msg:${authContext.userId}`;
      }
      // Fallback sur IP si pas d'auth
      return `msg:ip:${request.ip}`;
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: 'Trop de messages envoyés. Veuillez patienter avant de réessayer.',
        retryAfter: context.ttl,
        statusCode: 429
      };
    },
    // Ne pas ajouter les headers X-RateLimit-* dans la réponse
    addHeaders: {
      'x-ratelimit-limit': false,
      'x-ratelimit-remaining': false,
      'x-ratelimit-reset': false
    }
  });
}

/**
 * Rate limiter global pour toutes les routes API
 * Max 300 requêtes par minute par IP (augmenté pour permettre l'édition de liens)
 */
export async function registerGlobalRateLimiter(fastify: FastifyInstance) {
  await fastify.register(rateLimit, {
    global: true,
    max: 300, // Augmenté de 100 à 300 pour l'édition de liens
    timeWindow: '1 minute',
    // RedisStore natif via `redis` (cf. registerMessageRateLimiter). Passer une
    // instance à `store` crashait le boot en staging (plugin fait `new store()`).
    redis: getCacheStore().getNativeClient() ?? undefined,
    // `request.ip` porte l'adresse de l'APPELANT depuis #4137 (`trustProxy`,
    // cf. `config/trust-proxy.ts`). Avant cela, c'était l'adresse du conteneur
    // Traefik — identique pour tout le monde — et cette clé désignait donc UN
    // SEUL seau de 300 req/min pour la plateforme entière : elle ne freinait
    // personne individuellement, et un client qui la saturait faisait répondre
    // 429 à tous les autres.
    //
    // La clé reste l'adresse, et NON l'utilisateur, pour une raison d'ordre :
    // ce limiteur est un hook global posé par `setupMiddleware()`, qui s'exécute
    // AVANT les gardes d'authentification de chaque route — `authContext`
    // n'existe pas encore ici. Les limiteurs qui doivent compter par compte le
    // font au niveau de leur route (`createPostRouteRateLimitConfig` et ses
    // sœurs), là où l'appelant est connu.
    keyGenerator: (request: FastifyRequest) => {
      return `global:${request.ip}`;
    },
    // fail-open sur erreur Redis (availability) — alignement avec l'ancien
    // store custom qui laissait passer en cas d'erreur Redis.
    skipOnError: true,
    // `allowList`, PAS `skip` : @fastify/rate-limit v10 ne lit jamais `skip`
    // (index.js:88 et :225 — seul `allowList` existe). L'ancienne clause était
    // donc silencieusement ignorée, et les sondes subissaient le quota : un
    // flood faisait échouer `/health` et redémarrer le conteneur.
    //
    // Le test `isLocalIp` de cette clause N'A JAMAIS été repris, et ne doit pas
    // l'être : une exemption fondée sur la FORME d'une adresse n'a aucun sens
    // ici. Elle a d'ailleurs neutralisé les limiteurs d'authentification
    // pendant toute sa durée de vie (#4137, `utils/rate-limiter.ts`), pour
    // exactement la raison notée ici — `request.ip` était une adresse privée
    // `172.x` pour tout le monde. Depuis #4137, `trustProxy` rend l'adresse de
    // l'appelant ; la conclusion ne change pas pour autant : ce qui exempte
    // ici, ce sont des CHEMINS de sonde, jamais une plage d'adresses.
    allowList: (request: FastifyRequest) => {
      const path = request.url.split('?')[0];
      // `/api/v1/health/ready` rejoint les sondes exemptées (#4219), pour la
      // raison écrite au-dessus : un 429 sur une sonde de disponibilité fait
      // conclure « instance morte » et redémarrer le conteneur. L'exemption
      // n'ouvre pas d'amplificateur anonyme — le verdict est mémoïsé 2 s dans
      // `routes/health/index.ts`, donc une cadence infinie coûte un ping toutes
      // les 2 s, quoi qu'il arrive.
      return path === '/health' || path === '/healthz' || path === '/ready'
        || path === apiPath('/health/ready');
    },
    errorResponseBuilder: (request, context) => {
      return {
        success: false,
        error: 'Trop de requêtes. Veuillez réessayer plus tard.',
        retryAfter: context.ttl,
        statusCode: 429
      };
    }
  } as any); // Type cast pour contourner limitation typage @fastify/rate-limit
}

/**
 * Valide qu'un message ne contient pas trop de mentions
 * Max 50 mentions par message
 */
export function validateMentionCount(content: string): { valid: boolean; error?: string } {
  const MAX_MENTIONS_PER_MESSAGE = 50;

  // Extraire les mentions (tiret inclus : charset username /^[a-zA-Z0-9_-]+$/)
  const mentionMatches = content.match(/@([\w-]+)/g);
  const mentionCount = mentionMatches ? mentionMatches.length : 0;

  if (mentionCount > MAX_MENTIONS_PER_MESSAGE) {
    return {
      valid: false,
      error: `Trop de mentions (${mentionCount}/${MAX_MENTIONS_PER_MESSAGE}). Veuillez réduire le nombre de mentions.`
    };
  }

  return { valid: true };
}

/**
 * Hook pour valider le contenu du message avant traitement
 */
export async function messageValidationHook(
  request: FastifyRequest<{ Body: { content?: string } }>,
  reply: FastifyReply
) {
  const { content } = request.body;

  if (!content) {
    return; // Sera géré par la validation de route
  }

  // Valider le nombre de mentions
  const validation = validateMentionCount(content);
  if (!validation.valid) {
    return reply.status(400).send({
      success: false,
      error: validation.error
    });
  }
}

/**
 * Rate-limit configs pour les routes Posts/Stories.
 *
 * Avant : aucune limite par route → un utilisateur authentifie pouvait spammer
 * /posts (creation), /:id/like, /:id/view, /:id/comments via plusieurs sessions
 * en restant sous le plafond global de 300 req/min/IP. Plus important : chaque
 * creation de story declenche 10 requetes ZMQ vers le translator (1 par langue
 * cible hardcodee), donc 10 stories/min = 100 requetes ZMQ/min/utilisateur.
 *
 * Limites :
 * - POST /posts (create) : 10/min — un utilisateur normal poste rarement
 * - POST /posts/:id/like : 30/min — accommoder le toggle rapide
 * - POST /posts/:id/view : 60/min — un viewer parcourt vite plusieurs stories
 * - POST /posts/:id/comments : 20/min
 * - POST /posts/impressions/batch : 30/min — par lot de 50 OCCURRENCES max.
 *   Une impression est comptée par apparition à l'écran, donc un aller-retour
 *   de scroll produit plusieurs lots (le client les regroupe sur 3 s) ; 10/min
 *   déclenchait des 429 en usage normal.
 */
/**
 * Limiteur des portes de RECHERCHE de personnes (#4145).
 *
 * Ces routes sont la surface d'énumération du produit : elles répondent, sur un
 * fragment, par une liste de comptes. La clé est donc l'APPELANT (`userId`), et
 * non l'adresse — une clé IP seule laisse un compte unique moissonner depuis
 * autant d'adresses qu'il veut, et pénalise en prime les utilisateurs qui
 * partagent une sortie NAT.
 *
 * Le seuil par minute n'est PAS la garde principale : une moisson patiente
 * passe sous n'importe quel débit. Ce qui l'arrête est le plafond de lignes
 * servies (`limit ≤ 100` déjà appliqué par `validatePagination`) combiné à un
 * budget quotidien — ce dernier reste à poser, cf. #4158.
 */
/**
 * Ce que TOUTE fabrique de ce fichier pose, et pourquoi (#4347).
 *
 * `hook: 'preHandler'` — `config.rateLimit` s'applique par défaut au hook
 * `onRequest`, qui court AVANT `preValidation`, donc avant que `unifiedAuth`
 * ne pose `authContext`. Un `keyGenerator` qui lit `authContext?.userId` y
 * reçoit `undefined` et retombe SYSTÉMATIQUEMENT sur `ip:${request.ip}`, pour
 * un appelant authentifié comme pour un visiteur. Mesuré sur le vrai plugin
 * (`fastify.inject`), pas déduit : sans `hook`, le générateur voit
 * `authContext === undefined` ; avec `hook: 'preHandler'`, il voit le compte.
 *
 * Ce que ce repli coûte, exactement. Depuis #4137, `trustProxy` est posé
 * (`config/trust-proxy.ts`, un maillon par défaut), donc `request.ip` est
 * l'adresse RÉELLE de l'appelant — pas celle du conteneur Traefik. Un
 * plafond « par compte » silencieusement dégradé en « par adresse » n'est
 * donc pas un seau unique pour la plateforme ; il reste néanmoins faux dans
 * les DEUX sens : plusieurs comptes derrière une même sortie (opérateur
 * mobile, bureau, NAT) se partagent un crédit prévu pour un seul, et un même
 * compte disposant de plusieurs adresses en obtient autant de crédits. Une
 * limite par compte se compte par compte.
 *
 * Le repli `ip:` reste LÉGITIME là où l'appelant peut être anonyme — c'est
 * alors la seule identité disponible, et le déplacer au `preHandler` ne le
 * dégrade pas : il ne s'applique plus qu'aux requêtes réellement sans compte.
 *
 * `skipOnError: false` — `registerGlobalRateLimiter` pose `skipOnError: true`,
 * valeur GLOBALE qu'@fastify/rate-limit fusionne par `Object.assign` dans
 * toute config qui ne la redéclare pas. Un Redis indisponible ouvrait donc
 * ces limiteurs en grand : la panne du gardien devenait l'absence de garde.
 */
const GARDES_DE_CLE = { hook: 'preHandler' as const, skipOnError: false };

export function createDirectoryRouteRateLimitConfig(
  type: 'search' | 'resolve'
): object {
  const configs = {
    search: { max: 30, label: 'search' },
    resolve: { max: 20, label: 'resolve' },
  };
  const cfg = configs[type];
  return {
    max: cfg.max,
    timeWindow: '1 minute',
    ...GARDES_DE_CLE,
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const id = authContext?.userId ?? `ip:${request.ip}`;
      return `directory:${cfg.label}:${id}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de recherches (directory/${cfg.label}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}

export function createPostRouteRateLimitConfig(
  type: 'create' | 'like' | 'view' | 'comment' | 'impression' | 'engagement'
): object {
  const configs = {
    create: { max: 10, label: 'create' },
    like: { max: 30, label: 'like' },
    view: { max: 60, label: 'view' },
    comment: { max: 20, label: 'comment' },
    impression: { max: 30, label: 'impression' },
    engagement: { max: 20, label: 'engagement' },
  };
  const cfg = configs[type];
  return {
    max: cfg.max,
    timeWindow: '1 minute',
    ...GARDES_DE_CLE,
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const id = authContext?.userId ?? `ip:${request.ip}`;
      return `posts:${cfg.label}:${id}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de requetes (posts/${cfg.label}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}

/**
 * Limites par route de la bibliothèque de sons.
 *
 * Le `keyGenerator` EXPLICITE est le point capital. `mergeParams` du plugin est
 * un `Object.assign` : une config de route sans `keyGenerator` hérite du global,
 * soit `global:${request.ip}`. Or Fastify tourne sans `trustProxy` derrière
 * Traefik sur un réseau Docker — `request.ip` est l'IP du conteneur proxy,
 * IDENTIQUE pour tout le monde. Une limite « 20/min » serait alors 20/min pour
 * la plateforme entière, et un seul utilisateur en priverait tous les autres.
 *
 * - upload  : 20/min — écrit un fichier, la route la plus coûteuse du lot
 * - list    : 60/min — liste publique triée par popularité
 * - stream  : 240/min — une story enchaîne plusieurs pistes, cache client 1 h
 * - detail  : 120/min · patch : 30/min
 */
export function createSoundRouteRateLimitConfig(
  type: 'upload' | 'list' | 'stream' | 'detail' | 'patch'
): object {
  const configs = {
    upload: { max: 20, label: 'upload' },
    list: { max: 60, label: 'list' },
    stream: { max: 240, label: 'stream' },
    detail: { max: 120, label: 'detail' },
    patch: { max: 30, label: 'patch' },
  };
  const cfg = configs[type];
  return {
    max: cfg.max,
    timeWindow: '1 minute',
    ...GARDES_DE_CLE,
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const id = authContext?.userId ?? `ip:${request.ip}`;
      return `sounds:${cfg.label}:${id}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de requetes (sounds/${cfg.label}). Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}

/**
 * Rate limiter pour les endpoints Signal Protocol
 *
 * SECURITY: Protège contre:
 * - Key scraping (limite la récupération de bundles de clés)
 * - Session flooding (limite la création de sessions)
 * - Pre-key exhaustion attacks (limite la génération de clés)
 *
 * Limites:
 * - GET /keys/:userId: 30/minute (lookup keys)
 * - POST /keys: 5/minute (generate bundle - rare operation)
 * - POST /session/establish: 20/minute (session creation)
 */
/**
 * Limites des gestes de CHANGEMENT DE CONTACT (#4184, critères 3 à 5).
 *
 * Ces routes n'avaient AUCUN plafond, et deux d'entre elles font agir un tiers
 * pour le compte de l'appelant : `change-phone` envoie un SMS vers un numéro
 * qu'IL choisit, `change-email` un e-mail vers une adresse qu'il choisit. Sans
 * limite, ce n'est pas seulement un canal de spam — c'est une primitive
 * d'épuisement du budget SMS du produit, déclenchable par un seul compte.
 *
 * Le `keyGenerator` EXPLICITE n'est pas décoratif : `mergeParams` du plugin est
 * un `Object.assign`, donc une config sans `keyGenerator` hérite du global,
 * soit `global:${request.ip}`. Le gateway tourne sans `trustProxy` derrière
 * Traefik : `request.ip` est l'IP du conteneur proxy, IDENTIQUE pour tout le
 * monde. Un plafond « 3/h » deviendrait 3/h pour la plateforme entière — un
 * seul utilisateur en priverait tous les autres, et le rendrait par là même
 * inutile comme protection.
 *
 * - initiate : 3/h par COMPTE — c'est le geste qui fait partir le SMS ou l'e-mail
 * - verify   : 10/h par compte, en plus du compteur d'essais PAR DEMANDE
 *              (`contact-change.ts`), qui lui annule la demande à son cinquième
 *              échec. Les deux sont nécessaires : le compteur borne une
 *              recherche exhaustive sur UN code, le débit borne l'enchaînement
 *              de demandes neuves.
 * - resend   : 5/h par compte, au-dessus du délai de 60 s déjà posé dans le
 *              handler (désormais fail-closed).
 *
 * ## `hook: 'preHandler'` — sans quoi la clé « par compte » est une fiction
 *
 * `config.rateLimit` s'applique par défaut au hook `onRequest`, qui court
 * AVANT `preValidation` — donc avant que `unifiedAuth` ne pose `authContext`
 * sur la requête. Un `keyGenerator` qui lit `authContext?.userId` y reçoit
 * `undefined` et retombe sur son repli `ip:${request.ip}`. Mesuré sur le vrai
 * plugin (@fastify/rate-limit, `fastify.inject`), pas déduit : sans `hook`, le
 * générateur voit `AUCUN-authContext` ; avec `hook: 'preHandler'`, il voit le
 * compte. Ces trois gestes comptaient donc par ADRESSE — plusieurs comptes
 * derrière une même sortie se partageant les trois demandes horaires, et un
 * même compte multipliant son crédit par ses adresses. C'est la découverte de
 * #4147, portée ici. Voir `GARDES_DE_CLE` pour la portée exacte du repli
 * depuis que `trustProxy` est posé (#4137).
 *
 * ## `skipOnError: false` — la panne du gardien n'est pas l'absence de garde
 *
 * `registerGlobalRateLimiter` pose `skipOnError: true`, valeur GLOBALE
 * qu'@fastify/rate-limit fusionne par `Object.assign` dans toute config qui ne
 * la redéclare pas. Un Redis indisponible ouvrait donc ces trois gestes en
 * grand — exactement le motif que #4184 venait de fermer sur le limiteur de
 * renvoi, rouvert une couche plus bas par un défaut hérité.
 */
export function createContactChangeRateLimitConfig(
  type: 'initiate' | 'verify' | 'resend'
): object {
  const configs = {
    initiate: { max: 3, label: 'initiate' },
    verify: { max: 10, label: 'verify' },
    resend: { max: 5, label: 'resend' },
  };
  const cfg = configs[type];
  return {
    max: cfg.max,
    timeWindow: '1 hour',
    hook: 'preHandler' as const,
    skipOnError: false,
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const id = authContext?.userId ?? `ip:${request.ip}`;
      return `contact-change:${cfg.label}:${id}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: `Trop de demandes de changement de contact. Veuillez patienter.`,
      statusCode: 429,
    }),
  };
}

export function createSignalProtocolRateLimitConfig(
  type: 'keys_get' | 'keys_post' | 'session_establish'
): object {
  const configs = {
    keys_get: {
      max: 30,
      timeWindow: '1 minute',
      ...GARDES_DE_CLE,
      keyGenerator: (request: FastifyRequest) => {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (authContext && authContext.userId) {
          return `signal:keys:get:${authContext.userId}`;
        }
        return `signal:keys:get:ip:${request.ip}`;
      },
      errorResponseBuilder: () => ({
        success: false,
        error: 'Too many key lookup requests. Please wait before trying again.',
        statusCode: 429
      })
    },
    keys_post: {
      max: 5,
      timeWindow: '1 minute',
      ...GARDES_DE_CLE,
      keyGenerator: (request: FastifyRequest) => {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (authContext && authContext.userId) {
          return `signal:keys:post:${authContext.userId}`;
        }
        return `signal:keys:post:ip:${request.ip}`;
      },
      errorResponseBuilder: () => ({
        success: false,
        error: 'Too many key generation requests. Key bundles should only be generated occasionally.',
        statusCode: 429
      })
    },
    session_establish: {
      max: 20,
      timeWindow: '1 minute',
      ...GARDES_DE_CLE,
      keyGenerator: (request: FastifyRequest) => {
        const authContext = (request as UnifiedAuthRequest).authContext;
        if (authContext && authContext.userId) {
          return `signal:session:${authContext.userId}`;
        }
        return `signal:session:ip:${request.ip}`;
      },
      errorResponseBuilder: () => ({
        success: false,
        error: 'Too many session establishment requests. Please wait before trying again.',
        statusCode: 429
      })
    }
  };

  return configs[type];
}
