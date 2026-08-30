import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { sendError, sendSuccess } from '../../utils/response';
import { requirePermission } from '../../middleware/authorize';
import { getCacheStore } from '../../services/CacheStore';
import { circuitBreakerManager } from '../../utils/circuitBreaker';

/**
 * Les trois sondes de santé du gateway (#4219).
 *
 * ## Pourquoi ce fichier existe
 *
 * `apps/web/services/monitoring.service.ts` appelait `/health/ready`,
 * `/health/metrics` et `/health/circuit-breakers` depuis toujours. Aucune de
 * ces adresses n'était servie : les trois appels levaient, et l'onglet santé
 * de l'administration se rendait VIDE — pas en erreur, vide. Le défaut a
 * survécu parce qu'un écran vide ressemble à un écran sans données.
 *
 * Deux corrections étaient défendables : servir les sondes, ou replier
 * l'écran sur `GET /health`. Le dépôt SERT, pour une raison qui ne dépend pas
 * de cet écran — voir ci-dessous.
 *
 * ## `/health` n'est PAS une sonde de disponibilité, et ne peut pas le devenir
 *
 * `GET /health` (racine, `route-registration.ts`) compte les utilisateurs
 * (`prisma.user.count()` — un balayage de collection sur MongoDB), interroge
 * le service de traduction, et rend en clair l'environnement, la version, le
 * SHA de build et le nombre de comptes. C'est un point de DIAGNOSTIC, et
 * c'est pourtant lui que le `healthcheck` Docker appelle toutes les 30 s.
 * Le service de traduction a déjà tiré la leçon dans l'autre sens : il
 * expose `/live`, « réponse instantanée, sans await DB/ZMQ/modèles », parce
 * que `/health` flappait sous charge (`docker-compose.prod.yml:194`).
 *
 * Une sonde de DISPONIBILITÉ répond donc à une question différente — « cette
 * instance peut-elle servir du trafic ? » — et doit être PAUVRE : un verdict,
 * rien d'autre. Replier l'écran sur `/health` aurait, à l'inverse, ajouté des
 * champs à la surface la plus exposée du service.
 *
 * ## Les niveaux, déclarés et testés
 *
 * | route | niveau | qui l'appelle |
 * |---|---|---|
 * | `GET /api/v1/health/ready` | **S0** — anonyme | un orchestrateur, sans jeton |
 * | `GET /api/v1/health/metrics` | **S5** | l'onglet santé de l'administration |
 * | `GET /api/v1/health/circuit-breakers` | **S5** | idem |
 *
 * S0 veut dire que la charge ne divulgue RIEN de l'infrastructure : ni
 * version, ni SHA, ni environnement, ni hôte, ni nom de conteneur, ni
 * compteur, ni le message d'erreur du pilote de base (qui porte l'hôte et la
 * base dans son texte). Le verdict tient dans `{ status }` et le code HTTP —
 * 200 prêt, 503 pas prêt. La garde de ce contrat est une égalité de corps
 * ENTIER, pas une liste de clés interdites : une liste ne voit jamais le
 * champ que personne n'a pensé à y écrire.
 *
 * S5 = `canAccessAdmin` **et** `canViewAnalytics`, c'est-à-dire BIGBOSS,
 * ADMIN et AUDIT. L'intersection est volontaire : `canViewAnalytics` seule
 * admettrait ANALYST, qui n'a pas de panneau d'administration et n'a aucune
 * raison de lire le tas mémoire du processus ; `canAccessAdmin` seule
 * admettrait MODERATOR, dont le métier est le contenu, pas l'infrastructure.
 * Les internes du processus ne sont ni de l'analyse produit ni de la
 * modération : ils demandent les deux réponses à la fois.
 */

/** Durée de mémoïsation du verdict de disponibilité, en millisecondes. */
const TTL_VERDICT_MS = 2_000;

/**
 * Le verdict est mémoïsé DEUX secondes, et ce n'est pas une optimisation de
 * confort : `/api/v1/health/ready` doit être exempté du limiteur de débit
 * (un orchestrateur qui reçoit 429 conclut « instance morte » et redémarre le
 * conteneur — exactement le défaut décrit dans `middleware/rate-limiter.ts`),
 * et une route exemptée qui touche la base est un amplificateur : un appelant
 * anonyme y déclencherait autant de requêtes qu'il envoie de paquets. Le
 * mémo borne le coût à un ping toutes les 2 s quelle que soit la cadence
 * entrante, ce qui rend l'exemption sûre. Il vit dans la CLÔTURE du plugin,
 * pas au niveau module : chaque enregistrement a le sien, donc un test ne
 * peut pas hériter du verdict d'un autre.
 */
type Verdict = { readonly pris: number; readonly pret: boolean };

/** Le corps servi par `/health/ready` — sa forme entière, rien d'implicite. */
type CorpsDisponibilite = { readonly status: 'ready' | 'not-ready' };

type EtatDependance = {
  readonly status: 'up' | 'down';
  readonly latencyMs: number | null;
};

type CorpsMetriques = {
  readonly uptimeSeconds: number;
  readonly memory: { readonly heapUsed: number; readonly heapTotal: number; readonly rss: number };
  readonly database: EtatDependance;
  readonly redis: EtatDependance;
  readonly socketConnections: number;
};

type DisjoncteurServi = {
  readonly name: string;
  readonly state: string;
  readonly failures: number;
  readonly successes: number;
  readonly totalRequests: number;
  readonly lastFailure: string | null;
};

/**
 * Le ping de disponibilité. `$runCommandRaw({ ping: 1 })` plutôt qu'un
 * `count` : c'est la commande d'administration de MongoDB, elle ne lit aucune
 * collection et son coût ne croît pas avec la base — contrairement au
 * `user.count()` de `/health`, dont le prix augmente à mesure que le service
 * réussit.
 */
async function pingBase(prisma: { $runCommandRaw: (cmd: Record<string, unknown>) => Promise<unknown> }): Promise<number | null> {
  const debut = Date.now();
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    return Date.now() - debut;
  } catch {
    // Le message d'erreur du pilote porte l'hôte, le port et le nom de la
    // base. Il ne remonte NULLE PART : ni dans la charge S0, ni dans la
    // charge S5 — il n'y a aucune raison de le transporter jusqu'à un
    // navigateur alors que les journaux du service le tiennent déjà.
    return null;
  }
}

async function pingCache(): Promise<EtatDependance> {
  const store = getCacheStore();
  if (!store.isAvailable()) return { status: 'down', latencyMs: null };
  const debut = Date.now();
  try {
    await store.get('health:probe');
    return { status: 'up', latencyMs: Date.now() - debut };
  } catch {
    return { status: 'down', latencyMs: null };
  }
}

/**
 * Le nombre de connexions Socket.IO, s'il est lisible. Le décorateur
 * `socketIOHandler` n'existe qu'une fois `setupSocketIO()` passé, et le
 * harnais de la garde de routes le décore avec un objet NU : sonder la
 * méthode plutôt que l'objet évite de faire dépendre une route REST de
 * l'ordre d'amorçage du serveur.
 */
function compterConnexions(fastify: FastifyInstance): number {
  const handler = (fastify as unknown as { socketIOHandler?: { getConnectedUsers?: () => string[] } }).socketIOHandler;
  if (typeof handler?.getConnectedUsers !== 'function') return 0;
  try {
    return handler.getConnectedUsers().length;
  } catch {
    return 0;
  }
}

export async function healthProbeRoutes(fastify: FastifyInstance): Promise<void> {
  let memo: Verdict | null = null;

  /**
   * S0 — sonde de DISPONIBILITÉ, appelée sans aucune identité.
   *
   * Ce que la base répond décide seule : Redis retombe en cache mémoire
   * (`RedisCacheStore`) et le traducteur est asynchrone, donc ni l'un ni
   * l'autre ne rend l'instance incapable de servir du trafic. Les déclarer
   * ici ferait sortir des instances saines de la rotation à chaque hoquet
   * d'une dépendance dégradable — la panne inventée par la sonde.
   */
  fastify.get('/ready', async (_request: FastifyRequest, reply: FastifyReply) => {
    const maintenant = Date.now();
    if (!memo || maintenant - memo.pris > TTL_VERDICT_MS) {
      const latence = await pingBase(fastify.prisma as unknown as { $runCommandRaw: (c: Record<string, unknown>) => Promise<unknown> });
      memo = { pris: maintenant, pret: latence !== null };
    }

    if (!memo.pret) {
      // `not-ready` est un VERDICT, pas un diagnostic : ni la cause, ni la
      // dépendance en défaut, ni son adresse. Qui doit savoir POURQUOI lit les
      // journaux du service ou `/health/metrics`, derrière la porte S5.
      return sendError(reply, 503, 'not-ready', { code: 'NOT_READY' });
    }

    const corps: CorpsDisponibilite = { status: 'ready' };
    return sendSuccess(reply, corps);
  });

  /**
   * S5 — métriques de PROCESSUS. Distinctes de `/admin/analytics/*`, qui
   * porte de la donnée PRODUIT : mélanger les deux mettrait le tas mémoire et
   * l'état de Redis dans une route d'analyse, où personne ne penserait à
   * regarder qui la lit.
   */
  fastify.get('/metrics', {
    onRequest: [fastify.authenticate, requirePermission('canAccessAdmin'), requirePermission('canViewAnalytics')],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const memoire = process.memoryUsage();
    const [latenceBase, redis] = await Promise.all([
      pingBase(fastify.prisma as unknown as { $runCommandRaw: (c: Record<string, unknown>) => Promise<unknown> }),
      pingCache(),
    ]);

    const corps: CorpsMetriques = {
      uptimeSeconds: Math.round(process.uptime()),
      memory: { heapUsed: memoire.heapUsed, heapTotal: memoire.heapTotal, rss: memoire.rss },
      database: { status: latenceBase === null ? 'down' : 'up', latencyMs: latenceBase },
      redis,
      socketConnections: compterConnexions(fastify),
    };

    return sendSuccess(reply, corps);
  });

  /**
   * S5 — l'état des disjoncteurs, tel qu'il vit déjà en mémoire. Aucun état
   * n'est fabriqué ici : `circuitBreakerManager` est le registre, et cette
   * route n'en est que la porte. Un disjoncteur qui n'y est pas ENREGISTRÉ
   * reste invisible — la table sert ce que le registre tient, jamais une
   * liste écrite à la main qui divergerait le jour où un service en ajoute un.
   */
  fastify.get('/circuit-breakers', {
    onRequest: [fastify.authenticate, requirePermission('canAccessAdmin'), requirePermission('canViewAnalytics')],
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    const stats = circuitBreakerManager.getAllStats();
    const corps: DisjoncteurServi[] = Object.entries(stats).map(([name, s]) => ({
      name,
      state: s.state,
      failures: s.failures,
      successes: s.successes,
      totalRequests: s.totalRequests,
      // L'écran lit une date, le registre tient un epoch : la conversion vit
      // ici, du côté qui CONNAÎT l'unité, jamais chez le lecteur.
      lastFailure: s.lastFailureTime ? new Date(s.lastFailureTime).toISOString() : null,
    }));

    return sendSuccess(reply, corps);
  });
}
