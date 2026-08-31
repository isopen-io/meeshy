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
          search: { type: 'string', description: 'Search by linkId, identifier, name' },
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

      if (search) {
        where.OR = [
          { linkId: { contains: search, mode: 'insensitive' } },
          { identifier: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const [shareLinks, totalCount] = await Promise.all([
        fastify.prisma.conversationShareLink.findMany({
          where,
          // #4157 — `linkId` EST le secret qui permet de REJOINDRE la
          // conversation (`middleware`/résolution de lien, cf. `content.ts`
          // ligne ~ci-dessous pour son homologue de recherche) : le servir en
          // LISTE à tout rôle `canManageConversations` (MODERATOR compris)
          // revient à distribuer autant d'invitations que de lignes de cette
          // page. `id` (l'ObjectId, déjà servi) reste la référence OPAQUE sur
          // laquelle la liste agit ; le secret lui-même ne se lit plus qu'au
          // travers du geste dédié `POST /share-links/:id/reveal` (S6, motif
          // écrit, tracé — voir plus bas).
          select: {
            id: true,
            identifier: true,
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
   * Le GESTE dédié qui révèle le `linkId` retiré de la liste ci-dessus (#4157,
   * critère 3). Rang SOUVERAIN (BIGBOSS seul — `requireSovereign`, pas
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
              properties: { id: { type: 'string' }, linkId: { type: 'string' } }
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
        select: { id: true, linkId: true }
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

      return sendSuccess(reply, { id: shareLink.id, linkId: shareLink.linkId });
    } catch (error) {
      logError(fastify.log, 'Reveal admin share link error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
