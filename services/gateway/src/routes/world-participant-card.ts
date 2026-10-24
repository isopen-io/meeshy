/**
 * `GET /api/v1/world/participants/:participantId` (#10102) — la fiche d'un
 * participant de World Wide, invité sans compte compris, lue par l'ÉQUIPE pour
 * MODÉRER. Contrat : `@meeshy/shared/types/world-participant-card`. Décision
 * et finalité : `decisions/2026-10-11-l-equipe-lit-la-fiche-d-un-participant-de-world-wide-10102.md`.
 *
 * L'ordre est la garde :
 *  1. une créance (401 sinon) ;
 *  2. un COMPTE dont le rôle global est au-delà de USER
 *     (`mayReadWorldParticipantCard`, fail-closed) — 403 sinon, AVANT toute
 *     lecture : un refus ne dit rien de l'existence de qui que ce soit ;
 *  3. le participant, cherché DANS World Wide seulement — 404 sinon, qu'il
 *     n'existe pas ou qu'il soit d'une autre conversation ; de son COMPTE, le
 *     lecteur ne lit rôle global, Prisme et session que s'il le SURCLASSE ou
 *     s'il est lui-même (la règle de `requireHierarchy`) — sinon ils sont
 *     retenus et la fiche le dit (`accountDetailsWithheld`) ;
 *  4. la TRACE au journal d'audit — 503 si elle ne s'écrit pas : aucune fiche
 *     ne sort sans elle ;
 *  5. la fiche, privée et non stockable.
 *
 * Rien de neuf ne part sur le temps réel ni dans une charge existante : la
 * fiche n'existe que dans la réponse de cette porte.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { errorResponseSchema, validationErrorResponseSchema } from '@meeshy/shared/types/api-schemas';
import {
  WORLD_PARTICIPANT_CARD_ERRORS,
  mayReadWorldParticipantCard,
} from '@meeshy/shared/types/world-participant-card';
import { createUnifiedAuthMiddleware, type UnifiedAuthContext } from '../middleware/auth';
import { loadWorldParticipantCard } from '../services/world/worldParticipantCard';
import { extractUserAgent } from '../services/GeoIPService';
import { enhancedLogger } from '../utils/logger-enhanced';
import { logError } from '../utils/logger';
import { sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../utils/response';

const logger = enhancedLogger.child({ module: 'WorldParticipantCard' });

/** Le code que la trace porte — écrit en littéral, la forme que le vocabulaire du journal reconnaît. */
const WORLD_PARTICIPANT_CARD_AUDIT = { action: 'WORLD_PARTICIPANT_CARD_VIEWED', entity: 'Participant' } as const;
export const WORLD_PARTICIPANT_CARD_AUDIT_ACTION = WORLD_PARTICIPANT_CARD_AUDIT.action;

export type WorldParticipantCardRoutesOptions = {
  /** Le portier d'authentification — remplaçable en test. */
  readonly authenticate?: (request: FastifyRequest, reply: FastifyReply) => Promise<unknown>;
};

const nullableString = { type: ['string', 'null'] } as const;

const clientSchema = {
  type: ['object', 'null'],
  additionalProperties: false,
  required: ['browser', 'browserVersion', 'os', 'osVersion', 'deviceType', 'platform', 'appVersion'],
  properties: {
    browser: nullableString,
    browserVersion: { ...nullableString, description: 'Version MAJEURE seulement' },
    os: nullableString,
    osVersion: { ...nullableString, description: 'Version MAJEURE seulement' },
    deviceType: { ...nullableString, description: 'mobile · tablet · desktop · …' },
    platform: { ...nullableString, description: 'Déclarée par l’application (comptes seulement)' },
    appVersion: { ...nullableString, description: 'Déclarée par l’application (comptes seulement)' },
  },
} as const;

const cardResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      additionalProperties: false,
      required: [
        'participantId', 'participantType', 'displayName', 'avatar', 'username', 'conversationRole', 'accountRole',
        'languages', 'country', 'client', 'joinedAt', 'shareLink', 'status', 'accountDetailsWithheld',
      ],
      properties: {
        participantId: { type: 'string' },
        participantType: { type: 'string', enum: ['anonymous', 'user', 'bot'] },
        displayName: { type: 'string' },
        avatar: { ...nullableString, description: 'Référence de média du visage affiché dans le fil — null sans photo' },
        username: nullableString,
        conversationRole: { type: 'string', description: 'Rang dans World Wide : creator · admin · moderator · member' },
        accountRole: { ...nullableString, description: 'Rôle GLOBAL du compte — null pour un invité' },
        languages: {
          type: 'object',
          additionalProperties: false,
          required: ['conversation', 'system', 'regional', 'customDestination', 'deviceLocale'],
          properties: {
            conversation: { type: 'string', description: 'Langue d’entrée (Participant.language)' },
            system: nullableString,
            regional: nullableString,
            customDestination: nullableString,
            deviceLocale: nullableString,
          },
        },
        country: { ...nullableString, description: 'ISO 3166-1 alpha-2 — pays d’arrivée, à défaut celui de la dernière session du compte' },
        client: clientSchema,
        joinedAt: { type: 'string', format: 'date-time' },
        shareLink: {
          type: ['object', 'null'],
          additionalProperties: false,
          required: ['identifier', 'linkId', 'name'],
          properties: { identifier: nullableString, linkId: { type: 'string' }, name: nullableString },
        },
        status: { type: 'string', enum: ['active', 'left', 'banned'] },
        accountDetailsWithheld: {
          type: 'boolean',
          description: 'true : le lecteur ne SURCLASSE pas ce compte — rôle global, rangs du Prisme, poste et pays de session sont retenus (null)',
        },
      },
    },
  },
} as const;

type CardReader = { readonly userId: string; readonly role: string };

/** Un COMPTE qui a le droit — sinon `null`. Un invité n'est jamais un lecteur, quoi que porte son contexte. */
function cardReader(authContext: UnifiedAuthContext | undefined): CardReader | null {
  if (!authContext || authContext.type !== 'user' || authContext.isAnonymous || !authContext.userId) return null;
  const role = authContext.registeredUser?.role;
  return mayReadWorldParticipantCard(role) ? { userId: authContext.userId, role: String(role) } : null;
}

export async function worldParticipantCardRoutes(
  fastify: FastifyInstance,
  options: WorldParticipantCardRoutesOptions = {},
): Promise<void> {
  const prisma = fastify.prisma as PrismaClient;
  const authenticate =
    options.authenticate ?? createUnifiedAuthMiddleware(prisma, { requireAuth: true, allowAnonymous: true });

  fastify.get(
    '/world/participants/:participantId',
    {
      preValidation: [authenticate as never],
      schema: {
        description:
          "La fiche d'un participant de World Wide, invité compris (langues, pays, poste réduit, entrée, lien, rang), " +
          'pour la modération. Réservée aux comptes dont le rôle global est au-delà de USER ; chaque lecture est tracée. ' +
          'Ni adresse IP, ni présence, ni coordonnées.',
        tags: ['world', 'moderation'],
        summary: "Fiche de modération d'un participant de World Wide",
        params: {
          type: 'object',
          required: ['participantId'],
          properties: { participantId: { type: 'string', pattern: '^[0-9a-fA-F]{24}$' } },
        },
        response: {
          200: cardResponseSchema,
          400: validationErrorResponseSchema,
          401: errorResponseSchema,
          403: errorResponseSchema,
          404: errorResponseSchema,
          500: errorResponseSchema,
          503: errorResponseSchema,
        },
      },
    },
    async (request: FastifyRequest<{ Params: { participantId: string } }>, reply: FastifyReply) => {
      const reader = cardReader((request as FastifyRequest & { authContext?: UnifiedAuthContext }).authContext);
      if (!reader) {
        return sendForbidden(reply, 'World participant card restricted to staff', {
          code: WORLD_PARTICIPANT_CARD_ERRORS.forbidden,
          message: "La fiche d'un participant est réservée à l'équipe",
        });
      }

      try {
        const loaded = await loadWorldParticipantCard(prisma, request.params.participantId, reader);
        if (!loaded) {
          return sendNotFound(reply, 'World participant not found', {
            code: WORLD_PARTICIPANT_CARD_ERRORS.notFound,
            message: "Ce participant n'est pas dans World Wide",
          });
        }

        try {
          await prisma.adminAuditLog.create({
            data: {
              userId: loaded.userId ?? loaded.card.participantId,
              adminId: reader.userId,
              ...WORLD_PARTICIPANT_CARD_AUDIT,
              entityId: loaded.card.participantId,
              metadata: JSON.stringify({
                conversationId: loaded.conversationId,
                participantType: loaded.card.participantType,
                readerRole: reader.role,
                accountDetailsWithheld: loaded.card.accountDetailsWithheld,
              }),
              ipAddress: request.ip ?? null,
              userAgent: extractUserAgent(request),
            },
          });
        } catch (error: unknown) {
          logger.error('trace d’audit non écrite — fiche de participant refusée', {
            participantId: loaded.card.participantId,
            adminId: reader.userId,
            error,
          });
          return sendError(reply, 503, 'Audit trail unavailable', {
            code: WORLD_PARTICIPANT_CARD_ERRORS.auditUnavailable,
            message: 'La lecture ne peut pas être tracée pour le moment — réessayez',
          });
        }

        reply.header('Cache-Control', 'private, no-store');
        return sendSuccess(reply, loaded.card);
      } catch (error) {
        logError('Error serving a World Wide participant card', error, { source: 'world-participant-card' });
        return sendInternalError(reply, 'WORLD_PARTICIPANT_CARD_FAILED');
      }
    },
  );
}
