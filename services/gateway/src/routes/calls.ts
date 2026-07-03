/**
 * Call Routes - REST API for video/audio calls (Phase 1A: P2P MVP)
 *
 * Endpoints:
 * - POST   /api/calls                          - Initiate new call
 * - GET    /api/calls/:callId                  - Get call details
 * - DELETE /api/calls/:callId                  - End call
 * - POST   /api/calls/:callId/participants     - Join call
 * - DELETE /api/calls/:callId/participants/:participantId - Leave call
 * - GET    /api/conversations/:conversationId/active-call - Get active call
 * - GET    /api/calls/active                            - Get user's active call (crash recovery)
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth.js';
import { createValidationMiddleware } from '../middleware/validation.js';
import { ROUTE_RATE_LIMITS } from '../middleware/rate-limit.js';
import { CallService } from '../services/CallService.js';
import { logger } from '../utils/logger.js';
import { sendSuccess, sendError, sendForbidden, sendNotFound, sendUnauthorized, sendInternalError } from '../utils/response.js';
import {
  initiateCallSchema,
  getCallSchema,
  endCallSchema,
  joinCallSchema,
  leaveCallSchema,
  getActiveCallSchema,
  callHistoryQuerySchema
} from '../validation/call-schemas.js';
import {
  callSessionSchema,
  callSessionMinimalSchema,
  callParticipantSchema,
  startCallRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';

interface CallParams {
  callId: string;
}

interface ParticipantParams {
  callId: string;
  participantId: string;
}

interface ConversationParams {
  conversationId: string;
}

interface InitiateCallBody {
  conversationId: string;
  type: 'video' | 'audio';
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
    screenShareEnabled?: boolean;
  };
}

interface JoinCallBody {
  settings?: {
    audioEnabled?: boolean;
    videoEnabled?: boolean;
  };
}

export default async function callRoutes(fastify: FastifyInstance) {
  // Get decorated prisma instance
  const prisma = fastify.prisma;

  // Reuse the Socket.IO layer's CallService (shares its in-memory
  // ringingTimeouts/heartbeats/backgroundedParticipants maps with
  // CallEventsHandler and CallCleanupService) so a call initiated via REST
  // gets its ringing timeout tracked on the same instance that later reads
  // it. Falls back to a fresh instance only if routes register before
  // setupSocketIO() decorates it (should not happen in normal boot order —
  // see Server.setupSocketIO/setupRoutes call sequence — but keeps this
  // route usable in isolation, e.g. targeted route tests).
  const callService = fastify.callService ?? new CallService(prisma);

  // Authentication middleware (required for all routes)
  const requiredAuth = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * POST /api/calls
   * Initiate a new call
   * CVE-006: Added input validation
   * CVE-002: Added rate limiting (5 req/min)
   */
  fastify.post<{
    Body: InitiateCallBody;
  }>('/calls', {
    preValidation: [requiredAuth, createValidationMiddleware(initiateCallSchema)],
    ...ROUTE_RATE_LIMITS.initiateCall,
    schema: {
      description: 'Initiate a new voice or video call in a conversation. Creates a call session and notifies conversation participants. The initiator becomes the first participant automatically.',
      tags: ['calls'],
      summary: 'Initiate new call',
      body: {
        type: 'object',
        required: ['conversationId', 'type'],
        properties: {
          conversationId: {
            type: 'string',
            description: 'Conversation ID where the call will be initiated (MongoDB ObjectId format)',
            pattern: '^[0-9a-fA-F]{24}$'
          },
          type: {
            type: 'string',
            enum: ['video', 'audio'],
            description: 'Type of call to initiate'
          },
          settings: {
            type: 'object',
            description: 'Initial call settings',
            properties: {
              audioEnabled: {
                type: 'boolean',
                description: 'Start with audio enabled',
                default: true
              },
              videoEnabled: {
                type: 'boolean',
                description: 'Start with video enabled (only for video calls)',
                default: true
              },
              screenShareEnabled: {
                type: 'boolean',
                description: 'Allow screen sharing in this call',
                default: false
              }
            }
          }
        }
      },
      response: {
        201: {
          description: 'Call initiated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: callSessionSchema
          }
        },
        400: {
          description: 'Bad request - Invalid input or business logic error',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Error code (e.g., INVALID_CONVERSATION, CALL_ALREADY_ACTIVE)' },
                message: { type: 'string', description: 'Error message' },
                details: { type: 'object', description: 'Additional error details' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - User not a member of the conversation',
          ...errorResponseSchema
        },
        429: {
          description: 'Too many requests - Rate limit exceeded (5 req/min)',
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
      const { conversationId, type, settings } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      logger.info('📞 REST: Initiating call', { conversationId, userId, type });

      let participantId = authRequest.authContext.participantId;
      if (!participantId && userId) {
        const p = await prisma.participant.findFirst({
          where: { userId, conversationId, isActive: true },
          select: { id: true },
        });
        participantId = p?.id;
      }

      const callSession = await callService.initiateCall({
        conversationId,
        initiatorId: userId,
        participantId,
        type,
        settings
      });

      return sendSuccess(reply, callSession, { statusCode: 201 });
    } catch (error: any) {
      logger.error('❌ REST: Error initiating call', error);

      // Extract error code if present
      const errorMessage = error.message || 'Failed to initiate call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      return sendError(reply, 400, errorCode, { message });
    }
  });

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
            pattern: '^[0-9a-fA-F]{24}$'
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
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Error code' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
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
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'CALL_NOT_FOUND' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
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

      return sendSuccess(reply, callSession);
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
   * DELETE /api/calls/:callId
   * End call (force end)
   * CVE-006: Added input validation
   * CVE-002: Added rate limiting (10 req/min)
   */
  fastify.delete<{
    Params: CallParams;
  }>('/calls/:callId', {
    preValidation: [requiredAuth, createValidationMiddleware(endCallSchema)],
    ...ROUTE_RATE_LIMITS.callOperations,
    schema: {
      description: 'Force end an active call session. Only the call initiator or conversation moderators/admins can end a call. This will disconnect all participants and finalize call metrics.',
      tags: ['calls'],
      summary: 'End call',
      params: {
        type: 'object',
        required: ['callId'],
        properties: {
          callId: {
            type: 'string',
            description: 'Call session unique identifier (MongoDB ObjectId)',
            pattern: '^[0-9a-fA-F]{24}$'
          }
        }
      },
      response: {
        200: {
          description: 'Call ended successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: callSessionSchema
          }
        },
        400: {
          description: 'Bad request - Invalid call ID or call already ended',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Error code' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - Only initiator or moderators can end the call',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'PERMISSION_DENIED' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        404: {
          description: 'Not found - Call does not exist',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'CALL_NOT_FOUND' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
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
      const { callId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      logger.info('📞 REST: Ending call', { callId, userId });

      // Get call to verify permissions
      const call = await callService.getCallSession(callId);

      // Resolve conversation membership (needed for endParticipantId below).
      // Authorization on WHO may end the call is enforced by
      // callService.endCall() itself — P2P: any active participant may end
      // for everyone; SFU (Phase 2): initiator/moderator only. This route
      // must mirror that single policy rather than re-implement a stricter
      // initiator/admin/moderator-only gate here: the socket `call:end` path
      // has no such extra gate, so a plain P2P callee ending their own call
      // via REST previously got PERMISSION_DENIED while the identical action
      // via the socket succeeded — an authorization inconsistency between
      // the two transports for the exact same operation.
      const membership = await prisma.participant.findFirst({
        where: {
          conversationId: call.conversationId,
          userId,
          isActive: true
        }
      });

      if (!membership) {
        return sendForbidden(reply, 'NOT_A_PARTICIPANT');
      }

      const endParticipantId = authRequest.authContext.participantId || membership?.id;
      const callSession = await callService.endCall(callId, userId, endParticipantId);

      return sendSuccess(reply, callSession);
    } catch (error: any) {
      logger.error('❌ REST: Error ending call', error);

      const errorMessage = error.message || 'Failed to end call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND' ? 404 : 400;

      return sendError(reply, statusCode, errorCode, { message });
    }
  });

  /**
   * POST /api/calls/:callId/participants
   * Join call
   * CVE-006: Added input validation
   * CVE-002: Added rate limiting (20 req/min)
   */
  fastify.post<{
    Params: CallParams;
    Body: JoinCallBody;
  }>('/calls/:callId/participants', {
    preValidation: [requiredAuth, createValidationMiddleware(joinCallSchema)],
    ...ROUTE_RATE_LIMITS.joinCall,
    schema: {
      description: 'Join an active call session as a participant. User must be a member of the conversation. Optionally specify initial audio/video settings.',
      tags: ['calls'],
      summary: 'Join call',
      params: {
        type: 'object',
        required: ['callId'],
        properties: {
          callId: {
            type: 'string',
            description: 'Call session unique identifier (MongoDB ObjectId)',
            pattern: '^[0-9a-fA-F]{24}$'
          }
        }
      },
      body: {
        type: 'object',
        properties: {
          settings: {
            type: 'object',
            description: 'Initial media settings for joining',
            properties: {
              audioEnabled: {
                type: 'boolean',
                description: 'Join with audio enabled',
                default: true
              },
              videoEnabled: {
                type: 'boolean',
                description: 'Join with video enabled (for video calls)',
                default: true
              }
            }
          }
        }
      },
      response: {
        200: {
          description: 'Successfully joined call',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: callSessionSchema
          }
        },
        400: {
          description: 'Bad request - Invalid call ID or call not active',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Error code (e.g., CALL_ENDED, ALREADY_IN_CALL)' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - User not a member of conversation',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - Call does not exist',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'CALL_NOT_FOUND' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
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
      const { settings } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      logger.info('📞 REST: Joining call', { callId, userId });

      let joinParticipantId = authRequest.authContext.participantId;
      if (!joinParticipantId && userId) {
        const call = await callService.getCallSession(callId);
        if (call?.conversationId) {
          const p = await prisma.participant.findFirst({
            where: { userId, conversationId: call.conversationId, isActive: true },
            select: { id: true },
          });
          joinParticipantId = p?.id;
        }
      }
      const callSession = await callService.joinCall({
        callId,
        userId,
        participantId: joinParticipantId,
        settings,
      });

      return sendSuccess(reply, callSession);
    } catch (error: any) {
      logger.error('❌ REST: Error joining call', error);

      const errorMessage = error.message || 'Failed to join call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND' ? 404 : 400;

      return sendError(reply, statusCode, errorCode, { message });
    }
  });

  /**
   * DELETE /api/calls/:callId/participants/:participantId
   * Leave call
   * CVE-006: Added input validation
   * CVE-002: Added rate limiting (10 req/min)
   */
  fastify.delete<{
    Params: ParticipantParams;
  }>('/calls/:callId/participants/:participantId', {
    preValidation: [requiredAuth, createValidationMiddleware(leaveCallSchema)],
    ...ROUTE_RATE_LIMITS.callOperations,
    schema: {
      description: 'Remove a participant from an active call. Users can leave their own participation, or moderators/admins can remove other participants.',
      tags: ['calls'],
      summary: 'Leave call',
      params: {
        type: 'object',
        required: ['callId', 'participantId'],
        properties: {
          callId: {
            type: 'string',
            description: 'Call session unique identifier (MongoDB ObjectId)',
            pattern: '^[0-9a-fA-F]{24}$'
          },
          participantId: {
            type: 'string',
            description: 'User ID of participant to remove (must be own user ID unless moderator)',
            minLength: 1
          }
        }
      },
      response: {
        200: {
          description: 'Successfully left call',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: callSessionSchema
          }
        },
        400: {
          description: 'Bad request - Invalid parameters or participant not in call',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Error code' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - Cannot remove other participants without moderator privileges',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'PERMISSION_DENIED' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        404: {
          description: 'Not found - Call does not exist',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'CALL_NOT_FOUND' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
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
      const { callId, participantId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      logger.info('📞 REST: Leaving call', { callId, participantId, userId });

      let call: Awaited<ReturnType<typeof callService.getCallSession>> | undefined;

      // Verify user is leaving their own participation or has moderator rights
      if (participantId !== userId) {
        // Check if user is moderator
        call = await callService.getCallSession(callId);
        const membership = await prisma.participant.findFirst({
          where: {
            conversationId: call.conversationId,
            userId,
            isActive: true
          }
        });

        const isModerator =
          membership?.role === 'admin' || membership?.role === 'moderator';

        if (!isModerator) {
          return sendForbidden(reply, 'PERMISSION_DENIED');
        }
      }

      // `authContext.participantId` is populated only for anonymous sessions
      // (see middleware/auth.ts) and is trustworthy ONLY when leaving one's
      // OWN slot — it is the CALLER's conversation Participant.id. Registered
      // users never populate it, and a moderator removing someone else must
      // NEVER fall back to it here: `CallParticipant.participantId` must be
      // the TARGET's Participant.id, or the moderator's own participation
      // gets marked as "left" instead of the target's (kick silently no-ops
      // or ends the wrong side of the call). Resolve the target's real
      // Participant.id from their userId whenever we can't trust the shortcut.
      let leaveParticipantId: string;
      if (participantId === userId && authRequest.authContext.participantId) {
        leaveParticipantId = authRequest.authContext.participantId;
      } else {
        call = call ?? await callService.getCallSession(callId);
        const targetParticipant = await prisma.participant.findFirst({
          where: { conversationId: call.conversationId, userId: participantId, isActive: true },
          select: { id: true }
        });
        leaveParticipantId = targetParticipant?.id ?? participantId;
      }

      const callSession = await callService.leaveCall({
        callId,
        userId: participantId,
        participantId: leaveParticipantId,
      });

      return sendSuccess(reply, callSession);
    } catch (error: any) {
      logger.error('❌ REST: Error leaving call', error);

      const errorMessage = error.message || 'Failed to leave call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND' ? 404 : 400;

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
            pattern: '^[0-9a-fA-F]{24}$'
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
          // (limitation connue de la lib pour oneOf+null). On retire la
          // contrainte de schema sur `data` côté serializer (additionalProperties
          // true), la doc OpenAPI reste correcte via description.
          additionalProperties: true,
          properties: {
            success: { type: 'boolean', example: true }
          }
        },
        400: {
          description: 'Bad request - Invalid conversation ID format',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', description: 'Error code' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - User not a member of conversation',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NOT_A_PARTICIPANT' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        429: {
          description: 'Too many requests - Rate limit exceeded (10 req/min)',
          ...errorResponseSchema
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'INTERNAL_ERROR' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
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

      return sendSuccess(reply, callSession);
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
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NO_ACTIVE_CALL' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        401: {
          description: 'Authentication required',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NOT_AUTHENTICATED' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'INTERNAL_ERROR' },
                message: { type: 'string', description: 'Error message' }
              }
            }
          }
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

      return sendSuccess(reply, activeCall);
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
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'NOT_AUTHENTICATED' },
                message: { type: 'string' }
              }
            }
          }
        },
        500: {
          description: 'Internal server error',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: {
              type: 'object',
              properties: {
                code: { type: 'string', example: 'INTERNAL_ERROR' },
                message: { type: 'string' }
              }
            }
          }
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

      const result = await callService.listHistory(userId, { limit, cursor, filter });

      return sendSuccess(reply, result.items, {
        pagination: { limit, hasMore: result.hasMore, nextCursor: result.nextCursor }
      });
    } catch (error: any) {
      logger.error('❌ REST: Error listing call history', error);
      return sendInternalError(reply, 'INTERNAL_ERROR', { message: 'Failed to get call history' });
    }
  });
}
