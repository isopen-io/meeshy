import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { clientRateKey, callerRateKey } from '../../utils/client-rate-key';
import { createCustomRateLimiter } from '../../utils/rate-limiter.js';
import { computeETag, ifNoneMatchMatches } from '../../utils/etag';
import { permissionsService } from '../../services/admin/permissions.service';
import type { UnifiedAuthRequest } from '../../middleware/auth';
import type { UserRoleEnum } from '@meeshy/shared/types';
import { computeUserStats, servedUserStats } from '../user-stats';
import { publicProfileSchema, servirProfilPublic } from '../users/public-profile';
import { profileViewerId } from '../users/profile-block-gate';
import { getOptionalAuth } from '../users/presence-gate';
import { parseFieldList, parseTokenSet, restrictFields } from '../../utils/sparse-fieldset';
import { hasBlocked } from '../../utils/blocking';

const logger = enhancedLogger.child({ module: 'DirectoryPerson' });

/**
 * Les deux champs de PRÉSENCE, servis uniquement sur `?expand=presence`.
 *
 * La loi qui décide s'ils portent une valeur est inchangée (directive du
 * 2026-08-25, `gateProfilePresence`) : ce paramètre ne l'assouplit jamais, il
 * décide seulement si l'on POSE la question. Un écran de profil qui n'affiche
 * pas de pastille n'a aucune raison de faire résoudre une visibilité.
 */
const CHAMPS_PRESENCE = ['isOnline', 'lastActiveAt'] as const;

/**
 * L'identifiant du lecteur INSCRIT, ou `undefined`.
 *
 * `authContext.userId` ne peut pas servir de test de connexion : pour un
 * appelant sans aucune identité, `createUnauthenticatedContext` y pose la
 * SENTINELLE `'anonymous'` — une chaîne non vide, donc vraie. Mesuré en
 * intégration : un appelant anonyme recevait `Cache-Control: private` (le
 * cache partagé, seul intérêt d'un profil public, était perdu), était compté
 * sur le seau du CONNECTÉ — `user:anonymous`, partagé par tous les anonymes de
 * la Terre, donc épuisable par n'importe lequel d'entre eux — et `?expand=
 * relation` aurait interrogé `friendRequest` avec un identifiant que MongoDB
 * refuse.
 *
 * Le dépôt le dit déjà d'un autre côté : ce champ porte un `Participant.id`
 * pour un invité de lien partagé. Il NOMME une room personnelle, il n'atteste
 * pas une identité de compte. `registeredUser.id` est un `User.id` par
 * construction — et un invité de lien, qui n'a pas de compte, ne peut être ni
 * ami ni propriétaire : il lit ce que lit un anonyme, ce qui est juste.
 */
/* La lecture vit dans `routes/users/profile-block-gate.ts` depuis #7184 : la
   garde de blocage et cette route doivent désigner LE MÊME lecteur, sans quoi
   l'une garderait un viewer que l'autre ignore. */
const lecteurInscrit = profileViewerId;

/**
 * Ce qu'un `expand` peut demander. Tout autre jeton est ignoré, jamais refusé.
 *
 * Le DÉCOUPAGE est celui de `utils/sparse-fieldset.ts` (#4356) ; ce fichier ne
 * garde que son VOCABULAIRE. Les trois jetons n'ont d'ailleurs pas le même
 * coût, et c'est pour cela qu'`expand` reste distinct de `fields` :
 * `relation` et `stats` DÉCLENCHENT des requêtes, `presence` ne fait que
 * retenir une suppression.
 */
type Expansion = 'stats' | 'presence' | 'relation';
const EXPANSIONS: readonly Expansion[] = ['stats', 'presence', 'relation'] as const;

/**
 * La relation du LECTEUR au sujet — jamais l'inverse, et jamais entre tiers.
 *
 * `none` pour un lecteur anonyme : l'absence de compte n'est pas une absence de
 * relation qu'on aurait mesurée, mais l'impossibilité d'en avoir une. Les deux
 * se servent pareil, et c'est voulu — dire « je ne sais pas » ici apprendrait
 * seulement au client à traiter un troisième cas qui n'existe pas.
 *
 * ## `blockedByViewer` est un champ À CÔTÉ du fil, jamais une valeur DEDANS (#7125)
 *
 * Bloquer quelqu'un n'efface pas la ligne d'amitié : `relation` continue de
 * servir `friend` ou `pending_sent`, et c'est juste — débloquer doit rendre la
 * relation qu'on avait. Une sixième valeur `blocked` sur le MÊME fil écraserait
 * cette information, et l'écran ne saurait plus quoi afficher après le
 * déblocage. Les deux dimensions sont orthogonales ; la charge les sépare.
 *
 * Le champ existait déjà côté client, mais DÉDUIT du panier `GET /blocks` —
 * paginé à cent lignes. Au-delà de la centième personne bloquée, sa fiche
 * s'ouvrait entière (#7125) : du contenu masqué redevenait visible par le seul
 * effet du rang. La passerelle répond désormais PAR SUJET.
 *
 * ## `relationRequestId` — l'identifiant que la fiche doit ENVOYER (#7122)
 *
 * Dire « une demande est en attente » sans dire LAQUELLE oblige le client à
 * retrouver la ligne ailleurs : le profil de la v3.1 chargeait le panier
 * `GET /directory/friend-requests?direction=…&status=pending` et laissait
 * « Accepter » / « Refuser » / « Annuler » désactivés tant qu'il était en vol.
 * Un aller-retour de plus, sur la route dont le doc-comment dit qu'elle existe
 * pour les fondre en un — pour une colonne que la ligne PORTE déjà.
 *
 * **La surface de lecture ne bouge pas d'un pouce** : même `where`, même
 * ligne, une colonne de plus dans le `select`. La borne — les deux couples
 * `(viewer, cible)` — est ce qui garantit qu'un identifiant de demande
 * n'atteint que ses DEUX parties ; elle est gardée par un témoin qui évalue la
 * clause, et non par la relecture de ce commentaire.
 *
 * **`null` hors attente, jamais l'absence du champ** : `null` et « clé
 * absente » se lisent pareil en JavaScript, et c'est l'ambiguïté qui ferait
 * retomber un client sur le panier. Une amitié ACCEPTÉE porte pourtant encore
 * sa ligne — servir son identifiant offrirait un `PATCH` qui n'a plus de sens.
 */
type RelationServie = {
  readonly relation: string;
  readonly isSelf: boolean;
  readonly blockedByViewer: boolean;
  readonly relationRequestId: string | null;
};

const SANS_RELATION: RelationServie = { relation: 'none', isSelf: false, blockedByViewer: false, relationRequestId: null };

async function relationAvec(
  fastify: FastifyInstance,
  viewerId: string | undefined,
  cibleId: string
): Promise<RelationServie> {
  if (!viewerId) return SANS_RELATION;
  if (viewerId === cibleId) return { ...SANS_RELATION, relation: 'self', isSelf: true };

  /* Les deux questions sont INDÉPENDANTES — les sérialiser doublerait la
     latence de l'expansion la plus chère de la route pour rien. */
  const [lien, blockedByViewer] = await Promise.all([
    fastify.prisma.friendRequest.findFirst({
      where: {
        OR: [
          { senderId: viewerId, receiverId: cibleId },
          { senderId: cibleId, receiverId: viewerId },
        ],
      },
      select: { id: true, status: true, senderId: true },
    }),
    hasBlocked(fastify.prisma, viewerId, cibleId),
  ]);

  const fil = ((): string => {
    if (!lien) return 'none';
    if (lien.status === 'accepted') return 'friend';
    if (lien.status !== 'pending') return 'none';
    return lien.senderId === viewerId ? 'pending_sent' : 'pending_received';
  })();

  const enAttente = fil === 'pending_sent' || fil === 'pending_received';

  return { relation: fil, isSelf: false, blockedByViewer, relationRequestId: enAttente && lien ? lien.id : null };
}

/**
 * `GET /directory/people/:handle` — LE profil public, à UNE adresse (#4161).
 *
 * ## Ce que cette route remplace
 *
 * Cinq routes lisaient la même ligne sous trois formes de réponse, plus un
 * fantôme appelé par le web (`GET /users/profile/:id`, qui n'existe nulle
 * part). `GET /users/:id`, `GET /users/id/:id` et `GET /u/:username` restent
 * servis, en ALIAS d'une seule implémentation (`servirProfilPublic`) — un
 * profil s'ouvre depuis un lien partagé, et la queue des versions installées
 * est longue.
 *
 * ## Un aller-retour, pas deux
 *
 * Un écran de profil coûtait deux appels systématiques — `/users/:id` puis
 * `/users/:userId/stats` — jusqu'à trois selon l'hôte iOS. `?expand=stats` les
 * fond en un, et l'autorisation des compteurs intimes reste celle de la route
 * dédiée : `servedUserStats`, site UNIQUE de cette loi.
 *
 * ## Le cache conditionnel est CALCULÉ ici, et pas laissé au crochet global
 *
 * `conditionalGetOnSend` (`server.ts`) pose un ETag sur tout GET JSON 200 —
 * mais il se retire dès qu'une route déclare un `max-age` sans `no-cache`,
 * précisément ce que le profil anonyme veut déclarer. La route pose donc les
 * deux elle-même.
 *
 * **Le validateur est le hash de la charge SERVIE, pas de `updatedAt`.** Deux
 * raisons, et la première est une panne :
 *
 * 1. `User.updatedAt` ne bouge pas quand `postsCount`, `storiesCount` ou une
 *    demande d'ami changent. Un validateur adossé à cette colonne rendrait 304
 *    sur un `?expand=stats` PÉRIMÉ — un cache qui ment est pire qu'un cache
 *    absent.
 * 2. `updatedAt` est l'un des six champs que ce même lot retire de la surface
 *    publique. Un hachage de timestamp est de faible entropie, donc inversible
 *    par force brute sur une plage plausible : le publier sous forme de
 *    validateur le remettrait par la porte de derrière.
 *
 * La charge servie, elle, dépend déjà de tout ce qui la fait changer — présence
 * gatée par lecteur comprise.
 */
export async function directoryPersonRoutes(fastify: FastifyInstance) {
  const parAnonyme = createCustomRateLimiter(
    {
      max: 60,
      windowMs: 60 * 1000,
      keyPrefix: 'dir:profile:ip',
      message: 'Trop de consultations de profil. Veuillez patienter une minute.',
      keyGenerator: clientRateKey,
    },
    fastify.redis ?? undefined
  );

  const parConnecte = createCustomRateLimiter(
    {
      max: 240,
      windowMs: 60 * 1000,
      keyPrefix: 'dir:profile:u',
      message: 'Trop de consultations de profil. Veuillez patienter une minute.',
      keyGenerator: callerRateKey,
    },
    fastify.redis ?? undefined
  );

  const anonyme = parAnonyme.middleware();
  const connecte = parConnecte.middleware();

  /**
   * Deux seuils, un seul crochet — et le seau se choisit APRÈS l'auth.
   *
   * Un compte connecté se compte sur son identifiant (240/min : un écran de
   * profil, ses onglets, un retour arrière) ; un appelant sans compte se compte
   * sur son adresse (60/min), la seule clé qu'il ne choisit pas lui-même
   * (`clientRateKey`). Poser les deux crochets en parallèle ferait payer les
   * deux seaux au connecté.
   */
  const debit = async (request: FastifyRequest, reply: FastifyReply) =>
    lecteurInscrit(request) ? connecte(request, reply) : anonyme(request, reply);

  fastify.get('/people/:handle', {
    onRequest: [getOptionalAuth(fastify.prisma)],
    preHandler: [debit],
    schema: {
      description:
        'Read one public profile by ObjectId or username. S1 anonymous / S2 authenticated. Supports fields, expand=stats,presence,relation and If-None-Match.',
      tags: ['directory'],
      summary: 'Read a public profile',
      params: {
        type: 'object',
        required: ['handle'],
        properties: {
          handle: { type: 'string', description: 'MongoDB ObjectId or username (case-insensitive)' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          fields: { type: 'string', description: 'Comma-separated subset of the default projection' },
          expand: { type: 'string', description: 'Comma-separated: stats, presence, relation' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                ...publicProfileSchema.properties,
                // Les trois expansions, DÉCLARÉES : un champ produit et non
                // déclaré est supprimé par fast-json-stringify sans un mot.
                stats: {
                  type: 'object',
                  properties: {
                    languagesUsed: { type: 'number' },
                    memberDays: { type: 'number' },
                    postsCount: { type: 'number' },
                    reelsCount: { type: 'number' },
                    storiesCount: { type: 'number' },
                    languages: { type: 'array', items: { type: 'string' } },
                    achievements: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: {
                          id: { type: 'string' },
                          name: { type: 'string' },
                          description: { type: 'string' },
                          icon: { type: 'string' },
                          color: { type: 'string' },
                          isUnlocked: { type: 'boolean' },
                          progress: { type: 'number' },
                          threshold: { type: 'number' },
                          current: { type: 'number' },
                        },
                      },
                    },
                    // Les quatre INTIMES — servis à soi et à l'administration
                    // seulement (`servedUserStats`). Déclarés parce qu'ils
                    // partent dans ce cas ; absents de la charge sinon.
                    totalMessages: { type: 'number' },
                    totalConversations: { type: 'number' },
                    totalTranslations: { type: 'number' },
                    friendRequestsReceived: { type: 'number' },
                  },
                },
                relation: { type: 'string' },
                isSelf: { type: 'boolean' },
                blockedByViewer: { type: 'boolean' },
                // `nullable` parce que `null` est une RÉPONSE ici — « aucune
                // demande à envoyer » — et non l'absence d'un champ.
                relationRequestId: { type: 'string', nullable: true },
              },
            },
          },
        },
        404: errorResponseSchema,
        429: errorResponseSchema,
        500: errorResponseSchema,
      },
    },
  }, async (request: FastifyRequest<{ Params: { handle: string } }>, reply: FastifyReply) => {
    try {
      const { handle } = request.params;
      const { fields, expand } = request.query as { fields?: string; expand?: string };

      const acteur = (request as unknown as UnifiedAuthRequest).authContext;
      const viewerId = lecteurInscrit(request);

      // La liste est analysée AVANT la lecture : elle gouverne le `select`
      // Prisma autant que la réponse (#4356). Une projection qui n'arriverait
      // qu'après le chargement n'aurait allégé que le fil.
      const champs = parseFieldList(fields);

      const profil = await servirProfilPublic(fastify, request, reply, handle, champs);
      if (!profil) return reply;

      const demande = parseTokenSet(expand, EXPANSIONS);

      // La présence est RETIRÉE par défaut, jamais ajoutée par ce paramètre :
      // `servirProfilPublic` a déjà appliqué la loi du 2026-08-25, et ce qui
      // sort ici en est au mieux une part. L'inverse — poser la question
      // seulement sur `expand` — ferait de l'omission du paramètre une garde,
      // c'est-à-dire une garde qu'un appelant peut lever.
      if (!demande.has('presence')) {
        for (const champ of CHAMPS_PRESENCE) delete profil[champ];
      }

      const cibleId = String(profil.id);

      if (demande.has('relation')) {
        Object.assign(profil, await relationAvec(fastify, viewerId, cibleId));
      }

      if (demande.has('stats')) {
        const stats = await computeUserStats(fastify.prisma, cibleId);
        profil.stats = servedUserStats(stats, {
          estSoi: viewerId === cibleId,
          estAdministration: permissionsService.hasPermission(
            (acteur?.registeredUser?.role ?? 'USER') as UserRoleEnum,
            'canViewUsers'
          ),
        });
      }

      const servi = restrictFields(profil, champs, epinglesServis(demande));

      // `public` uniquement pour l'ANONYME, et c'est une condition de sécurité,
      // pas un réglage de performance : la charge d'un lecteur connecté dépend
      // de LUI (présence gatée, compteurs intimes, relation), et un cache
      // partagé la servirait à quelqu'un d'autre. `Vary: Authorization` le dit
      // aussi aux intermédiaires qui, eux, ne lisent pas ce commentaire.
      reply.header('Vary', 'Authorization');
      reply.header(
        'Cache-Control',
        viewerId
          ? 'private, max-age=60, stale-while-revalidate=600'
          : 'public, max-age=60, stale-while-revalidate=600'
      );

      const enveloppe = { success: true, data: servi };
      const etag = computeETag(enveloppe);
      reply.header('ETag', etag);
      if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
        return reply.code(304).send();
      }

      return sendSuccess(reply, servi);
    } catch (error) {
      logger.error('Erreur de lecture de profil', error as Error);
      return sendInternalError(reply, 'Erreur lors de la lecture du profil');
    }
  });
}

/**
 * Les clés qui survivent à `fields` sans y être nommées.
 *
 * `fields` ne peut que RESTREINDRE : un paramètre de projection qui ÉLARGIT est
 * une porte — il suffirait de demander `fields=email` pour que la garde posée à
 * la source devienne décorative. Un nom inconnu ne fabrique donc rien, ni dans
 * la réponse ni dans le `select` (§ bornes de `utils/sparse-fieldset.ts`).
 *
 * Deux familles échappent au filtre, et pour la même raison — elles ont été
 * demandées EXPLICITEMENT, par un autre paramètre :
 *
 * - `id`, sans quoi la réponse ne dirait plus de qui elle parle ;
 * - les blocs des expansions obtenues, que les faire disparaître obligerait à
 *   nommer deux fois.
 *
 * `presence` n'y figure pas : ses deux champs sont RETIRÉS par défaut plus haut,
 * et `expand=presence` décide seulement si l'on POSE la question — jamais de la
 * réponse, que la loi du 2026-08-25 tranche seule.
 */
function epinglesServis(demande: ReadonlySet<Expansion>): readonly string[] {
  const epingles = ['id'];
  if (demande.has('stats')) epingles.push('stats');
  if (demande.has('relation')) epingles.push('relation', 'isSelf', 'blockedByViewer', 'relationRequestId');
  return epingles;
}
