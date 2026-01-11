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
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth.js';
import { createValidationMiddleware } from '../middleware/validation.js';
import { ROUTE_RATE_LIMITS } from '../middleware/rate-limit.js';
import { CallService } from '../services/CallService.js';
import { logger } from '../utils/logger.js';
import {
  initiateCallSchema,
  getCallSchema,
  endCallSchema,
  joinCallSchema,
  leaveCallSchema,
  getActiveCallSchema
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

  // Initialize CallService
  const callService = new CallService(prisma);

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

      const callSession = await callService.initiateCall({
        conversationId,
        initiatorId: userId,
        type,
        settings
      });

      return reply.status(201).send({
        success: true,
        data: callSession
      });
    } catch (error: any) {
      logger.error('❌ REST: Error initiating call', error);

      // Extract error code if present
      const errorMessage = error.message || 'Failed to initiate call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      return reply.status(400).send({
        success: false,
        error: {
          code: errorCode,
          message,
          details: error.details || undefined
        }
      });
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

      return reply.send({
        success: true,
        data: callSession
      });
    } catch (error: any) {
      logger.error('❌ REST: Error getting call', error);

      const errorMessage = error.message || 'Failed to get call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND' ? 404 : 400;

      return reply.status(statusCode).send({
        success: false,
        error: {
          code: errorCode,
          message
        }
      });
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

      // Verify user is initiator or admin/moderator of conversation
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: call.conversationId,
          userId,
          isActive: true
        }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'NOT_A_PARTICIPANT',
            message: 'You do not have access to this call'
          }
        });
      }

      // Only initiator or admin/moderator can end call
      const canEndCall =
        call.initiatorId === userId ||
        membership.role === 'admin' ||
        membership.role === 'moderator';

      if (!canEndCall) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'PERMISSION_DENIED',
            message: 'Only the call initiator or conversation moderators can end the call'
          }
        });
      }

      const callSession = await callService.endCall(callId, userId);

      return reply.send({
        success: true,
        data: callSession
      });
    } catch (error: any) {
      logger.error('❌ REST: Error ending call', error);

      const errorMessage = error.message || 'Failed to end call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND' ? 404 : 400;

      return reply.status(statusCode).send({
        success: false,
        error: {
          code: errorCode,
          message
        }
      });
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

      const callSession = await callService.joinCall({
        callId,
        userId,
        settings
      });

      return reply.send({
        success: true,
        data: callSession
      });
    } catch (error: any) {
      logger.error('❌ REST: Error joining call', error);

      const errorMessage = error.message || 'Failed to join call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND' ? 404 : 400;

      return reply.status(statusCode).send({
        success: false,
        error: {
          code: errorCode,
          message
        }
      });
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

      // Verify user is leaving their own participation or has moderator rights
      if (participantId !== userId) {
        // Check if user is moderator
        const call = await callService.getCallSession(callId);
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: call.conversationId,
            userId,
            isActive: true
          }
        });

        const isModerator =
          membership?.role === 'admin' || membership?.role === 'moderator';

        if (!isModerator) {
          return reply.status(403).send({
            success: false,
            error: {
              code: 'PERMISSION_DENIED',
              message: 'You can only leave your own participation'
            }
          });
        }
      }

      const callSession = await callService.leaveCall({
        callId,
        userId: participantId
      });

      return reply.send({
        success: true,
        data: callSession
      });
    } catch (error: any) {
      logger.error('❌ REST: Error leaving call', error);

      const errorMessage = error.message || 'Failed to leave call';
      const errorCode = errorMessage.split(':')[0];
      const message = errorMessage.includes(':')
        ? errorMessage.split(':').slice(1).join(':').trim()
        : errorMessage;

      const statusCode = errorCode === 'CALL_NOT_FOUND' ? 404 : 400;

      return reply.status(statusCode).send({
        success: false,
        error: {
          code: errorCode,
          message
        }
      });
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
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              oneOf: [
                callSessionSchema,
                { type: 'null' }
              ],
              description: 'Active call session or null if no active call'
            }
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
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId,
          userId,
          isActive: true
        }
      });

      if (!membership) {
        return reply.status(403).send({
          success: false,
          error: {
            code: 'NOT_A_PARTICIPANT',
            message: 'You are not a member of this conversation'
          }
        });
      }

      const callSession = await callService.getActiveCallForConversation(
        conversationId
      );

      return reply.send({
        success: true,
        data: callSession
      });
    } catch (error: any) {
      logger.error('❌ REST: Error getting active call', error);

      return reply.status(500).send({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to get active call'
        }
      });
    }
  });
}
