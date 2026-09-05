/**
 * Les liens de partage vus par l'administration — la liste, et le geste
 * SOUVERAIN qui en révèle le secret (#4157, extrait par #4284).
 *
 * ## Pourquoi les deux portes vivent ENSEMBLE
 *
 * `GET /admin/share-links` sert une liste paginée dont le `linkId` — le secret
 * de jointure — est délibérément ABSENT : une liste d'administration n'a pas à
 * porter de quoi rejoindre chaque conversation qu'elle énumère.
 * `POST /admin/share-links/:id/reveal` est la porte par laquelle ce secret
 * s'obtient, une ligne à la fois, au rang SOUVERAIN, contre un motif écrit, et
 * tracée dans `AdminAuditLog`. La seconde n'a de sens que parce que la première
 * retient ; les tenir dans le même module rend cette dépendance lisible, au
 * lieu de la laisser se déduire de deux enregistrements voisins par hasard.
 *
 * ## Extraction (#4284)
 *
 * Déplacé de `routes/admin/content.ts`, qui avait franchi le budget de taille
 * des fichiers de routes écrits à la main (< 1000 lignes,
 * `route-file-size-budget.test.ts`) à 1026 lignes. Le découpage est par
 * RESPONSABILITÉ, selon le motif que ce répertoire emploie déjà
 * (`admin/agent.ts` → `admin/agent-configs.ts`, `admin/users.ts` →
 * `admin/user-reports.ts`, `admin/conversation-messages-sovereign.ts`).
 *
 * Ce bloc a été choisi pour une raison MESURÉE, pas par commodité de taille :
 * il ne contient AUCUNE lecture de `Message`. Son départ laisse donc intact le
 * décompte de `personal-history-hiding-surface-guard.test.ts` pour
 * `admin/content.ts`, et n'y ajoute aucune surface — la question ouverte de ce
 * cliquet (`declared 3, found 4` : la quatrième lecture est-elle voulue ?) est
 * une question de CONTENU, distincte du budget de taille, et elle reste posée
 * telle quelle après cette extraction.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendPaginatedSuccess, sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { permissionsService } from './services/PermissionsService';
import { type UserRole, type ShareLinkListQuery } from './types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validatePagination } from '../../utils/pagination';
import { withAnonymousParticipantCounts } from '../../utils/share-link-participant-counts';
import { requirePermission, requireSovereign, withAudit } from '../../middleware/authorize';

const requireAdmin = requirePermission('canAccessAdmin');

export function registerContentShareLinkRoutes(fastify: FastifyInstance): void {

  // Gestion des liens de partage - Liste avec pagination
  fastify.get('/share-links', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description: 'Get paginated list of conversation share links with filtering options. Requires canManageConversations permission.',
      tags: ['admin'],
      summary: 'List share links with pagination',
      security: [{ bearerAuth: [] }],
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Pagination offset', default: '0' },
          limit: { type: 'string', description: 'Pagination limit (max 100)', default: '20' },
          search: { type: 'string', description: 'Search by name — never by a join key (linkId/identifier), cf. #4693' },
          isActive: { type: 'string', enum: ['true', 'false'], description: 'Filter by active status' }
        }
      },
      response: {
        200: {
          description: 'Share links list successfully retrieved',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            // additionalProperties obligatoire : sans lui, fast-json-stringify
            // sérialise chaque lien en `{}` (tous les champs sont éjectés).
            data: { type: 'array', items: { type: 'object', additionalProperties: true } },
            pagination: {
              type: 'object',
              properties: {
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
                hasMore: { type: 'boolean' }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const user = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(user.role as UserRole);

      if (!permissions.canManageConversations) {
        return sendForbidden(reply, 'Permission insuffisante pour gerer les liens de partage');
      }

      /* istanbul ignore next -- Fastify schema applies defaults; destructuring defaults never reached */
      const { offset = '0', limit = '20', search, isActive } = request.query as ShareLinkListQuery;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit);

      // Construire les filtres
      const where: any = {};

      // #4693 — la recherche n'interroge plus AUCUNE clé de jointure.
      //
      // La réponse ne les sert plus (#4692), mais l'APPARTENANCE de la ligne à
      // la page répondait encore « ce `linkId` contient-il cette sous-chaîne ? ».
      // Un secret `mshy_` + 8 base62, comparé sans casse, s'extrait alors
      // caractère par caractère, au seuil `canManageConversations` — MODERATOR
      // compris. C'est la classe que #4387 a fermée sur `GET /admin/messages` :
      // « une SÉLECTION qui dépend du champ révèle autant que le champ ».
      //
      // La forme y était coûteuse (le prédicat de protection n'étant pas
      // exprimable en `where`, il fallait scanner une fenêtre bornée, filtrer,
      // puis paginer sur les `id` restants). Ici la colonne est connue AVANT la
      // requête : on ne l'interroge pas. Ce que ça COÛTE, et qui est assumé —
      // on ne retrouve plus un lien en collant son secret dans la recherche ;
      // on le retrouve par son nom, ou par la conversation qu'il ouvre.
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const [shareLinks, totalCount] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where,
          // #4157 / #4692 — aucune colonne de `SHARE_LINK_JOIN_KEY_COLUMNS`.
          //
          // `linkId` ET `identifier` ouvrent la porte de jointure,
          // indifféremment (`findShareLinkByKey`) : les servir en LISTE à tout
          // rôle `canManageConversations` (MODERATOR compris) revient à
          // distribuer autant d'invitations que de lignes de cette page. Le
          // premier lot n'avait retiré que `linkId` et appelait `id` « la
          // référence OPAQUE » — elle ne l'était pas : elle ouvrait la même
          // porte. #4692 a retiré l'ObjectId de la LOI plutôt que de la liste,
          // ce qui rend la phrase vraie et laisse à la console le seul
          // identifiant sur lequel elle AGIT (`DELETE /share-links/:id`,
          // `POST …/:id/reveal`, la navigation de la page).
          //
          // Les deux clés se lisent au geste dédié `POST /share-links/:id/reveal`
          // (S6, rang souverain, motif écrit, tracé — voir plus bas), qui les
          // rend TOUTES LES DEUX depuis #4692 : n'en révéler qu'une laisserait
          // le rang souverain incapable de nommer un lien que l'`identifier`
          // seul désigne.
          select: {
            id: true,
            name: true,
            description: true,
            maxUses: true,
            currentUses: true,
            maxConcurrentUsers: true,
            currentConcurrentUsers: true,
            expiresAt: true,
            isActive: true,
            allowAnonymousMessages: true,
            allowAnonymousFiles: true,
            allowAnonymousImages: true,
            createdAt: true,
            creator: {
              select: {
                id: true,
                username: true,
                displayName: true,
                avatar: true
              }
            },
            conversation: {
              select: {
                id: true,
                identifier: true,
                title: true,
                type: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.conversationShareLink.count({ where })
      ]);

      return sendPaginatedSuccess(
        reply,
        await withAnonymousParticipantCounts(fastify.prisma, shareLinks),
        {
          total: totalCount,
          limit: limitNum,
          offset: offsetNum,
          hasMore: offsetNum + shareLinks.length < totalCount
        }
      );

    } catch (error) {
      logError(fastify.log, 'Get admin share links error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });

  /**
   * POST /api/admin/share-links/:id/reveal
   *
   * Le GESTE dédié qui révèle les DEUX clés de jointure retirées de la liste
   * ci-dessus — `linkId` et `identifier` (#4157 critère 3, élargi par #4692 :
   * les deux ouvrent `findShareLinkByKey`, donc en retenir une seule ne
   * retenait rien). Rang SOUVERAIN (BIGBOSS seul — `requireSovereign`, pas
   * `canManageConversations` : une permission de domaine ne doit pas pouvoir
   * délivrer, en série, le secret de jointure de CHAQUE conversation de la
   * plateforme) ; motif écrit obligatoire, imposé par le schéma de requête
   * (`minLength: 10`, Fastify/AJV rejette AVANT que le handler ne s'exécute —
   * la garde du corps n'est donc pas redondante à réécrire ici) ; trace
   * d'audit écrite APRÈS la lecture réussie, jamais avant (`withAudit` est
   * best-effort et ne doit pas conditionner un geste qui a déjà eu lieu).
   */
  fastify.post('/share-links/:id/reveal', {
    onRequest: [fastify.authenticate, requireSovereign()],
    schema: {
      description: 'Révèle le linkId (secret de jointure) d\'un lien de partage. Rang souverain, motif écrit obligatoire, geste tracé — #4157.',
      tags: ['admin'],
      summary: 'Reveal a share link secret',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } }
      },
      body: {
        type: 'object',
        required: ['reason'],
        properties: {
          reason: { type: 'string', minLength: 10, description: 'Motif écrit de la révélation (10 caractères minimum), consigné dans AdminAuditLog' }
        }
      },
      response: {
        200: {
          description: 'Secret révélé',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                linkId: { type: 'string' },
                identifier: { type: 'string', description: 'Seconde clé de jointure, équivalente à linkId (#4692)' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const { reason } = request.body as { reason: string };

      const shareLink = await fastify.prisma.conversationShareLink.findUnique({
        where: { id },
        select: { id: true, linkId: true, identifier: true }
      });

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }

      const authContext = (request as UnifiedAuthRequest).authContext;
      await withAudit(request, {
        action: 'ADMIN_SHARE_LINK_REVEALED',
        entity: 'ConversationShareLink',
        entityId: shareLink.id,
        userId: authContext.registeredUser.id,
        reason,
      });

      return sendSuccess(reply, { id: shareLink.id, linkId: shareLink.linkId, identifier: shareLink.identifier });
    } catch (error) {
      logError(fastify.log, 'Reveal admin share link error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
