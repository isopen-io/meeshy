import type { FastifyReply, FastifyRequest } from 'fastify';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { getCacheStore } from '../../services/CacheStore';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'socialRateLimit' });

/**
 * Limiteurs de débit du domaine SOCIAL — #4147 « une écriture sociale
 * coûteuse ne part jamais sans plafond ». Ce fichier porte deux mécanismes
 * DISTINCTS, et les confondre est exactement l'erreur que ce lot a d'abord
 * commise (voir `checkSharedRateLimit` plus bas pour le pourquoi) :
 *
 * 1. Un plafond PAR ROUTE (`createSocial*RateLimitConfig`, via
 *    `config.rateLimit` de @fastify/rate-limit) — pour republish, translate
 *    et discovery, dont AUCUNE paire ne doit physiquement partager un
 *    compteur (cf. docstrings individuelles).
 * 2. Un plafond PARTAGÉ ENTRE PLUSIEURS ROUTES (`checkSharedRateLimit` +
 *    `createSharedWriteRateLimitPreHandler`), pour la seule famille qui
 *    l'exige : POST /posts, POST /posts/from-attachment (core.ts) et
 *    POST /posts/:postId/repost (interactions.ts) doivent consommer UN SEUL
 *    budget de 10/min — sans quoi le repost recontourne le plafond de
 *    création (#4147 critère 2).
 *
 * ── Pourquoi DEUX mécanismes, pas un seul avec la même clé partout ────────
 *
 * `config.rateLimit` NE PEUT PAS faire partager un compteur à deux routes
 * DIFFÉRENTES, quel que soit ce que rend `keyGenerator` — @fastify/rate-limit
 * dérive, pour CHAQUE route qui déclare `config.rateLimit`, un « child store »
 * NAMESPACÉ PAR LA ROUTE ELLE-MÊME (index.js, hook `onRoute` :
 * `pluginComponent.store.child(mergedRateLimitParams)`) :
 *  - `RedisStore.child` (store/RedisStore.js) PRÉFIXE la clé Redis par
 *    `${method}${url}-` AVANT d'y ajouter ce que rend `keyGenerator` — deux
 *    routes distinctes écrivent donc dans deux clés Redis distinctes même
 *    avec un `keyGenerator` identique ;
 *  - `LocalStore.child` (store/LocalStore.js) fabrique une LRU flambant
 *    neuve à CHAQUE appel, sans même regarder la clé — en mémoire locale, le
 *    partage inter-routes est structurellement impossible.
 * Preuve rejouée : `createPostRouteRateLimitConfig('create')` posé
 * INDÉPENDAMMENT sur POST /posts ET sur POST /posts/from-attachment (déjà le
 * cas AVANT #4147) n'a donc JAMAIS partagé le moindre crédit malgré un label
 * identique — témoin dans `social-write-rate-limit.test.ts`. Router repost
 * par le même mécanisme aurait fermé le contournement en apparence
 * (même label `create`) sans le fermer en réalité (compteurs disjoints).
 *
 * `checkSharedRateLimit` sort donc délibérément de `config.rateLimit` pour
 * la famille create/from-attachment/repost : une clé Redis QU'AUCUNE route
 * ne préfixe, incrémentée directement, identique pour les trois handlers.
 * `hook: 'preHandler'` : voir la note sur `withUserKeyedFailClosed` — la
 * même classe de défaut (clé calculée avant `authContext`) s'appliquerait à
 * un `preHandler` posé au mauvais endroit du tableau ; ici il n'y a qu'un
 * seul endroit possible (après `requiredAuth`, donc en dernière position du
 * tableau `preHandler` de la route), donc pas de piège équivalent.
 */
function withUserKeyedFailClosed<T extends object>(
  config: T
): T & { hook: 'preHandler'; skipOnError: false } {
  return { ...config, hook: 'preHandler', skipOnError: false };
}

/**
 * Recale une config EXISTANTE de `createPostRouteRateLimitConfig` (hors
 * territoire, middleware/rate-limiter.ts) sur les deux garanties que #4147
 * exige et qu'aucune fabrique de ce module ne pose par défaut :
 *
 * 1. LA CLÉ. `config.rateLimit` s'applique, par défaut, au hook `onRequest`
 *    (`defaultHook` de @fastify/rate-limit) — qui s'exécute AVANT
 *    `preValidation`, où `unifiedAuth` (middleware/auth.ts) pose
 *    `authContext` sur la requête. Preuve rejouée sur le plugin réel
 *    (@fastify/rate-limit 11.2.0, `fastify.inject`) : un `keyGenerator`
 *    déclaré SANS `hook` explicite reçoit `authContext === undefined`, donc
 *    retombe SYSTÉMATIQUEMENT sur `ip:${request.ip}` — jamais sur le compte.
 *    `hook: 'preHandler'` (phase postérieure à `preValidation`) referme le
 *    trou.
 * 2. L'ÉCHEC. `registerGlobalRateLimiter` pose `skipOnError: true` — une
 *    valeur GLOBALE (`globalParams.skipOnError`) qu'@fastify/rate-limit
 *    fusionne par simple `Object.assign` avec `config.rateLimit` : toute
 *    route qui ne la redéclare pas l'hérite. Aucune fabrique existante ne la
 *    redéclare : un Redis indisponible fait donc, AUJOURD'HUI, échouer TOUS
 *    les limiteurs par route dans le sens OUVERT — l'inverse de ce que
 *    #4147 exige d'une écriture coûteuse. `skipOnError: false` est un choix
 *    délibérément LOCAL, à rebours du défaut hérité du reste du dépôt.
 *
 * Les DEUX défauts touchent `middleware/rate-limiter.ts` dans son ensemble
 * (sons, Signal, appels, directory, et les labels `posts:` que ce lot ne
 * touche pas — view/engagement/comment) : hors territoire, signalé à
 * l'intégration plutôt que corrigé à la source. `withUserKeyedFailClosed`
 * recale les SEULES routes que ce lot fait parler — chacune garde son PROPRE
 * seau (aucun partage inter-routes n'est prétendu ici, voir le fichier
 * `.child()` ci-dessus pour pourquoi ce ne serait pas honnête).
 */
export function hardenedRateLimitConfig(config: object): object {
  return withUserKeyedFailClosed(config);
}

/**
 * `POST /posts/:postId/republish` — la seule opération DESTRUCTIVE du module
 * (supprime vues/réactions/impressions, remet sept compteurs à zéro,
 * refanne `story:created` dans tous les trays) et qui n'avait, avant #4147,
 * aucun plafond. Seau dédié, propre à cette route — pas couplé à la
 * création : republier une story existante n'est pas un geste de création,
 * et le coupler bloquerait un usage nominal (prolonger une story qui expire)
 * sur le budget d'un autre.
 */
export function createSocialWriteRateLimitConfig(): object {
  return withUserKeyedFailClosed({
    max: 10,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const id = authContext?.userId ?? `ip:${request.ip}`;
      return `social:write:${id}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Trop d\'écritures sociales coûteuses (social/write). Veuillez patienter.',
      statusCode: 429,
    }),
  });
}

/**
 * Traduction à la demande — `POST /posts/:postId/translate` (core.ts) et
 * `POST /posts/:postId/comments/:commentId/translate` (comments.ts) portent
 * chacune ce plafond, posé INDÉPENDAMMENT sur les deux routes (même ceiling,
 * même format de clé — mais PAS un compteur physiquement unique : voir la
 * note `.child()` en tête de fichier, valable ici aussi). #4147 critère 3
 * n'exige, pour cette famille, qu'un plafond par route et un schéma Zod
 * PARTAGÉ (`TranslatePostSchema`, routes/posts/types.ts) — pas un compteur
 * fusionné, contrairement à create/repost dont le témoin l'exige
 * explicitement (critère 8).
 */
export function createSocialTranslateRateLimitConfig(): object {
  return withUserKeyedFailClosed({
    max: 20,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const id = authContext?.userId ?? `ip:${request.ip}`;
      return `social:translate:${id}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Trop de demandes de traduction (social/translate). Veuillez patienter.',
      statusCode: 429,
    }),
  });
}

/**
 * `GET /posts/nearby` + `GET /posts/nearby/density` (routes/posts/nearby.ts,
 * HORS territoire de #4147 pour ce lot — cf. `edits_hors_territoire` du
 * rapport de livraison). Exportée ici pour que le câblage restant, dans
 * `nearby.ts`, soit un import + une ligne de config par route. #4147
 * critère 5 dit « portent UN plafond de route » (singulier, par ROUTE) — pas
 * un seau fusionné ; chaque route l'applique indépendamment.
 */
export function createSocialDiscoveryRateLimitConfig(): object {
  return withUserKeyedFailClosed({
    max: 30,
    timeWindow: '1 minute',
    keyGenerator: (request: FastifyRequest) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const id = authContext?.userId ?? `ip:${request.ip}`;
      return `social:discovery:${id}`;
    },
    errorResponseBuilder: () => ({
      success: false,
      error: 'Trop de requêtes de découverte géographique (social/discovery). Veuillez patienter.',
      statusCode: 429,
    }),
  });
}

// ────────────────────────────────────────────────────────────────────────
// Seau PARTAGÉ entre plusieurs routes — famille create/from-attachment/repost
// ────────────────────────────────────────────────────────────────────────

/** Sous-ensemble du client ioredis réellement utilisé — facilite le double en test
 *  sans reconstruire un faux client complet. */
export type IncrementableRedis = {
  incr(key: string): Promise<number>;
  pexpire(key: string, milliseconds: number): Promise<number>;
  pttl(key: string): Promise<number>;
};

export type SharedRateLimitVerdict =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

/**
 * Compteur PARTAGÉ, en dehors de `config.rateLimit` — DÉLIBÉRÉMENT, pour la
 * raison énoncée en tête de fichier : aucune configuration par route de
 * @fastify/rate-limit ne peut faire converger deux routes vers un seul
 * compteur. `INCR` puis, au PREMIER coup seulement (`current === 1`),
 * `PEXPIRE` — le même schéma que le script Lua interne du plugin
 * (`store/RedisStore.js`), sans sa dérivation de clé par route : la clé
 * passée ici EST la clé Redis, verbatim.
 *
 * Fail-closed EXPLICITE (consignes de lot « une écriture sociale coûteuse ne
 * part jamais sans plafond ») : `redis === null` (Redis absent, comme en
 * test ou lors d'une panne) ou toute exception du client REFUSE l'écriture —
 * jamais un passage silencieux parce que la garde n'a pas pu s'exécuter.
 * C'est l'inverse du `skipOnError: true` que `registerGlobalRateLimiter`
 * pose pour le reste du dépôt (disponibilité prioritaire au plafond) : ici,
 * le plafond prime, par choix explicite de #4147.
 */
export async function checkSharedRateLimit(params: {
  redis: IncrementableRedis | null;
  key: string;
  max: number;
  windowMs: number;
}): Promise<SharedRateLimitVerdict> {
  const { redis, key, max, windowMs } = params;
  const windowSeconds = Math.max(1, Math.ceil(windowMs / 1000));

  if (!redis) {
    logger.warn('Compteur partagé indisponible (Redis absent) — écriture refusée (fail-closed)', { key });
    return { allowed: false, retryAfterSeconds: windowSeconds };
  }

  try {
    const current = await redis.incr(key);
    if (current === 1) {
      // Premier coup de cette fenêtre : pose l'expiration. Une exception ICI
      // laisserait une clé SANS TTL — un bug de fuite, pas de sécurité (elle
      // se traduirait par un plafond qui ne se réinitialise plus, jamais par
      // un plafond contourné) — mais on la journalise pour la détecter.
      try {
        await redis.pexpire(key, windowMs);
      } catch (expireError) {
        logger.warn('Échec de la pose de TTL sur un compteur partagé neuf', { key, expireError });
      }
    }
    if (current > max) {
      let ttlMs = windowMs;
      try {
        const readTtl = await redis.pttl(key);
        if (readTtl > 0) ttlMs = readTtl;
      } catch {
        // Repli sur la fenêtre nominale — un TTL illisible ne doit pas
        // dégrader le verdict (déjà REFUSÉ) en 500 supplémentaire.
      }
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(ttlMs / 1000)) };
    }
    return { allowed: true };
  } catch (error) {
    logger.warn('Compteur partagé en erreur — écriture refusée (fail-closed)', { key, error });
    return { allowed: false, retryAfterSeconds: windowSeconds };
  }
}

/**
 * `preHandler` — POST /posts, POST /posts/from-attachment (core.ts) et
 * POST /posts/:postId/repost (interactions.ts) le posent TOUTES LES TROIS,
 * après `requiredAuth` : #4147 critère 2, « le plafond de création se
 * contourne par le repost ». Clé `social:write:create:{userId}` — distincte
 * de `social:write:{userId}` (republish, ci-dessus) : les deux familles ne
 * doivent PAS se mélanger (prolonger une story ne consomme pas le budget de
 * création, et réciproquement).
 */
export function createSharedWriteRateLimitPreHandler() {
  const MAX = 10;
  const WINDOW_MS = 60_000;

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    const id = authContext?.userId ?? `ip:${request.ip}`;
    const key = `social:write:create:${id}`;

    const verdict = await checkSharedRateLimit({
      redis: getCacheStore().getNativeClient(),
      key,
      max: MAX,
      windowMs: WINDOW_MS,
    });

    if (verdict.allowed === false) {
      reply.header('retry-after', String(verdict.retryAfterSeconds));
      reply.code(429).send({
        success: false,
        error: 'Trop de créations sociales coûteuses (social/write). Veuillez patienter.',
        statusCode: 429,
      });
    }
  };
}
