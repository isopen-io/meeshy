/**
 * `PUT /api/v1/me/profile-decor` (#10632, § 10.2) — équiper un contour d'avatar,
 * une bannière de design (le fond) et/ou un cadre de bannière (posé sur la
 * photo, #10932). `{ avatarRing?, banner?, bannerFrame? }` : champ absent =
 * inchangé, `null` = retiré. Validation par `validateProfileDecorWrite`
 * (domaine, possession → 403 `PACK_NOT_OWNED`, élément absent d'un pack
 * possédé → 404 `DECOR_ITEM_NOT_FOUND`, loi des cadres →
 * 403 `FRAME_USAGE_MISMATCH`). Diffusé en `profile:decor-updated` sur `user:<id>`
 * (mes autres appareils). La lecture se fait par `GET /me` et le profil public.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

import type { UnifiedAuthRequest } from '../../middleware/auth';
import { PACK_NOT_OWNED_CODE } from '../pack-routes';
import { PROFILE_DECOR_COLUMNS, servedProfileDecor, servedProfileDecorJsonSchema, validateProfileDecorWrite } from '../../services/appearance/profileDecor';
import { startupPackIndex, type PackIndex } from '../../services/packs/PackIndex';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import { logError } from '../../utils/logger';
import { sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess, sendUnauthorized } from '../../utils/response.js';
import { broadcastToUser } from '../../utils/socket-broadcast';

export const DECOR_ITEM_NOT_FOUND_CODE = 'DECOR_ITEM_NOT_FOUND';

export type ProfileDecorRoutesOptions = { readonly index?: PackIndex };

const refJsonSchema = {
  type: 'object',
  nullable: true,
  required: ['pack', 'item'],
  additionalProperties: false,
  properties: { pack: { type: 'string', maxLength: 24 }, item: { type: 'string', maxLength: 24 } },
} as const;


type Ref = { pack: string; item: string };
type Body = { avatarRing?: Ref | null; banner?: Ref | null; bannerFrame?: Ref | null };

export default async function profileDecorRoutes(fastify: FastifyInstance, options: ProfileDecorRoutesOptions = {}) {
  fastify.put<{ Body: Body }>(
    '/profile-decor',
    {
      onRequest: [fastify.authenticate],
      schema: {
        description: 'Équipe un contour d’avatar, une bannière de design et/ou un cadre de bannière possédés (#10632, #10932). Champ absent = inchangé, null = retiré.',
        tags: ['me', 'packs'],
        summary: 'Equip profile decor',
        body: { type: 'object', additionalProperties: false, properties: { avatarRing: refJsonSchema, banner: refJsonSchema, bannerFrame: refJsonSchema } },
        response: {
          200: { type: 'object', properties: { success: { type: 'boolean' }, data: servedProfileDecorJsonSchema } },
          400: errorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest<{ Body: Body }>, reply: FastifyReply) => {
      const authContext = (request as UnifiedAuthRequest).authContext;
      if (!authContext?.isAuthenticated || !authContext.registeredUser) return sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
      const userId = authContext.userId;
      const index = options.index ?? startupPackIndex();
      try {
        const outcome = await validateProfileDecorWrite({ prisma: fastify.prisma, index, userId, input: request.body ?? {} });
        if (outcome.kind === 'invalid') return sendError(reply, 400, 'Invalid profile decor', { code: 'INVALID_PROFILE_DECOR' });
        if (outcome.kind === 'not-owned') return sendForbidden(reply, 'Pack not owned', { code: PACK_NOT_OWNED_CODE });
        if (outcome.kind === 'item-not-found') return sendNotFound(reply, 'Decor item not found', { code: DECOR_ITEM_NOT_FOUND_CODE });
        if (outcome.kind === 'usage-mismatch') return sendForbidden(reply, 'This frame cannot be used on this side of the profile', { code: 'FRAME_USAGE_MISMATCH' });

        const row = await fastify.prisma.user.update({
          where: { id: userId },
          data: outcome.data,
          select: PROFILE_DECOR_COLUMNS,
        });
        const decor = servedProfileDecor(index, row);
        broadcastToUser(fastify, userId, SERVER_EVENTS.PROFILE_DECOR_UPDATED, { userId, decor, at: new Date().toISOString() });
        return sendSuccess(reply, decor);
      } catch (error) {
        logError(fastify.log, 'Error equipping profile decor:', error);
        return sendInternalError(reply, 'Error equipping profile decor');
      }
    },
  );
}
