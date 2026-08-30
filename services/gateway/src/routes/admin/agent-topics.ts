import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sendSuccess, sendError, sendBadRequest, sendNotFound, sendInternalError } from '../../utils/response';
import { getCacheStore } from '../../services/CacheStore';
import { AgentHttpClient } from '../../services/AgentHttpClient';
import { submittedKeysOnly } from '../../utils/partial-update';
import { AGENT_ADMIN_EVENT_CHANNEL, type AgentAdminEventData } from '@meeshy/shared/types/socketio-events';
import { OBJECT_ID_REGEX } from '@meeshy/shared/utils/object-id';
import { requirePermission } from '../../middleware/authorize';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import { certifyPatterns, countMatchesOffLoop, type PatternRefusal } from '../../utils/safe-regex';

/**
 * Routes admin CRUD pour le catalogue de topics dynamiques utilisé par le
 * strategist agent. Réutilise le pattern existant `requireAgentAdmin` + Zod
 * validation + Redis pub/sub invalidation (canal `agent:config-invalidated`).
 *
 * Endpoints :
 *   GET    /admin/agent/topics              — list (query ?active=true|false|all)
 *   GET    /admin/agent/topics/:id          — détail
 *   POST   /admin/agent/topics              — create
 *   PATCH  /admin/agent/topics/:id          — update
 *   DELETE /admin/agent/topics/:id?hard=true — soft (isActive=false) or hard delete
 *   POST   /admin/agent/topics/:id/test     — test regex contre sampleText
 */

// `requireAgentAdmin` était une garde LOCALE : elle rejouait une liste de rôles en dur
// (#4153). Elle nomme désormais la permission qu'elle exige, et la matrice
// décide — un seul endroit où lire la loi, un seul où la changer.
const requireAgentAdmin = requirePermission('canManageAgent');

const TopicInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_-]+$/, 'kebab_case requis').min(2).max(40),
  label: z.string().min(1).max(80),
  description: z.string().max(280).optional().nullable(),
  // `new RegExp(s)` ne lève pas sur `(a+)+$` : COMPILER un motif ne dit rien
  // de ce qu'il coûte à EXÉCUTER. Ce schéma ne garde donc plus que la forme
  // (une chaîne, bornée) ; la sûreté se prouve dans le handler, par
  // `certifyPatterns`, qui mesure hors boucle d'événements. Cf. `utils/safe-regex`.
  keywordPatterns: z.array(z.string().min(1).max(200)).min(1).max(10),
  instructionTemplate: z.string().min(20).max(1000),
  searchHintTemplate: z.string().min(5).max(200),
  examples: z.array(z.string().max(300)).max(5).default([]),
  cooldownMinutes: z.number().int().min(0).max(10080).default(60),
  isActive: z.boolean().default(true),
});

const TopicPatchSchema = TopicInputSchema.partial();

const TestRegexBodySchema = z.object({ sampleText: z.string().min(1).max(5000) });

/**
 * Broadcast à tous les agents : invalide leur cache topic catalog.
 * Pattern belt-and-suspenders : Redis pub/sub (low-latency) + HTTP POST
 * direct au agent (résilient si pub/sub down). Best-effort, ne throw pas.
 */
async function broadcastTopicsInvalidation(fastify: FastifyInstance): Promise<void> {
  const agentHost = process.env.AGENT_HOST;
  const agentHttpPort = process.env.AGENT_HTTP_PORT || '3200';
  const agentClient = agentHost ? new AgentHttpClient(`http://${agentHost}:${agentHttpPort}`) : null;

  const payload = JSON.stringify({ scope: 'topics' });
  const tasks: Array<Promise<unknown>> = [
    getCacheStore().publish('agent:config-invalidated', payload).catch((err) =>
      fastify.log.warn({ err }, '[TopicCatalog] Redis publish failed'),
    ),
  ];
  if (agentClient) {
    tasks.push(
      agentClient.invalidateCache({ scope: 'topics' } as any).catch((err) =>
        fastify.log.warn({ err }, '[TopicCatalog] HTTP invalidate failed'),
      ),
    );
  }
  await Promise.allSettled(tasks);
}

/**
 * Push temps réel vers les dashboards admin (room `admin:agent` via
 * AgentAdminRelay) — même canal que les mutations configs/queue/scans.
 */
function notifyAdminDashboards(fastify: FastifyInstance): void {
  const payload: AgentAdminEventData = { kind: 'topics' };
  getCacheStore().publish(AGENT_ADMIN_EVENT_CHANNEL, JSON.stringify(payload)).catch((err) =>
    fastify.log.warn({ err }, '[TopicCatalog] admin-event publish failed'));
}

/**
 * Rend le 400 d'un motif refusé en NOMMANT le motif et la raison.
 *
 * Un « Regex invalide » nu — le message que rendait l'ancien `refine` de Zod —
 * n'apprend rien à qui vient d'écrire dix motifs : il faut deviner lequel, et
 * pourquoi. Le refus dit les deux.
 */
function refuseUnsafePatterns(reply: FastifyReply, refusals: readonly PatternRefusal[]): void {
  const detail = refusals
    .map((r) => `${r.pattern} → [${r.code}] ${r.message}`)
    .join(' ; ');
  sendBadRequest(reply, `keywordPatterns: motif refusé — ${detail}`);
}

/**
 * `userId` SENTINELLE de `createUnauthenticatedContext()` (`middleware/auth.ts`)
 * — modèle : `middleware/rate-limit.ts`, `VISITEUR_SANS_COMPTE`.
 *
 * Un visiteur sans justificatif reçoit un `authContext` COMPLET dont le
 * `userId` vaut la chaîne `'anonymous'` — une valeur VRAIE. Un générateur qui
 * se contente de `userId ?? repli` la prend donc pour un compte et range TOUS
 * les visiteurs de la planète dans UN seul seau. Cette route ne peut être
 * atteinte QUE par un compte BIGBOSS/ADMIN (§ ci-dessous) : la sentinelle n'y
 * est jamais exercée aujourd'hui. Elle reste gardée en défense — le jour où
 * cette route, ou une copie de son `keyGenerator`, admettrait l'anonyme, le
 * piège se refermerait en silence sans elle.
 */
const VISITEUR_SANS_COMPTE = 'anonymous';

/**
 * Identité de débit de l'appelant, avec des préfixes DISJOINTS par
 * population — modèle : `middleware/rate-limit.ts` l. 148-158
 * (`resolveCallerKey`). `acct:` et `ip:` ne peuvent pas se confondre : sans
 * préfixe côté compte, un `userId` qui ressemblerait à `ip:1.2.3.4`
 * partagerait le seau d'un visiteur — impossible aujourd'hui (un `userId` de
 * compte est un ObjectId Mongo, jamais de cette forme), mais la règle ne
 * dépend pas de cette coïncidence.
 */
function resolveAgentTopicsTestCallerKey(request: FastifyRequest): string {
  const authContext = (request as UnifiedAuthRequest).authContext;
  const userId = authContext?.userId;
  if (userId && userId !== VISITEUR_SANS_COMPTE) {
    return `acct:${userId}`;
  }
  return `ip:${request.ip}`;
}

/**
 * Débit de `POST /topics/:id/test` : 10 par minute et PAR COMPTE ADMIN.
 *
 * La route reste la plus chère du fichier même après le déport hors boucle
 * d'événements — chaque appel démarre un fil de travail et lui donne un
 * budget de temps. Sans plafond, dix appels concurrents deviennent dix fils,
 * et le déport se contente de déplacer la saturation d'un fil vers la machine.
 *
 * ## La garde réelle de la route, MESURÉE — pas supposée d'un préfixe `/admin`
 *
 * `onRequest: [fastify.authenticate, requireAgentAdmin]` (route ci-dessous).
 * `fastify.authenticate` (`server.ts`, décoré par
 * `createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: false })`)
 * répond 401 à tout visiteur sans JWT et 403 à tout invité de lien partagé
 * (`type !== 'user'`) — dans les deux cas AVANT de poser `authContext` sur la
 * requête. `requireAgentAdmin` (`requirePermission('canManageAgent')`,
 * `middleware/authorize.ts`) répond ensuite 403 à tout compte enregistré qui
 * n'a pas `canManageAgent` — BIGBOSS et ADMIN seulement
 * (`services/admin/permissions.service.ts`). **Seul un compte BIGBOSS/ADMIN
 * atteint donc jamais le handler** : ni un visiteur, ni un invité anonyme de
 * lien partagé (dont `authContext.userId` porterait un `Participant.id`, pas
 * un `User.id` — rappel du dépôt qui ne s'applique donc PAS ici), ni un
 * simple USER.
 *
 * ## `hook: 'preHandler'` — explicite, pas un correctif de bug OBSERVÉ ici
 *
 * Contrairement à `routes/calls.ts` (garde en `preValidation`) et aux cinq
 * fabriques de `middleware/rate-limiter.ts` (garde en `preValidation`/`preHandler`
 * selon la route), la garde de CETTE route vit en `onRequest` — la MÊME phase
 * où `config.rateLimit` s'évalue par défaut. Mesuré sur le vrai plugin
 * (`addRouteRateHook`, `@fastify/rate-limit/index.js`) : sans `hook` déclaré,
 * il pousse son propre hook à la FIN du tableau `onRequest` déjà posé par la
 * route — donc après `fastify.authenticate` ET `requireAgentAdmin`, qui l'y
 * ont précédé dans le même littéral. `authContext` était donc déjà LISIBLE
 * ici avant ce lot, contrairement à `calls.ts` où la garde vit en
 * `preValidation`, une phase PLUS TARDIVE que l'`onRequest` par défaut du
 * plugin — c'est cette différence de phase, pas la présence du hook, qui
 * décidait. Témoin AVANT/APRÈS retrait du hook :
 * `agent-topics-test-route-counts-the-account.test.ts`.
 *
 * Le hook est posé quand même, pour deux raisons qui ne sont pas la
 * disparition d'un défaut observé : (1) ne plus DÉPENDRE d'un ordre de
 * tableau accidentel — un futur refactor qui déplacerait cette garde en
 * `preValidation` (à la `calls.ts`) romprait silencieusement le comptage par
 * compte si le hook restait implicite ; (2) aligner la forme sur le reste du
 * dépôt (`GARDES_DE_CLE`, `createRateLimitConfig`), dont ce fichier prétendait
 * suivre le patron sans le faire — le doc-comment d'origine affirmait « même
 * forme que `createPostRouteRateLimitConfig` » en la NOMMANT : c'était
 * l'exact procédé qui a tenu #4347 hors de ce fichier pendant tout ce temps.
 *
 * ## Le sens de l'échec : FERMÉ — et ce n'est PAS celui des routes d'appels
 *
 * `registerGlobalRateLimiter` (le plugin réellement monté, `server.ts:560`)
 * pose `skipOnError: true` ; `mergeParams` du plugin (`Object.assign`) le
 * fait HÉRITER par toute config de route qui ne le redéclare pas — c'est le
 * défaut que ce fichier portait : `TEST_ROUTE_RATE_LIMIT` ne déclarait aucun
 * `skipOnError`, donc une panne du magasin de compteurs (Redis) ouvrait ce
 * plafond en grand, SILENCIEUSEMENT, sans que personne l'ait décidé — mesuré
 * dans le même témoin que ci-dessus.
 *
 * Le lot voisin (`middleware/rate-limit.ts`, `ROUTE_RATE_LIMITS`) choisit
 * OUVERT pour les routes d'appels parce qu'elles couvrent RACCROCHER et
 * QUITTER : refuser pendant la panne enfermerait l'appelant dans un appel
 * qu'il ne peut plus quitter — un dommage produit certain contre un abus
 * hypothétique. L'arbitrage n'est pas le même ici. Cette route exécute des
 * expressions régulières D'APPELANT — le motif même qui a figé le gateway
 * entier avant `certifyPatterns`/`countMatchesOffLoop` (cf. commentaires
 * plus bas) — et son plafond protège un budget de FILS/CPU, pas seulement un
 * flot de requêtes. Pendant une panne Redis, laisser passer transforme
 * l'indisponibilité du compteur en invitation à saturer le pool de fils au
 * moment précis où l'infrastructure est déjà sous tension ; refuser ne prive
 * qu'un BIGBOSS/ADMIN d'un test de motif pendant quelques minutes. FERMÉ
 * (`skipOnError: false`) : la panne du magasin répond alors 500 — jamais un
 * 429 propre, le plugin laissant remonter l'erreur du magasin — ce qui reste
 * préférable à laisser saturer le processus.
 */
export const TEST_ROUTE_RATE_LIMIT = {
  max: 10,
  timeWindow: '1 minute',
  hook: 'preHandler' as const,
  skipOnError: false,
  keyGenerator: (request: FastifyRequest) =>
    `agent-topics:test:${resolveAgentTopicsTestCallerKey(request)}`,
  errorResponseBuilder: () => ({
    success: false,
    error: 'Trop de tests de motifs (agent-topics/test). Veuillez patienter.',
    statusCode: 429,
  }),
};

export async function agentTopicsRoutes(fastify: FastifyInstance) {
  // GET /admin/agent/topics
  fastify.get('/topics', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { active?: string };
      const where: { isActive?: boolean } = {};
      if (query.active === 'true') where.isActive = true;
      else if (query.active === 'false') where.isActive = false;
      const topics = await fastify.prisma.agentTopicCatalog.findMany({
        where,
        orderBy: { slug: 'asc' },
      });
      sendSuccess(reply, topics);
    } catch (err) {
      sendInternalError(reply, 'Erreur récupération topics', err);
    }
  });

  // GET /admin/agent/topics/:id
  fastify.get('/topics/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    try {
      const topic = await fastify.prisma.agentTopicCatalog.findUnique({ where: { id } });
      if (!topic) {
        sendNotFound(reply, 'Topic introuvable');
        return;
      }
      sendSuccess(reply, topic);
    } catch (err) {
      sendInternalError(reply, 'Erreur récupération topic', err);
    }
  });

  // POST /admin/agent/topics
  fastify.post('/topics', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = TopicInputSchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      return;
    }
    // Un motif à retour arrière catastrophique se refuse À L'ÉCRITURE : une
    // fois en base, il est exécuté par `/test` ET par le strategist, et le
    // seul moment où on peut encore l'arrêter sans coût est celui-ci.
    const refusals = await certifyPatterns(parsed.data.keywordPatterns);
    if (refusals.length > 0) {
      refuseUnsafePatterns(reply, refusals);
      return;
    }
    try {
      // parsed.data has all required fields filled (Zod .default() applies at
      // parse-time) ; cast to satisfy Prisma's strict input typing.
      const created = await fastify.prisma.agentTopicCatalog.create({
        data: parsed.data as Required<typeof parsed.data>,
      });
      await broadcastTopicsInvalidation(fastify);
      notifyAdminDashboards(fastify);
      sendSuccess(reply, created);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2002') {
        sendBadRequest(reply, 'Slug déjà existant');
      } else {
        sendInternalError(reply, 'Erreur création topic', err);
      }
    }
  });

  // PATCH /admin/agent/topics/:id
  fastify.patch('/topics/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const parsed = TopicPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      return;
    }
    // Le PATCH est le chemin le plus facile à oublier : garder la création et
    // laisser passer le renommage rouvrirait la porte en un coup de `PATCH`.
    if (parsed.data.keywordPatterns) {
      const refusals = await certifyPatterns(parsed.data.keywordPatterns);
      if (refusals.length > 0) {
        refuseUnsafePatterns(reply, refusals);
        return;
      }
    }
    try {
      // `partial()` ne retire pas les `default()` de `examples`,
      // `cooldownMinutes` et `isActive` : écrire `parsed.data` tel quel
      // renvoyait ces trois champs à leur défaut à chaque renommage.
      // Cf. `utils/partial-update`.
      const updated = await fastify.prisma.agentTopicCatalog.update({
        where: { id },
        data: submittedKeysOnly(parsed.data as Record<string, unknown>, request.body),
      });
      await broadcastTopicsInvalidation(fastify);
      notifyAdminDashboards(fastify);
      sendSuccess(reply, updated);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2025') {
        sendNotFound(reply, 'Topic introuvable');
      } else {
        sendInternalError(reply, 'Erreur update topic', err);
      }
    }
  });

  // DELETE /admin/agent/topics/:id?hard=true
  fastify.delete('/topics/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const query = request.query as { hard?: string };
    const hard = query.hard === 'true';
    try {
      if (hard) {
        await fastify.prisma.agentTopicCatalog.delete({ where: { id } });
      } else {
        await fastify.prisma.agentTopicCatalog.update({
          where: { id },
          data: { isActive: false },
        });
      }
      await broadcastTopicsInvalidation(fastify);
      notifyAdminDashboards(fastify);
      sendSuccess(reply, { id, deleted: hard ? 'hard' : 'soft' });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2025') {
        sendNotFound(reply, 'Topic introuvable');
      } else {
        sendInternalError(reply, 'Erreur suppression topic', err);
      }
    }
  });

  // POST /admin/agent/topics/:id/test
  fastify.post('/topics/:id/test', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    config: { rateLimit: TEST_ROUTE_RATE_LIMIT },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const parsed = TestRegexBodySchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, 'sampleText requis');
      return;
    }
    try {
      const topic = await fastify.prisma.agentTopicCatalog.findUnique({ where: { id } });
      if (!topic) {
        sendNotFound(reply, 'Topic introuvable');
        return;
      }
      // Cette boucle exécutait des motifs d'appelant DANS la boucle
      // d'événements, sur 5 000 caractères d'appelant. `(a+)+$` y figeait le
      // gateway ENTIER — sockets, ZMQ, healthcheck — jusqu'au kill de Docker.
      // Les motifs en base datent d'avant `certifyPatterns` : garder la porte
      // sans garder la salle laisserait figer avec un motif écrit hier.
      // `matches[src] = -1` conserve la forme du fil (le testeur web l'affiche
      // déjà) ; `refused` dit ce que ce -1 recouvre.
      const { matches, refused } = await countMatchesOffLoop(
        topic.keywordPatterns,
        parsed.data.sampleText,
      );
      sendSuccess(reply, { matches, refused });
    } catch (err) {
      sendInternalError(reply, 'Erreur test regex', err);
    }
  });
}
