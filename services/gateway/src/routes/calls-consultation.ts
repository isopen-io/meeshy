/**
 * Routes calls — surface CONSULTATION (lectures) : GET /calls/:callId, GET
 * /calls/:callId/transcript, GET /conversations/:conversationId/active-call,
 * GET /calls/active, GET /calls/history. Issue #4284. Point d'entrée :
 * calls.ts.
 */

import { FastifyInstance } from 'fastify';
import { UnifiedAuthRequest } from '../middleware/auth.js';
import { createValidationMiddleware } from '../middleware/validation.js';
import { ROUTE_RATE_LIMITS } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';
import { sendSuccess, sendError, sendForbidden, sendNotFound, sendUnauthorized, sendInternalError } from '../utils/response.js';
import { toCallSessionResponse } from '../utils/call-session-response.js';
import { validatePagination } from '../utils/pagination.js';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
import {
  getCallSchema,
  getActiveCallSchema,
  callHistoryQuerySchema
} from '../validation/call-schemas.js';
import { callSessionSchema, errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { viewerFromRequest } from './users/presence-gate';
import { CallParams, CallRouteDeps } from './calls-shared';

interface ConversationParams {
  conversationId: string;
}

export function registerCallsConsultationRoutes(fastify: FastifyInstance, deps: CallRouteDeps): void {
  const { prisma, callService, requiredAuth } = deps;

  /**
   * GET /api/calls/:callId
   * Get call details
   * CVE-006: Added input validation
   * CVE-002: Added rate limiting (20 req/min)
   * CVE-003: Authorization check moved to CallService
   */
  fastify.get<{
    Params: CallParams;
  }>('/calls/:callId', {
    preValidation: [requiredAuth, createValidationMiddleware(getCallSchema)],
    ...ROUTE_RATE_LIMITS.joinCall,
    schema: {
      description: 'Retrieve detailed information about a specific call session including current status, participants, duration, and quality metrics. Requires user to be a member of the conversation.',
      tags: ['calls'],
      summary: 'Get call details',
      params: {
        type: 'object',
        required: ['callId'],
        properties: {
          callId: {
            type: 'string',
            description: 'Call session unique identifier (MongoDB ObjectId)',
            pattern: OBJECT_ID_PATTERN
          }
        }
      },
      response: {
        200: {
          description: 'Call details retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: callSessionSchema
          }
        },
        400: {
          description: 'Bad request - Invalid call ID format',
          ...errorResponseSchema
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - User not authorized to view this call',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - Call does not exist',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - Rate limit exceeded (20 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { callId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      logger.info('📞 REST: Getting call details', { callId, userId });

      // CVE-003: Pass requesting user ID for authorization check
      const callSession = await callService.getCallSession(callId, userId);

      return sendSuccess(reply, toCallSessionResponse(callSession));
    } catch (error: any) {
      logger.error('❌ REST: Error getting call', error);

      const errorMessage = error.message || 'Failed to get call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND' ? 404 : 400;

      return sendError(reply, statusCode, errorCode, { message });
    }
  });

  /**
   * GET /api/calls/:callId/transcript
   * Replay du journal de transcription persisté pendant l'appel (décision
   * produit 2026-08-13 : le transcript survit à la suppression de l'app et
   * de ses caches locaux). DONNÉE SENSIBLE — accès restreint aux
   * participants EFFECTIFS de l'appel (CallService.getCallTranscript), plus
   * strict que les autres routes calls (membres de conversation).
   */
  fastify.get<{
    Params: CallParams;
    Querystring: { offset?: string; limit?: string };
  }>('/calls/:callId/transcript', {
    preValidation: [requiredAuth, createValidationMiddleware(getCallSchema)],
    ...ROUTE_RATE_LIMITS.callOperations,
    schema: {
      description: 'Retrieve the persisted transcription journal of a call (final segments with their translations, ordered by capture time). Restricted to users who actually took part in the call.',
      tags: ['calls'],
      summary: 'Get call transcript',
      params: {
        type: 'object',
        required: ['callId'],
        properties: {
          callId: {
            type: 'string',
            description: 'Call session unique identifier (MongoDB ObjectId)',
            pattern: OBJECT_ID_PATTERN
          }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          offset: { type: 'string', description: 'Number of segments to skip (default 0)' },
          limit: { type: 'string', description: 'Maximum segments per page (default 100, max 100)' }
        }
      },
      response: {
        200: {
          description: 'Call transcript retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                callId: { type: 'string' },
                conversationId: { type: 'string' },
                callStartedAt: { type: 'string', format: 'date-time' },
                total: { type: 'number' },
                hasMore: { type: 'boolean' },
                segments: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      speakerId: { type: 'string' },
                      speakerDisplayName: { type: 'string', nullable: true },
                      text: { type: 'string' },
                      language: { type: 'string' },
                      confidence: { type: 'number', nullable: true },
                      capturedAtMs: { type: 'number' },
                      translations: {
                        type: 'array',
                        items: {
                          type: 'object',
                          properties: {
                            targetLanguage: { type: 'string' },
                            translatedText: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - User did not take part in this call',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - Call does not exist',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - Rate limit exceeded',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { callId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Volontairement AUCUN log du contenu — donnée sensible.
      logger.info('📞 REST: Getting call transcript', { callId, userId });

      const { offset, limit } = validatePagination(request.query.offset, request.query.limit, { defaultLimit: 100 });

      const transcript = await callService.getCallTranscript(callId, userId, offset, limit);

      return sendSuccess(reply, transcript);
    } catch (error: any) {
      const errorMessage = error.message || 'Failed to get call transcript';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND'
        ? 404
        : errorCode === 'NOT_A_PARTICIPANT'
          ? 403
          : 400;

      if (statusCode === 400) {
        logger.error('❌ REST: Error getting call transcript', error);
      }

      return sendError(reply, statusCode, errorCode, { message });
    }
  });

  /**
   * GET /api/conversations/:conversationId/active-call
   * Get active call for conversation
   * CVE-006: Added input validation
   * CVE-002: Added rate limiting (10 req/min)
   */
  fastify.get<{
    Params: ConversationParams;
  }>('/conversations/:conversationId/active-call', {
    preValidation: [requiredAuth, createValidationMiddleware(getActiveCallSchema)],
    ...ROUTE_RATE_LIMITS.callOperations,
    schema: {
      description: 'Retrieve the currently active call session for a specific conversation. Returns null if no active call exists. User must be a member of the conversation.',
      tags: ['calls'],
      summary: 'Get active call for conversation',
      params: {
        type: 'object',
        required: ['conversationId'],
        properties: {
          conversationId: {
            type: 'string',
            description: 'Conversation unique identifier (MongoDB ObjectId)',
            pattern: OBJECT_ID_PATTERN
          }
        }
      },
      response: {
        200: {
          description: 'Active call retrieved successfully (may be null if no active call)',
          type: 'object',
          // FIX 2026-05-12 — `oneOf: [callSessionSchema, { type: 'null' }]`
          // déclenchait `TypeError: The value of '#/properties/data' does not
          // match schema definition.` sur fast-json-stringify quand data===null
          // (limitation connue de la lib pour oneOf+null). `nullable: true` sur
          // le schema objet directement (au lieu d'un oneOf) évite ce bug tout
          // en gardant `data` comme whitelist de champs — la version précédente
          // (`additionalProperties: true` sans schema sur `data`) désactivait
          // tout filtrage et laissait fuiter des champs Prisma bruts non
          // destinés au client (ex: `CallParticipant.analytics`, télémétrie
          // privée d'un AUTRE participant) à tout membre de la conversation.
          properties: {
            success: { type: 'boolean', example: true },
            data: { ...callSessionSchema, nullable: true }
          }
        },
        400: {
          description: 'Bad request - Invalid conversation ID format',
          ...errorResponseSchema
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - User not a member of conversation',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - Rate limit exceeded (10 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const { conversationId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      logger.info('📞 REST: Getting active call for conversation', {
        conversationId,
        userId
      });

      // Verify user is member of conversation
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId,
          userId,
          isActive: true
        }
      });

      if (!membership) {
        return sendForbidden(reply, 'NOT_A_PARTICIPANT');
      }

      const callSession = await callService.getActiveCallForConversation(
        conversationId
      );

      return sendSuccess(reply, toCallSessionResponse(callSession));
    } catch (error: any) {
      logger.error('❌ REST: Error getting active call', error);

      return sendInternalError(reply, 'INTERNAL_ERROR');
    }
  });

  // ─── GET /api/calls/active — Get user's active call (crash recovery) ───

  fastify.get('/calls/active', {
    preValidation: [requiredAuth],
    ...ROUTE_RATE_LIMITS.callOperations,
    schema: {
      description: 'Retrieve the currently active call for the authenticated user. Used for crash recovery — when the app restarts, it can check if the user was in an active call.',
      tags: ['calls'],
      summary: 'Get active call for current user (crash recovery)',
      response: {
        200: {
          description: 'Active call retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: callSessionSchema
          }
        },
        404: {
          description: 'No active call found',
          ...errorResponseSchema
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const authRequest = request as unknown as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'NOT_AUTHENTICATED');
      }

      logger.info('📞 REST: Getting active call for user (crash recovery)', {
        userId
      });

      const activeCall = await prisma.callSession.findFirst({
        where: {
          status: { in: ['initiated', 'ringing', 'connecting', 'active', 'reconnecting'] },
          participants: {
            some: {
              participant: {
                userId: userId,
              },
              // Audit C5 (2026-07-02) — Prisma-on-Mongo: `leftAt: null` misses
              // historical documents where the field is absent entirely.
              OR: [{ leftAt: null }, { leftAt: { isSet: false } }],
            },
          },
        },
        include: {
          participants: {
            include: {
              participant: {
                select: {
                  id: true,
                  userId: true,
                  user: { select: { id: true, username: true, displayName: true, avatar: true } },
                },
              },
            },
          },
        },
        orderBy: { startedAt: 'desc' },
      });

      if (!activeCall) {
        return sendNotFound(reply, 'NO_ACTIVE_CALL');
      }

      return sendSuccess(reply, toCallSessionResponse(activeCall));
    } catch (error: any) {
      logger.error('❌ REST: Error getting active call for user', error);

      return sendInternalError(reply, 'INTERNAL_ERROR');
    }
  });

  // ─── GET /api/calls/history — Paginated call journal ───

  fastify.get('/calls/history', {
    preValidation: [requiredAuth],
    ...ROUTE_RATE_LIMITS.callOperations,
    schema: {
      description: 'Paginated call journal for the authenticated user: terminal calls (ended/missed/rejected/failed) in their conversations over a 3-month sliding window, newest first. Cursor-paginated.',
      tags: ['calls'],
      summary: 'List call history',
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 50, default: 30 },
          cursor: { type: 'string', description: 'Opaque cursor (call id) for the next page' },
          filter: { type: 'string', enum: ['all', 'missed'], default: 'all' }
        }
      },
      response: {
        200: {
          description: 'Call history page',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  callId: { type: 'string' },
                  conversationId: { type: 'string' },
                  conversationType: { type: 'string' },
                  conversationTitle: { type: ['string', 'null'] },
                  conversationAvatar: { type: ['string', 'null'] },
                  mode: { type: 'string' },
                  status: { type: 'string' },
                  endReason: { type: ['string', 'null'] },
                  direction: { type: 'string', enum: ['incoming', 'outgoing', 'missed'] },
                  isVideo: { type: 'boolean' },
                  startedAt: { type: 'string' },
                  answeredAt: { type: ['string', 'null'] },
                  endedAt: { type: ['string', 'null'] },
                  durationSec: { type: 'integer' },
                  bytesSent: { type: ['integer', 'null'] },
                  bytesReceived: { type: ['integer', 'null'] },
                  peer: {
                    type: ['object', 'null'],
                    properties: {
                      userId: { type: 'string' },
                      username: { type: 'string' },
                      displayName: { type: ['string', 'null'] },
                      avatar: { type: ['string', 'null'] },
                      phoneNumber: { type: ['string', 'null'] },
                      isOnline: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            pagination: {
              type: 'object',
              properties: {
                limit: { type: 'integer' },
                hasMore: { type: 'boolean' },
                nextCursor: { type: 'string' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          ...errorResponseSchema
        }
      }
    }
  }, async (request, reply) => {
    try {
      const authRequest = request as unknown as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      if (!userId) {
        return sendUnauthorized(reply, 'NOT_AUTHENTICATED');
      }

      const parsed = callHistoryQuerySchema.safeParse(request.query);
      const { limit, cursor, filter } = parsed.success
        ? parsed.data
        : { limit: 30, cursor: undefined as string | undefined, filter: 'all' as const };

      const result = await callService.listHistory(userId, {
        limit,
        cursor,
        filter,
        viewer: viewerFromRequest(request)
      });

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor }
      });
    } catch (error: any) {
      logger.error('❌ REST: Error listing call history', error);
      return sendInternalError(reply, 'INTERNAL_ERROR', { message: 'Failed to get call history' });
    }
  });
}
