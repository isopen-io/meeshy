import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../../utils/logger';
import { SecuritySanitizer } from '../../utils/sanitize';
import {
  sendSuccess,
  sendForbidden,
  sendBadRequest,
  sendNotFound,
  sendInternalError
} from '../../utils/response.js';
import { MemberRole } from '@meeshy/shared/types/role-types';
import { actorHasMinimumRole } from '../../utils/conversation-authority';
import {
  createUnifiedAuthMiddleware,
  UnifiedAuthRequest,
  isRegisteredUser
} from '../../middleware/auth';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  updateLinkSchema,
  updateLinkBodySchema,
  shareLinkSchema
} from './types';
import { revokeShareLinkGuests } from '../../socketio/revokeShareLinkGuests';

/**
 * Le verdict d'autorisation d'un geste de gestion sur un lien — trois issues,
 * jamais un booléen : le 404 (identifiant public introuvable) et le 403
 * (trouvé, mais ni créateur ni modérateur) sont deux refus de nature
 * différente et les quatre portes appelantes doivent pouvoir les distinguer
 * sans reparcourir la logique de rang.
 */
export type ShareLinkManagementLoad =
  | { readonly outcome: 'not-found' }
  | { readonly outcome: 'forbidden' }
  | { readonly outcome: 'ok'; readonly id: string };

/**
 * Le bloc UNIQUE « charger un lien par son identifiant PUBLIC et décider qui a
 * le droit de le gérer » — recopié QUATRE fois avant #4170 (`PATCH`
 * ci-dessous, `/toggle`, `/extend`, `DELETE` dans `admin.ts`), chacune avec
 * son propre `findFirst` et son propre calcul `isCreator`/`isConversationAdmin`.
 * Le seuil EFFECTIF d'une règle recopiée quatre fois est celui de sa copie la
 * plus permissive le jour où l'une d'elles dérive — c'est exactement ce que
 * l'audit de #4170 a trouvé sur la lecture (`creatorId` contre `createdBy`
 * dans `conversations/sharing.ts`) et ce qu'une source UNIQUE empêche
 * structurellement de reproduire ici.
 *
 * Charger par l'identifiant PUBLIC seul — jamais `createdBy: userId` dans le
 * `where` : cela rendrait `isCreator` tautologique et `isConversationAdmin`
 * ne déciderait plus rien, un hôte non-créateur recevant un 404 « introuvable »
 * là où la route promet un verdict (#4007, commentaire porté par les quatre
 * copies avant unification).
 */
export async function loadShareLinkForManagement(
  fastify: FastifyInstance,
  userId: string,
  platformRole: string | null | undefined,
  publicLinkId: string
): Promise<ShareLinkManagementLoad> {
  const link = await fastify.prisma.conversationShareLink.findFirst({
    where: { linkId: publicLinkId },
    include: {
      conversation: {
        include: {
          participants: {
            where: { userId, isActive: true }
          }
        }
      }
    }
  });

  if (!link) {
    return { outcome: 'not-found' };
  }

  const isCreator = link.createdBy === userId;
  // Le rang de conversation replie sa casse (#3875) et l'administrateur de la
  // plateforme agit avec les droits du créateur (#3941) : un lien de partage
  // est une affaire d'administration de conversation comme une autre. `some`
  // sur une liste déjà filtrée sur l'appelant (`where: { userId }` ci-dessus).
  const isConversationAdmin = link.conversation.participants.some(member =>
    actorHasMinimumRole(
      { conversationRole: member.role, platformRole },
      MemberRole.MODERATOR,
    )
  );

  if (!isCreator && !isConversationAdmin) {
    return { outcome: 'forbidden' };
  }

  return { outcome: 'ok', id: link.id };
}

/**
 * L'ÉCRITURE unique d'un lien de partage, et l'effet de bord qui doit la suivre.
 *
 * Trois routes écrivaient ce bloc — `PATCH /links/:linkId` ici, `/toggle` et
 * `/extend` dans `admin.ts` — chacune avec sa propre projection `include` et
 * sa propre décision de révoquer, ou non, les invités déjà entrés. C'est cette
 * recopie qui avait produit la divergence que le commentaire de `PATCH`
 * décrivait (#4170) : `/toggle` révoquait, `PATCH` acceptait `isActive: false`
 * sans révoquer, et le seuil EFFECTIF d'une règle recopiée est celui de sa
 * copie la plus permissive.
 *
 * La révocation est donc portée ICI et non chez l'appelant — un appelant qui
 * l'oublie ferme la porte sans vider la salle, et l'oubli ne se voit pas :
 * la ligne du lien est bien à `isActive: false`, la liste rend le bon état,
 * et les invités continuent de recevoir chaque message.
 *
 * `data.isActive === false`, jamais `body.isActive` : un corps qui ne nomme
 * pas `isActive` ne doit rien révoquer, et un `PATCH` qui le pose à `true`
 * ne rend rien à personne — une ligne `Participant` close ne se rouvre que
 * par la porte d'entrée.
 */
export async function applyShareLinkUpdate(
  fastify: FastifyInstance,
  linkRowId: string,
  data: Record<string, unknown>
) {
  // AVANT la fermeture, et pas après — l'ordre est celui que `DELETE
  // /links/:linkId` argumentait déjà pour lui seul, et son argument vaut pour
  // les trois : `Participant.shareLinkId` est une colonne NUE (aucune relation
  // Prisma, donc aucune cascade), et une ligne de lien devenue inactive ne
  // relie plus rien à un invité qui resterait connecté par erreur. Révoquer
  // d'abord fait échouer FERMÉ : si la révocation lève, le lien reste actif et
  // la reprise est idempotente. L'ordre inverse laisse l'état exactement
  // interdit — lien fermé, invités encore dans la room.
  if (data.isActive === false) {
    await revokeShareLinkGuests({
      prisma: fastify.prisma,
      io: fastify.socketIOHandler?.getManager()?.getIO(),
      manager: fastify.socketIOHandler?.getManager(),
      shareLinkId: linkRowId,
    });
  }

  return fastify.prisma.conversationShareLink.update({
    where: { id: linkRowId },
    data,
    include: SHARE_LINK_MANAGEMENT_INCLUDE,
  });
}

/**
 * La projection que les trois écritures rendaient, à l'identique et
 * séparément. Une quatrième copie serait la première à pouvoir diverger.
 */
const SHARE_LINK_MANAGEMENT_INCLUDE = {
  conversation: {
    select: {
      id: true,
      title: true,
      description: true,
      type: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  creator: {
    select: {
      id: true,
      username: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatar: true,
    },
  },
} as const;

export async function registerManagementRoutes(fastify: FastifyInstance) {
  const authRequired = createUnifiedAuthMiddleware(fastify.prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  // Route PATCH pour mettre à jour un lien (compatible avec le frontend)
  fastify.patch('/links/:linkId', {
    onRequest: [authRequired],
    schema: {
      description: 'Update a share link configuration by linkId. Only the link creator or conversation administrators/moderators can update. All fields in the request body are optional and will only update if provided. Returns full link details with conversation and creator information.',
      tags: ['links'],
      summary: 'Update share link (by linkId)',
      params: {
        type: 'object',
        required: ['linkId'],
        properties: {
          linkId: {
            type: 'string',
            description: 'Public link identifier (mshy_*)',
            example: 'mshy_67890abcdef12345_a1b2c3d4'
          }
        }
      },
      body: updateLinkBodySchema,
      response: {
        200: {
          description: 'Share link updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: shareLinkSchema,
            message: { type: 'string', example: 'Lien mis à jour avec succès' }
          }
        },
        400: {
          description: 'Bad request - invalid data',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - insufficient permissions',
          ...errorResponseSchema
        },
        404: {
          description: 'Share link not found',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request: UnifiedAuthRequest, reply: FastifyReply) => {
    try {
      const { linkId } = request.params as { linkId: string };
      const body = updateLinkSchema.parse(request.body);

      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const userId = request.authContext.registeredUser!.id;
      const platformRole = request.authContext.registeredUser?.role;

      const loaded = await loadShareLinkForManagement(fastify, userId, platformRole, linkId);
      if (loaded.outcome === 'not-found') {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }
      if (loaded.outcome === 'forbidden') {
        return sendForbidden(reply, 'Permissions insuffisantes pour modifier ce lien');
      }

      const updateData: any = {};

      if (body.name !== undefined) updateData.name = SecuritySanitizer.sanitizeText(body.name);
      if (body.description !== undefined) updateData.description = SecuritySanitizer.sanitizeText(body.description);
      if (body.maxUses !== undefined) updateData.maxUses = body.maxUses;
      if (body.maxConcurrentUsers !== undefined) updateData.maxConcurrentUsers = body.maxConcurrentUsers;
      if (body.maxUniqueSessions !== undefined) updateData.maxUniqueSessions = body.maxUniqueSessions;
      if (body.expiresAt !== undefined) updateData.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      if (body.isActive !== undefined) updateData.isActive = body.isActive;
      if (body.allowAnonymousMessages !== undefined) updateData.allowAnonymousMessages = body.allowAnonymousMessages;
      if (body.allowAnonymousFiles !== undefined) updateData.allowAnonymousFiles = body.allowAnonymousFiles;
      if (body.allowAnonymousImages !== undefined) updateData.allowAnonymousImages = body.allowAnonymousImages;
      if (body.allowViewHistory !== undefined) updateData.allowViewHistory = body.allowViewHistory;
      if (body.requireAccount !== undefined) updateData.requireAccount = body.requireAccount;
      if (body.requireNickname !== undefined) updateData.requireNickname = body.requireNickname;
      if (body.requireEmail !== undefined) updateData.requireEmail = body.requireEmail;
      if (body.requireBirthday !== undefined) updateData.requireBirthday = body.requireBirthday;
      if (body.allowedCountries !== undefined) updateData.allowedCountries = body.allowedCountries;
      if (body.allowedLanguages !== undefined) updateData.allowedLanguages = body.allowedLanguages;
      if (body.allowedIpRanges !== undefined) updateData.allowedIpRanges = body.allowedIpRanges;

      // #4351 — l'écriture ET sa révocation vivent dans `applyShareLinkUpdate`,
      // le site unique partagé avec `/toggle` et `/extend`.
      const updatedLink = await applyShareLinkUpdate(fastify, loaded.id, updateData);

      return sendSuccess(reply, updatedLink, { message: 'Lien mis à jour avec succès' });

    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Données invalides');
      }
      logError(fastify.log, 'Update link error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
