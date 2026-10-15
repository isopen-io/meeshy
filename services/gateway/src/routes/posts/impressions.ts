import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AUTH_REGIME, createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../../middleware/auth';
import { PostParams } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendUnauthorized, sendNotFound, sendInternalError } from '../../utils/response';
import { isContentSurface, type ContentSurface } from '@meeshy/shared/types/content-surfaces';
import { createPostRouteRateLimitConfig } from '../../middleware/rate-limiter';
import { depreciee } from '../../utils/deprecation';
import { socialEventsDeprecation } from '../social/deprecation';
import {
  ingestSocialEvents,
  IMPRESSION_SOURCES,
  refuseAnonymousBudget,
  type SocialEventsActor,
  type SocialEventsDeps,
} from '../social/events';
import { admitAnonymousEvents, resolveAnonymousReader, sessionTokenOf } from '../social/anonymousReader';

type Hook = (this: unknown, request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
type AnyHook = (this: unknown, request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => unknown;

/** Rejoue un hook Fastify, qu'il soit `async` ou à rappel `done`. */
const runHook = (hook: AnyHook, context: unknown, request: FastifyRequest, reply: FastifyReply): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const done = (err?: Error) => (err ? reject(err) : resolve(undefined));
    try {
      const result = hook.call(context, request, reply, done);
      if (result instanceof Promise) result.then(resolve, reject);
      else if (hook.length < 3) resolve(result);
    } catch (error) {
      reject(error);
    }
  });

/**
 * L'authentification des deux alias d'impression depuis #10483 : FACULTATIVE.
 *
 * Sans en-tête `Authorization` et avec un X-Session-Token, la requête est celle
 * d'un lecteur ANONYME — elle passe par le résolveur d'identité facultatif
 * (un invité de lien y est reconnu). Dans tous les autres cas, la garde
 * historique s'applique telle quelle : un jeton porteur invalide et une
 * requête sans aucun des deux en-têtes reçoivent toujours son 401.
 *
 * Le régime est DÉCLARÉ (`AUTH_REGIME`, #4489) : ce hook ne refuse pas un
 * appelant sans compte, et le manifeste des routes ne doit pas l'annoncer
 * gardé.
 */
export function reachAuth(requiredAuth: Hook, optionalAuth: Hook): Hook {
  const hook: Hook = async function reachAuth(this: unknown, request, reply) {
    const anonyme = !request.headers.authorization && sessionTokenOf(request) !== undefined;
    return runHook((anonyme ? optionalAuth : requiredAuth) as AnyHook, this, request, reply);
  };
  Object.defineProperty(hook, AUTH_REGIME, { value: { requireAuth: false, allowAnonymous: true }, enumerable: false });
  return hook;
}

/**
 * L'acteur d'un alias d'impression : un compte, ou — sans `Authorization` — un
 * lecteur anonyme dans son débit, compté en ÉVÉNEMENTS (`events`). `null` ⇒
 * 401 historique ; `'throttled'` ⇒ 429 ; sinon l'acteur et le nombre
 * d'événements admis.
 */
async function acteurDImpression(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  request: FastifyRequest,
  events: number,
): Promise<{ readonly acteur: SocialEventsActor; readonly admis: number } | null | 'throttled'> {
  const registeredUser = (request as UnifiedAuthRequest).authContext?.registeredUser;
  if (registeredUser) {
    return { acteur: { kind: 'user', userId: registeredUser.id, username: registeredUser.username ?? '' }, admis: events };
  }
  if (request.headers.authorization) return null;
  const lecteur = await resolveAnonymousReader(prisma as never, request);
  if (!lecteur) return null;
  if (events === 0) return { acteur: lecteur, admis: 0 };
  const admis = await admitAnonymousEvents(fastify, request, lecteur, events);
  return admis > 0 ? { acteur: lecteur, admis } : 'throttled';
}

const surfaceOf = (body: unknown): ContentSurface | undefined => {
  const surface = (body as { surface?: unknown } | undefined)?.surface;
  return isContentSurface(surface) ? surface : undefined;
};

/**
 * Plafond d'ids par appel du lot. UNE source de vérité, référencée par le
 * schéma (`maxItems`) ET par la garde de troncature interne : les deux avaient
 * divergé. Le schéma déclarait 100 — précédent `user-deletions.ts`, et la borne
 * dont dépend le cliquet `unbounded-findmany-guard` (« /posts/impressions/batch
 * plafonne a 100 ») — pendant que cette garde tronquait SILENCIEUSEMENT à 50.
 * Un lot de 51 à 100 ids VALIDES rendait donc 200 en n'enregistrant que les 50
 * premiers ; `recorded` ne signalait jamais les disparus. Une seule constante
 * rend la divergence impossible : le schéma REFUSE au-delà, la garde borne la
 * même valeur, et aucune impression admise n'est plus perdue en silence.
 */
const IMPRESSION_BATCH_CAP = 100;

/**
 * L'impression — ses deux adresses passent en sursis vers `POST /social/events` (#4150).
 *
 * ## Ce que ces deux routes ÉTAIENT
 *
 * Elles comptaient une apparition sur N'IMPORTE QUEL id, sans jamais consulter
 * `Post.visibility` (#4146), et la route unitaire était en prime un ORACLE
 * D'EXISTENCE : `updateMany` ne lève jamais, alors qu'`update` sortait en 500
 * (P2025) sur un id inconnu — 500 = « ce post existe », 200 = « il n'existe
 * pas ».
 *
 * ## Ce qu'elles SONT
 *
 * Des adaptateurs. Elles traduisent leur corps historique en événements
 * `impression` et DÉLÈGUENT à {@link ingestSocialEvents} — l'audience, la
 * fermeture de l'oracle, le comptage par occurrence et le crédit des racines de
 * repost vivent là-bas, en un seul exemplaire. **Aucune règle n'est
 * réimplémentée ici** : c'est la condition qui empêche les deux formes de
 * diverger à nouveau, comme leurs énumérations de surfaces l'avaient fait.
 *
 * Elles restent MONTÉES et servent leur forme de réponse historique — le
 * critère 10 interdit de les retirer tant qu'Android n'a pas été relevé — et
 * annoncent leur sursis par les trois en-têtes du site unique
 * (`utils/deprecation.ts`).
 */
export function registerImpressionRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  postService: SocialEventsDeps['postService'],
  optionalAuth: Hook = createUnifiedAuthMiddleware(prisma, { requireAuth: false, allowAnonymous: true }) as Hook,
) {
  const deps: SocialEventsDeps = { fastify, prisma, postService };
  const authFacultative = reachAuth(requiredAuth as Hook, optionalAuth);

  // ALIAS de `POST /social/events` — POST /posts/:postId/impression
  fastify.post('/posts/:postId/impression', {
    schema: {
      params: { type: 'object', required: ['postId'], properties: { postId: { type: 'string' } } },
      body: {
        type: 'object',
        properties: {
          source: { type: 'string', enum: [...IMPRESSION_SOURCES] },
          // Pas d'`enum` : une surface inconnue est IGNORÉE (`surfaceOf`), le
          // corps passe — un client plus neuf que le serveur garde ses comptes.
          surface: { type: 'string', maxLength: 32 },
        }
      }
    },
    onRequest: depreciee(socialEventsDeprecation()),
    preValidation: [authFacultative],
    config: { rateLimit: createPostRouteRateLimitConfig('impressionUnit') },
  }, async (request: FastifyRequest<{ Params: PostParams }>, reply: FastifyReply) => {
    try {
      const admission = await acteurDImpression(fastify, prisma, request, 1);
      if (admission === 'throttled') return refuseAnonymousBudget(reply);
      if (!admission) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }
      const { acteur } = admission;

      const { postId } = request.params;
      const source = (request.body as { source?: string } | undefined)?.source ?? 'feed';

      const { rejected } = await ingestSocialEvents(
        deps,
        [{ type: 'impression', postId, source: source as never, surface: surfaceOf(request.body) }],
        acteur,
      );

      // Le 404 historique est conservé — et il ne distingue toujours rien :
      // inconnu, supprimé, hors audience et malformé y sortent tous ensemble.
      // Il se lit sur `rejected` : ce qui a été admis n'est pas « introuvable ».
      if (rejected > 0) {
        return sendNotFound(reply, 'Post not found', { code: 'POST_NOT_FOUND' });
      }

      return sendSuccess(reply, { recorded: true });
    } catch (error) {
      enhancedLogger.error('[POST /posts/:postId/impression]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });

  // ALIAS de `POST /social/events` — POST /posts/impressions/batch
  fastify.post('/posts/impressions/batch', {
    schema: {
      body: {
        type: 'object',
        required: ['postIds'],
        properties: {
          // Le lot est PLAFONNÉ, et pas seulement par prudence : chaque id
          // coûte une ligne à la passe d'audience puis un verdict. Sans plafond,
          // un appelant authentifié choisit seul le travail que la passerelle
          // exécute — un lot de cent mille ids devient une lecture de cent mille
          // lignes et autant de verdicts.
          // Le plafond suit le précédent de `user-deletions.ts` ; un écran de
          // fil n'observe jamais plus de quelques dizaines de posts par salve.
          // La borne est `IMPRESSION_BATCH_CAP` — la MÊME que la garde de
          // troncature interne, jamais un littéral qui puisse en diverger.
          //
          // PAS de `minItems` : un lot VIDE est un succès à zéro enregistrement,
          // et deux témoins l'exigent. Un client qui n'a rien observé ne doit
          // pas avoir à le vérifier avant d'appeler — c'est le serveur qui sait
          // répondre « rien à faire », pas l'appelant qui doit le deviner.
          postIds: { type: 'array', items: { type: 'string' }, maxItems: IMPRESSION_BATCH_CAP },
          source: { type: 'string', enum: [...IMPRESSION_SOURCES] },
          // Pas d'`enum` : une surface inconnue est IGNORÉE (`surfaceOf`), le
          // corps passe — un client plus neuf que le serveur garde ses comptes.
          surface: { type: 'string', maxLength: 32 },
        }
      }
    },
    onRequest: depreciee(socialEventsDeprecation()),
    preValidation: [authFacultative],
    config: { rateLimit: createPostRouteRateLimitConfig('impression') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { postIds, source = 'feed' } = request.body as { postIds?: unknown; source?: string };
      const lot = Array.isArray(postIds) ? (postIds as string[]).slice(0, IMPRESSION_BATCH_CAP) : [];
      const admission = await acteurDImpression(fastify, prisma, request, lot.length);
      if (admission === 'throttled') return refuseAnonymousBudget(reply);
      if (!admission) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }
      if (lot.length === 0) {
        return sendSuccess(reply, { recorded: 0 });
      }

      const { recorded } = await ingestSocialEvents(
        deps,
        lot.slice(0, admission.admis).map((id) => ({
          type: 'impression' as const, postId: id, source: source as never, surface: surfaceOf(request.body),
        })),
        admission.acteur,
      );

      // `recorded` compte ce qui a RÉELLEMENT été écrit, pas ce qui a été
      // demandé — annoncer les cinquante ids reçus quand la moitié a été
      // refusée serait un mensonge, et il était déjà faux avant l'ACL : Mongo
      // n'impose aucune clé étrangère, donc un id inconnu produisait une ligne
      // `PostImpression` orpheline comptée dans le total.
      return sendSuccess(reply, { recorded });
    } catch (error) {
      enhancedLogger.error('[POST /posts/impressions/batch]', error);
      return sendInternalError(reply, 'Internal server error', { code: 'INTERNAL_ERROR' });
    }
  });
}
