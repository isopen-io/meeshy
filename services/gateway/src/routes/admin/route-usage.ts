import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sendSuccess } from '../../utils/response';
import { requirePermission } from '../../middleware/authorize';
import { routeUsageCounter, type RouteUsageEntry } from '../../utils/route-usage-counter';

/**
 * `GET /admin/route-usage` — la mesure lisible SANS SSH que #4275 exige
 * (critère 2). Rend le compte par (méthode, gabarit de route, version de
 * client) accumulé par `registerRouteUsageCounterHook`
 * (`utils/route-usage-counter.ts`), qui écrit dans le MÊME singleton que
 * cette route lit — comme `circuitBreakerManager` pour
 * `GET /health/circuit-breakers` (`routes/health/index.ts`) : aucun câblage
 * supplémentaire requis une fois les deux montés dans le même process.
 *
 * ## Pourquoi S5 = `canAccessAdmin` ET `canViewAnalytics`, pas `canViewAnalytics` seule
 *
 * Exactement la porte de `GET /health/metrics` et `GET /health/circuit-breakers`
 * (`routes/health/index.ts`), et pour la MÊME raison : ce que cette route sert
 * n'est ni de l'analyse PRODUIT (des messages, des utilisateurs, des
 * conversations — le métier de `/admin/analytics/*`) ni de la modération de
 * CONTENU — c'est un signal OPÉRATIONNEL sur la SURFACE D'API elle-même, du
 * même ordre que le tas mémoire ou l'état d'un disjoncteur. `canViewAnalytics`
 * seule admettrait ANALYST, qui n'a pas de panneau d'administration et
 * n'a aucune raison de savoir quelles ROUTES le gateway sert ;
 * `canAccessAdmin` seule admettrait MODERATOR, dont le métier est le contenu,
 * pas la surface d'API. L'intersection — BIGBOSS, ADMIN, AUDIT — est
 * exactement la population qui décide un RETRAIT de route (#4178, #4181,
 * #4182, #4184), et AUDIT y a une place légitime : auditer ce qui est encore
 * appelé avant de consentir à un retrait est littéralement son métier.
 *
 * ## Pas de schéma de réponse déclaré, par décision
 *
 * `GET /health/metrics` et `GET /health/circuit-breakers` — les deux routes
 * S5 les plus proches de celle-ci dans le dépôt — n'en déclarent aucun non
 * plus. Ce fichier fait le même choix, et pas par omission : la charge de
 * cette route est un TABLEAU dont la longueur varie avec le trafic réel (donc
 * jamais une forme fixe à figer dans un schéma), et ce même `CLAUDE.md` documente
 * une classe entière de défauts où un schéma `properties` mal aligné avec le
 * PRODUCTEUR tronque silencieusement une réponse que `sendSuccess` composait
 * pourtant en entier (§ "Un schéma de réponse sans `properties` EFFACE").
 * Un schéma qu'on ne maintient pas rigoureusement est strictement pire que pas
 * de schéma ; le lecteur de cette route est un opérateur outillé (curl, cette
 * doc), pas un client mobile qui aurait besoin d'un contrat OpenAPI figé.
 */

type RouteUsagePayload = {
  readonly window: {
    readonly windowMs: number;
    readonly bucketMs: number;
    /**
     * Combien de millisecondes de trafic RÉEL cet instantané reflète — voir
     * `RouteUsageCounter.coverageMs()`. Un lecteur DOIT comparer ce champ à
     * `windowMs` avant de lire un compte proche de zéro comme la preuve
     * qu'une route est morte : `coverageMs < windowMs` veut dire que le
     * gateway n'a pas encore vécu une fenêtre complète (redémarrage récent),
     * pas que personne n'appelle plus la route (critère 5 — le faux zéro que
     * l'issue #4275 nomme explicitement).
     */
    readonly coverageMs: number;
    readonly bucketCount: number;
  };
  readonly entries: readonly RouteUsageEntry[];
};

export async function routeUsageRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/route-usage', {
    onRequest: [fastify.authenticate, requirePermission('canAccessAdmin'), requirePermission('canViewAnalytics')],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const now = Date.now();
    const payload: RouteUsagePayload = {
      window: {
        windowMs: routeUsageCounter.windowMsValue,
        bucketMs: routeUsageCounter.bucketMsValue,
        coverageMs: routeUsageCounter.coverageMs(now),
        bucketCount: routeUsageCounter.bucketCount,
      },
      entries: routeUsageCounter.snapshot(now),
    };
    return sendSuccess(reply, payload);
  });
}
