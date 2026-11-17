/**
 * `/users/me/addresses` : mes adresses personnelles (#18863, chantier #18857).
 *
 * Le propriétaire les lit toutes (cercle, affichage, clics) ; la fiche, elle, ne sert chaque
 * adresse qu'au cercle choisi (`profile-addresses.ts`). Toujours l'utilisateur authentifié :
 * l'identifiant d'une adresse d'autrui est un 404, jamais un 403 qui la confirmerait.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { ADDRESS_GLYPHS, ADDRESS_TITLE_MAX_LENGTH } from '@meeshy/shared/utils/profile-addresses';
import { RELATION_LEVELS } from '@meeshy/shared/types/relation';
import { ProfileAddressService, type AddressInput, type Outcome } from '../../services/profile-addresses/ProfileAddressService';
import { sendBadRequest, sendConflict, sendNotFound, sendSuccess, sendUnauthorized } from '../../utils/response';
import { AUTH_ERROR_CODES } from '../../utils/auth-error-codes';
import type { AuthenticatedRequest } from './types';

const addressSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string', maxLength: ADDRESS_TITLE_MAX_LENGTH },
    url: { type: 'string' },
    glyph: { type: 'string', enum: [...ADDRESS_GLYPHS] },
    circle: { type: 'string', enum: [...RELATION_LEVELS] },
    position: { type: 'integer' },
    isShown: { type: 'boolean' },
    clicks: { type: 'integer' },
    trackedPath: { type: 'string' },
  },
} as const;

const listSchema = { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { addresses: { type: 'array', items: addressSchema } } } } };
const oneSchema = { type: 'object', properties: { success: { type: 'boolean' }, data: addressSchema } };

const bodyProperties = {
  url: { type: 'string' },
  title: { type: 'string' },
  glyph: { type: 'string' },
  circle: { type: 'string' },
  isShown: { type: 'boolean' },
  countClicks: { type: 'boolean' },
} as const;

function ownerOf(request: FastifyRequest): string | null {
  const context = (request as AuthenticatedRequest).authContext;
  return context?.isAuthenticated && context.registeredUser ? context.userId : null;
}

function answer<T>(reply: FastifyReply, outcome: Outcome<T>, statusCode = 200): void {
  if (outcome.ok === true) return sendSuccess(reply, outcome.value, { statusCode });
  const { status, error, code } = outcome.refusal;
  if (status === 404) return sendNotFound(reply, error);
  if (status === 409) return sendConflict(reply, error, { code });
  return sendBadRequest(reply, error, { code });
}

export async function meAddressRoutes(fastify: FastifyInstance) {
  const service = new ProfileAddressService(fastify.prisma);
  const guard = async (request: FastifyRequest, reply: FastifyReply): Promise<string | null> => {
    const userId = ownerOf(request);
    if (userId === null) sendUnauthorized(reply, 'Authentication required', { code: AUTH_ERROR_CODES.UNAUTHORIZED });
    return userId;
  };
  const common = { onRequest: [fastify.authenticate], tags: ['users'] };

  fastify.get('/users/me/addresses', {
    onRequest: common.onRequest,
    schema: { tags: common.tags, summary: 'My personal addresses', description: 'The authenticated user addresses, with their circle, visibility and click count.', response: { 200: listSchema, 401: errorResponseSchema } },
  }, async (request, reply) => {
    const userId = await guard(request, reply);
    if (userId === null) return;
    return sendSuccess(reply, { addresses: await service.list(userId) });
  });

  fastify.post('/users/me/addresses', {
    onRequest: common.onRequest,
    schema: {
      tags: common.tags, summary: 'Add a personal address',
      description: 'Adds an address (public http(s) site, title up to 24 characters, glyph, circle that sees it). Clicks are counted through a tracking link unless countClicks is false.',
      body: { type: 'object', properties: bodyProperties },
      response: { 201: oneSchema, 400: errorResponseSchema, 401: errorResponseSchema, 409: errorResponseSchema },
    },
  }, async (request: FastifyRequest<{ Body: AddressInput }>, reply) => {
    const userId = await guard(request, reply);
    if (userId === null) return;
    return answer(reply, await service.create(userId, request.body ?? {}), 201);
  });

  fastify.put('/users/me/addresses/order', {
    onRequest: common.onRequest,
    schema: {
      tags: common.tags, summary: 'Reorder my personal addresses',
      description: 'Lists every address id exactly once, in the new order.',
      body: { type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string' } } } },
      response: { 200: listSchema, 400: errorResponseSchema, 401: errorResponseSchema },
    },
  }, async (request: FastifyRequest<{ Body: { ids: string[] } }>, reply) => {
    const userId = await guard(request, reply);
    if (userId === null) return;
    const outcome = await service.reorder(userId, request.body.ids);
    return outcome.ok === true ? sendSuccess(reply, { addresses: outcome.value }) : answer(reply, outcome);
  });

  fastify.patch('/users/me/addresses/:id', {
    onRequest: common.onRequest,
    schema: {
      tags: common.tags, summary: 'Edit a personal address',
      body: { type: 'object', properties: bodyProperties },
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: oneSchema, 400: errorResponseSchema, 401: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request: FastifyRequest<{ Params: { id: string }; Body: AddressInput }>, reply) => {
    const userId = await guard(request, reply);
    if (userId === null) return;
    return answer(reply, await service.update(userId, request.params.id, request.body ?? {}));
  });

  fastify.delete('/users/me/addresses/:id', {
    onRequest: common.onRequest,
    schema: {
      tags: common.tags, summary: 'Delete a personal address',
      params: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
      response: { 200: { type: 'object', properties: { success: { type: 'boolean' } } }, 401: errorResponseSchema, 404: errorResponseSchema },
    },
  }, async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
    const userId = await guard(request, reply);
    if (userId === null) return;
    const outcome = await service.remove(userId, request.params.id);
    return outcome.ok === true ? sendSuccess(reply, { deleted: true }) : answer(reply, outcome);
  });
}
