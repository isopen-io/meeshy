/**
 * LE PARTAGE SANS CONTACT (#19205) — `POST /me/contact-exchange` émet le jeton que la charge NFC
 * ou le QR transporte ; `POST /contact-exchange/:token/accept` le reçoit. Compte inscrit seulement
 * (#10205) : `authenticate` refuse une session anonyme, et un invité reçoit `ACCOUNT_REQUIRED`.
 *
 * Derrière `CONTACT_EXCHANGE_ENABLED` (éteint par défaut, `contactExchangeFlag.ts`) : éteint, les
 * deux routes répondent comme des routes qui n'existent pas. Le débit est plafonné par compte, et
 * tout refus d'acceptation est le même 404 — rien ne distingue un jeton inconnu, rejoué, échu ou
 * celui d'un compte qui bloque le lecteur.
 *
 * Les réponses sont déclarées CHAMP PAR CHAMP : la vitrine suit `publicProfileSchema`, et rien de
 * ce qu'elle ne déclare (numéro, e-mail) ne peut sortir par ce canal.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  CONTACT_EXCHANGE_ERROR_CODES,
  CONTACT_EXCHANGE_LOCKED,
  CONTACT_EXCHANGE_OFFERS,
  type ContactExchangeErrorCode,
} from '@meeshy/shared/types/contact-exchange';
import { acceptContactExchange, issueContactExchange, type ContactExchangeDeps } from '../services/contactExchange/contactExchange';
import { contactExchangeEnabled } from '../services/contactExchange/contactExchangeFlag';
import { getCacheStore } from '../services/CacheStore';
import { isGuestViewer, sendAccountRequired, type GuestViewerContext } from '../services/guests/guestMemberVisibility';
import { loadPrivacyPreferencesCached } from '../services/preferences/privacy-cache';
import { PRIVACY_PREFERENCES_DEFAULTS } from '../config/user-preferences-defaults';
import { relationIoOf } from '../socketio/relationEvents';
import { logError } from '../utils/logger';
import { sendError, sendInternalError, sendNotFound, sendSuccess } from '../utils/response';
import { envoyerDemande } from './directory/friend-requests-core';
import { relationLimiter } from './relations/shared';
import { composePublicProfile, publicProfileSchema, publicUserSelect } from './users/public-profile';

const STATUS: Record<ContactExchangeErrorCode, number> = {
  [CONTACT_EXCHANGE_ERROR_CODES.INVALID]: 400,
  [CONTACT_EXCHANGE_ERROR_CODES.UNAVAILABLE]: 404,
};

const offersSchema = { type: 'array', items: { type: 'string', enum: [...CONTACT_EXCHANGE_OFFERS] } } as const;
const lockedSchema = { type: 'array', items: { type: 'string', enum: [...CONTACT_EXCHANGE_LOCKED] } } as const;
const personSchema = {
  type: 'object',
  properties: { id: { type: 'string' }, username: { type: 'string' }, displayName: { type: 'string', nullable: true }, avatar: { type: 'string', nullable: true } },
} as const;
const envelope = (data: Record<string, unknown>) => ({ type: 'object', properties: { success: { type: 'boolean' }, data } }) as const;
const errors = { 400: errorResponseSchema, 401: errorResponseSchema, 403: errorResponseSchema, 404: errorResponseSchema, 429: errorResponseSchema, 500: errorResponseSchema, 503: errorResponseSchema } as const;

const issuedSchema = envelope({
  type: 'object',
  properties: { token: { type: 'string' }, expiresAt: { type: 'string' }, offers: offersSchema, locked: lockedSchema },
});

const acceptedSchema = envelope({
  type: 'object',
  properties: {
    issuer: personSchema,
    offers: offersSchema,
    profile: publicProfileSchema,
    friendRequest: { type: 'string', enum: ['sent', 'not-sent'] },
    locked: lockedSchema,
  },
});

/** Éteint : la route n'existe pas. Invité : un compte est requis (#10205). */
async function contactExchangeGate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!contactExchangeEnabled()) {
    sendNotFound(reply, 'Route not found');
    return reply;
  }
  if (isGuestViewer((request as FastifyRequest & { authContext?: GuestViewerContext }).authContext)) {
    sendAccountRequired(reply, 'A Meeshy account is required for contactless sharing');
    return reply;
  }
}

/**
 * La requête que voit le cœur des demandes : la MÊME (le lecteur reste le viewer des gardes de
 * présence), sans l'idempotence du lecteur — la demande s'inscrit au journal de l'ÉMETTEUR, et
 * une clé du lecteur n'y a pas sa place. L'usage unique du jeton tient déjà le rejeu.
 */
const withoutReaderMutationId = (request: FastifyRequest): FastifyRequest =>
  Object.create(request, { clientMutationId: { value: undefined, enumerable: true } }) as FastifyRequest;

async function readerAcceptsRequests(fastify: FastifyInstance, readerId: string): Promise<boolean> {
  try {
    const stored = (await loadPrivacyPreferencesCached(fastify.prisma, [readerId])).get(readerId) ?? {};
    return stored.allowContactRequests ?? PRIVACY_PREFERENCES_DEFAULTS.allowContactRequests;
  } catch {
    return false;
  }
}

function contactExchangeDepsOf(fastify: FastifyInstance, request: FastifyRequest): ContactExchangeDeps {
  const cache = getCacheStore();
  return {
    prisma: fastify.prisma,
    io: relationIoOf(fastify),
    now: () => Date.now(),
    store: {
      put: (key, value, ttlSeconds) => cache.set(key, value, ttlSeconds),
      read: (key) => cache.get(key),
      claim: (key, ttlSeconds) => cache.setnx(key, '1', ttlSeconds),
    },
    vitrine: async (issuerId) => {
      const user = await fastify.prisma.user.findUnique({ where: { id: issuerId }, select: publicUserSelect });
      return user ? ((await composePublicProfile(fastify, request, user)) as unknown as Record<string, unknown>) : null;
    },
    acceptsRequests: (readerId) => readerAcceptsRequests(fastify, readerId),
    befriend: async ({ issuerId, readerId }) =>
      'valeur' in (await envoyerDemande(fastify, withoutReaderMutationId(request), { emetteurId: issuerId, receveurId: readerId })),
    report: (error) => logError(fastify.log, 'Contact exchange friend request error:', error),
  };
}

export default async function contactExchangeRoutes(fastify: FastifyInstance): Promise<void> {
  const issues = relationLimiter(fastify, 'contact-exchange:issue', 10);
  const accepts = relationLimiter(fastify, 'contact-exchange:accept', 20);

  fastify.post('/me/contact-exchange', {
    onRequest: [fastify.authenticate, contactExchangeGate],
    preHandler: [issues.middleware()],
    schema: {
      description: 'Issue a short-lived, single-use contactless sharing token (NFC or QR) that carries what I give: my showcase, a friend request, or both. Never my phone number.',
      tags: ['me'],
      summary: 'Issue a contactless sharing token',
      body: { type: 'object', properties: { offers: { type: 'array', items: { type: 'string', maxLength: 32 }, maxItems: 8 } } },
      response: { 200: issuedSchema, ...errors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const result = await issueContactExchange(contactExchangeDepsOf(fastify, request), { issuerId: request.user!.userId, payload: request.body });
      return 'code' in result ? sendError(reply, STATUS[result.code], result.error, { code: result.code }) : sendSuccess(reply, result.data);
    } catch (error) {
      logError(fastify.log, 'Contact exchange issue error:', error);
      return sendError(reply, 503, 'Partage indisponible', { code: CONTACT_EXCHANGE_ERROR_CODES.UNAVAILABLE });
    }
  });

  fastify.post<{ Params: { token: string } }>('/contact-exchange/:token/accept', {
    onRequest: [fastify.authenticate, contactExchangeGate],
    preHandler: [accepts.middleware()],
    schema: {
      description: 'Accept a contactless sharing token: receive what its issuer gave. Expired, replayed, forged or blocked tokens all get the same 404.',
      tags: ['me'],
      summary: 'Accept a contactless sharing token',
      params: { type: 'object', required: ['token'], properties: { token: { type: 'string', maxLength: 128 } } },
      response: { 200: acceptedSchema, ...errors },
      security: [{ bearerAuth: [] }],
    },
  }, async (request, reply) => {
    try {
      const result = await acceptContactExchange(contactExchangeDepsOf(fastify, request), { readerId: request.user!.userId, token: request.params.token });
      return 'code' in result ? sendError(reply, STATUS[result.code], result.error, { code: result.code }) : sendSuccess(reply, result.data);
    } catch (error) {
      logError(fastify.log, 'Contact exchange accept error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
