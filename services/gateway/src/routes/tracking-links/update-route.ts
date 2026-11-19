import type { FastifyInstance, FastifyReply, onRequestHookHandler } from 'fastify';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { TRACKING_TARGET_IMMUTABLE, TrackingTargetCarriesEmailSecretError, hasImmutableTarget, isServableTrackingTarget } from '../../services/tracking-link-target';
import { logError } from '../../utils/logger';
import { UnifiedAuthRequest, isRegisteredUser } from '../../middleware/auth';
import { trackingLinkSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { sendSuccess, sendInternalError, sendNotFound, sendForbidden, sendBadRequest, sendConflict } from '../../utils/response';
import { SecuritySanitizer } from '../../utils/sanitize';
import { isHttpUrl } from '@meeshy/shared/utils/validation';
import { permissionsService } from '../../services/admin/permissions.service';
import { UserRoleEnum } from '@meeshy/shared/types';
import { isForeignAddressLink, mayManageTrackingLink } from './link-ownership';
import { enrichTrackingLink, updateTrackingLinkLabelsSchema } from './types';
import { refuserCibleSecrete } from './secret-target-refusal';

/** Un libellé fourni est nettoyé ; `null` (effacer) et l'absence passent tels quels. */
const propre = (v: string | null | undefined) => (v ? SecuritySanitizer.sanitizeText(v) : v);

export type UpdateRouteContext = {
  readonly fastify: FastifyInstance;
  readonly trackingLinkService: TrackingLinkService;
  readonly authRequired: onRequestHookHandler;
};

/** La MODIFICATION d'un lien de suivi, extraite de `creation.ts` (budget de taille). */
export function registerUpdateRoute(ctx: UpdateRouteContext): void {
  /**
   * 10. Mettre à jour un lien de tracking
   * PATCH /api/tracking-links/:token
   */
  ctx.fastify.patch('/tracking-links/:token', {
    onRequest: [ctx.authRequired],
    schema: {
      description: 'Update tracking link properties. Only the creator can update their links. Allows changing the original URL, expiration date, active status, or even the token itself. All fields are optional - only provided fields will be updated.',
      tags: ['tracking-links'],
      summary: 'Update tracking link',
      params: {
        type: 'object',
        required: ['token'],
        properties: {
          token: {
            type: 'string',
            pattern: '^[a-zA-Z0-9_-]{2,50}$',
            description: 'Current unique alphanumeric tracking token (2-50 chars)'
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          originalUrl: {
            type: 'string',
            format: 'uri',
            description: 'New original URL to redirect to'
          },
          expiresAt: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'New expiration date (null to remove expiration)'
          },
          isActive: {
            type: 'boolean',
            description: 'Whether the link is active'
          },
          name: { type: 'string', maxLength: 32, nullable: true, description: 'Link display name (null clears it)' },
          campaign: { type: 'string', maxLength: 100, nullable: true, description: 'UTM campaign (null clears it)' },
          source: { type: 'string', maxLength: 100, nullable: true, description: 'UTM source (null clears it)' },
          medium: { type: 'string', maxLength: 100, nullable: true, description: 'UTM medium (null clears it)' },
          newToken: {
            type: 'string',
            pattern: '^[a-zA-Z0-9][a-zA-Z0-9_-]{0,48}[a-zA-Z0-9]$',
            description: 'New token (2-50 chars, cannot start or end with dash)'
          }
        }
      },
      response: {
        200: {
          description: 'Tracking link updated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                trackingLink: {
                  ...trackingLinkSchema,
                  properties: {
                    ...trackingLinkSchema.properties,
                    fullUrl: { type: 'string', description: 'Complete tracking URL' }
                  }
                }
              }
            },
            message: { type: 'string', example: 'Lien mis à jour avec succès' }
          }
        },
        400: {
          description: 'Invalid request data (bad URL or token format)',
          ...errorResponseSchema
        },
        403: {
          description: 'Access denied - only creator can update',
          ...errorResponseSchema
        },
        404: {
          description: 'Tracking link not found',
          ...errorResponseSchema
        },
        409: {
          description: 'Conflict - new token already exists',
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
      const { token } = request.params as { token: string };
      const body = request.body as {
        originalUrl?: string;
        expiresAt?: string | null;
        isActive?: boolean;
        newToken?: string;
      };
      const libelles = updateTrackingLinkLabelsSchema.safeParse(body ?? {});
      if (!libelles.success) {
        return sendBadRequest(reply, 'Nom (32 caractères) ou UTM (100 caractères) invalide');
      }

      if (!isRegisteredUser(request.authContext)) {
        return sendForbidden(reply, 'Utilisateur enregistré requis');
      }

      const userId = request.authContext.registeredUser!.id;

      const trackingLink = await ctx.trackingLinkService.getTrackingLinkByToken(token);

      if (!trackingLink || isForeignAddressLink(trackingLink, request.authContext)) {
        return sendNotFound(reply, 'Lien de tracking non trouvé');
      }

      if (!mayManageTrackingLink(trackingLink, { id: userId, role: request.authContext.registeredUser!.role })) {
        return sendForbidden(reply, 'Seul le créateur peut modifier ce lien');
      }

      if (body.newToken && !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,48}[a-zA-Z0-9]$/.test(body.newToken)) {
        return sendBadRequest(reply, 'Le token doit contenir 2-50 caractères alphanumériques et ne peut pas commencer ou finir par un tiret');
      }

      const isPrivileged = permissionsService.hasPermission(
        request.authContext.registeredUser!.role as UserRoleEnum, 'canModerateContent'
      );
      if (body.newToken && body.newToken.length < 5 && !isPrivileged) {
        return sendBadRequest(reply, 'Le token doit contenir au moins 5 caractères');
      }

      if (body.originalUrl !== undefined && hasImmutableTarget(trackingLink)) {
        return sendBadRequest(reply, 'La destination d\'un lien vers un contenu Meeshy ne se modifie pas', {
          code: TRACKING_TARGET_IMMUTABLE
        });
      }

      // `new URL()` ne fait que parser : `javascript:` et `data:` passaient,
      // et l'édition rouvrait donc le vecteur que la création interdit.
      if (body.originalUrl && !isHttpUrl(body.originalUrl)) {
        return sendBadRequest(reply, 'URL invalide : http(s) uniquement');
      }
      if (body.originalUrl !== undefined && !isServableTrackingTarget(body.originalUrl)) {
        return refuserCibleSecrete(reply);
      }

      const updatedLink = await ctx.trackingLinkService.updateTrackingLink({
        token,
        originalUrl: body.originalUrl,
        expiresAt: body.expiresAt === null ? null : (body.expiresAt ? new Date(body.expiresAt) : undefined),
        isActive: body.isActive,
        newToken: body.newToken,
        name: propre(libelles.data.name),
        campaign: propre(libelles.data.campaign),
        source: propre(libelles.data.source),
        medium: propre(libelles.data.medium)
      });

      return sendSuccess(reply, { trackingLink: enrichTrackingLink(updatedLink) }, { message: 'Lien mis à jour avec succès' });

    } catch (error) {
      if (error instanceof TrackingTargetCarriesEmailSecretError) {
        return refuserCibleSecrete(reply);
      }
      if (error instanceof Error) {
        if (error.message === 'Tracking link not found') {
          return sendNotFound(reply, 'Lien de tracking non trouvé');
        }
        if (error.message === 'Token already exists') {
          return sendConflict(reply, 'Ce token existe déjà');
        }
      }

      logError(ctx.fastify.log, 'Update tracking link error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
