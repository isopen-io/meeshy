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
import { CallService, CallAlreadyEndedError } from '../services/CallService.js';
import { logger } from '../utils/logger.js';
import { sendSuccess, sendError, sendForbidden, sendNotFound, sendUnauthorized, sendInternalError } from '../utils/response.js';
import { toCallSessionResponse } from '../utils/call-session-response.js';
import { validatePagination } from '../utils/pagination.js';
import { OBJECT_ID_PATTERN } from '@meeshy/shared/utils/object-id';
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
  startCallRequestSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { MEMBER_ROLE_HIERARCHY, MemberRole } from '@meeshy/shared/types/role-types';
import { viewerFromRequest } from './users/presence-gate';

/**
 * Numeric conversation-role rank (creator=40 > admin=30 > moderator=20 >
 * member=10), 0 for anything unrecognized. SSOT: `MEMBER_ROLE_HIERARCHY`
 * (`@meeshy/shared/types/role-types`) — the same table
 * `conversations/participants.ts`' role-update route and
 * `packages/shared/utils/member-visibility.ts` compare against, so a
 * conversation's role hierarchy is decided in exactly one place.
 */
const conversationRoleRank = (role: string | null | undefined): number =>
  MEMBER_ROLE_HIERARCHY[(role ?? '') as MemberRole] ?? 0;

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
            pattern: OBJECT_ID_PATTERN
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
        // Ce bloc était écrit à la main, et se trompait sur l'enveloppe : il
        // déclarait `error` en OBJET portant `code`/`message`/`details`, quand
        // `sendError` (`utils/response.ts`) rend `error` en STRING à la RACINE,
        // avec `message` et `code` à côté — et `details` ÉTALÉ, jamais comme
        // clé. Résultat, sur le seul 400 de cette route
        // (`sendError(reply, 400, errorCode, { message })`) : `error` sortait en
        // `{}`, `message` et `code` étaient supprimés, et le client n'avait plus
        // rien à afficher ni à brancher. `errorResponseSchema` déclare les
        // champs réels — cf. § « Un schéma d'ERREUR se confronte à l'enveloppe ».
        400: {
          description: 'Bad request - Invalid input or business logic error (e.g. INVALID_CONVERSATION, CALL_ALREADY_ACTIVE)',
          ...errorResponseSchema
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

      return sendSuccess(reply, toCallSessionResponse(callSession), { statusCode: 201 });
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
      description: 'Force end an active call session. P2P: any active participant can end the call for everyone. SFU (Phase 2): restricted to the initiator or conversation moderators/admins. This will disconnect all participants and finalize call metrics.',
      tags: ['calls'],
      summary: 'End call',
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
          description: 'Call ended successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: callSessionSchema
          }
        },
        400: {
          description: 'Bad request - Invalid call ID or call already ended',
          ...errorResponseSchema
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - Anonymous users cannot end calls, or the requester is not an active participant of this call',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - Call does not exist',
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

      // Snapshot the ending participant's OWN CallParticipant row id BEFORE
      // endCall() runs — mirrors the leave route's `leavingCallParticipant`
      // capture just below, needed for the PARTICIPANT_LEFT broadcast in the
      // group-call-continues case (calling-stack audit 2026-08-16).
      const endingCallParticipant = call.participants.find(
        (p) => p.participantId === endParticipantId && !p.leftAt
      );

      const callSession = await callService.endCall(callId, userId, endParticipantId);
      // Parité socket call:end — invalide le cache de session `call:signal`
      // (TTL 2s) immédiatement après l'écriture de `leftAt`, comme tous les
      // handlers socket (call:end/call:leave/call:force-leave). Sans ceci,
      // un `call:signal` reçu dans la fenêtre TTL relaie encore de l'ICE/SDP
      // pour un appel déjà terminé côté REST.
      callService.invalidateSignalCache(callId);
      // Contrairement au handler socket `call:end`, cette route REST ne poste
      // pas le call-summary elle-même : sans ceci la bulle « Appel … en cours »
      // resterait orpheline. Fire-and-forget + idempotent (cf. finalizeCallSummary).
      callService.finalizeCallSummary(callId);
      // Parité socket call:end — diffuse `call:ended` au pair (WebRTC/CallKit
      // tear-down temps réel) au lieu d'attendre le GC ~120s. Auto-gardé terminal
      // — CallService.endCall() délègue désormais à leaveCall() (voir son
      // commentaire) quand l'appel est un GROUPE avec d'autres participants
      // actifs, donc `callSession` reste non-terminal ici et ce broadcast
      // est naturellement un no-op pour ce cas.
      callService.broadcastCallEndedIfTerminal(callSession, userId);
      // Group hang-up via REST (calling-stack audit 2026-08-16) — mirrors the
      // leave route's own `broadcastParticipantLeft` fix (2026-08-15): when
      // endCall() delegated to leaveCall() because other participants were
      // still active, the OTHER participants must still learn this one hung
      // up (roster/grid teardown for just their peer connection), even
      // though the call itself did not end. Unconditional like the socket
      // handler and the leave route (NOT gated on terminal status, unlike
      // broadcastCallEndedIfTerminal above) — broadcastParticipantLeft fires
      // on every leave/end by design, since it drives per-peer WebRTC
      // teardown regardless of whether the call itself also ends.
      if (endingCallParticipant) {
        callService.broadcastParticipantLeft(
          callId,
          endingCallParticipant.id,
          userId,
          callSession.mode
        );
      }

      return sendSuccess(reply, toCallSessionResponse(callSession));
    } catch (error: any) {
      // Issue #3581 — mirrors the socket `call:end` handler: `endCall()`
      // throws `CallAlreadyEndedError` when the call is ALREADY terminal
      // (retried request, or a race against another path that just resolved
      // it). The caller's intent already holds, so this is a 200 with the
      // call's current (terminal) session, not an error — and unlike the
      // nominal path above, nothing here re-broadcasts `call:ended`,
      // re-posts the call-summary, or touches `broadcastParticipantLeft`.
      if (error instanceof CallAlreadyEndedError) {
        logger.info('ℹ️ REST: call already ended — idempotent no-op', {
          callId: request.params.callId, endReason: error.endReason
        });
        const currentSession = await callService.getCallSession(request.params.callId);
        return sendSuccess(reply, toCallSessionResponse(currentSession));
      }

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
            pattern: OBJECT_ID_PATTERN
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

      return sendSuccess(reply, toCallSessionResponse(callSession));
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
            pattern: OBJECT_ID_PATTERN
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
          ...errorResponseSchema
        },
        401: {
          description: 'Unauthorized - Authentication required',
          ...errorResponseSchema
        },
        403: {
          description: 'Forbidden - Cannot remove other participants without moderator privileges',
          ...errorResponseSchema
        },
        404: {
          description: 'Not found - Call does not exist',
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
      const { callId, participantId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      logger.info('📞 REST: Leaving call', { callId, participantId, userId });

      const call = await callService.getCallSession(callId);

      // Resolve the caller's own conversation membership FIRST, unconditionally
      // — this is the only authorization check on this route, so it must run
      // whether the caller is leaving their own slot or removing someone else.
      // Previously this query only ran when `participantId !== userId`, so a
      // request targeting the caller's own userId (trivial for any client to
      // construct) skipped authorization entirely and reached
      // `callService.leaveCall()` unchecked — which unconditionally ends a
      // direct (1:1) call it doesn't recognize the participant of.
      const callerMembership = await prisma.participant.findFirst({
        where: {
          conversationId: call.conversationId,
          userId,
          isActive: true
        }
      });

      if (!callerMembership) {
        return sendForbidden(reply, 'NOT_A_PARTICIPANT');
      }

      // Verify user is leaving their own participation or has moderator rights.
      // Rank-based (not a string-equality allowlist) so `creator` — the
      // conversation's highest rank — clears this floor too; the old
      // `role === 'admin' || role === 'moderator'` check omitted it, so a
      // group call's own creator got PERMISSION_DENIED removing anyone.
      const callerRank = conversationRoleRank(callerMembership.role);
      if (participantId !== userId) {
        if (callerRank < MEMBER_ROLE_HIERARCHY[MemberRole.MODERATOR]) {
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
      } else if (participantId === userId) {
        leaveParticipantId = callerMembership.id;
      } else {
        // A registered target is resolved by `userId`. An anonymous
        // (shared-link) target has `Participant.userId: null`
        // (schema.prisma) — the roster key the client sends for them is
        // their OWN `Participant.id`, which the `userId:` lookup can never
        // match. Without this fallback, kicking an anonymous guest from a
        // group call failed unconditionally (403 NOT_A_PARTICIPANT) for
        // every caller, every time. The fallback re-resolves `participantId`
        // as a `Participant.id` directly — still scoped to THIS call's
        // conversation and `isActive: true`, exactly as trustworthy as the
        // `userId:` lookup above, so it stays a resolved, verified match and
        // never the raw-string fallback the comment below still forbids.
        const targetParticipant =
          (await prisma.participant.findFirst({
            where: { conversationId: call.conversationId, userId: participantId, isActive: true },
            select: { id: true, role: true }
          })) ??
          (await prisma.participant.findFirst({
            where: { conversationId: call.conversationId, id: participantId, isActive: true },
            select: { id: true, role: true }
          }));
        // Do NOT fall back to the raw, unresolved `participantId` string here
        // — that fallback is what previously let a caller with no real
        // relationship to this call's conversation reach
        // `callService.leaveCall()`'s idempotent-leave path, which
        // unconditionally ends a direct call it doesn't recognize the
        // participant of.
        if (!targetParticipant) {
          return sendForbidden(reply, 'NOT_A_PARTICIPANT');
        }
        // Vague 155 — the floor check above only asks "is the caller at
        // least a moderator?"; it never asked "does the caller outrank
        // THIS target?" A moderator (rank 20) could therefore remove an
        // admin (30) or the creator (40) from an active call — the one
        // role-gated mutation in this file that skipped the hierarchy
        // every sibling route (conversations/participants.ts role-update's
        // `creator` guard, PermissionsService.canManage) already enforces.
        // Equal rank does not outrank: two moderators cannot remove each
        // other via this route.
        if (callerRank <= conversationRoleRank(targetParticipant.role)) {
          return sendForbidden(reply, 'PERMISSION_DENIED');
        }
        leaveParticipantId = targetParticipant.id;
      }

      // Snapshot the leaving/kicked participant's OWN CallParticipant row id
      // BEFORE leaveCall() runs — this is what CallManager's store keys
      // removal on client-side (event.participantId), distinct from
      // `leaveParticipantId` above (the conversation Participant.id leaveCall
      // itself expects). Read from the pre-leave `call` snapshot, matching
      // the socket `call:leave` handler's own `callBefore` lookup.
      const leavingCallParticipant = call.participants.find(
        (p) => p.participantId === leaveParticipantId && !p.leftAt
      );

      // Bug fix (Vague 175) — `userId` here (and below, `broadcastCallEndedIfTerminal`'s
      // actor) must be the AUTHENTICATED CALLER, never the route's raw
      // `:participantId` param. For a self-leave the two coincide
      // (`participantId === userId`), which hid this on every OTHER site
      // exercising this route; a moderator KICK makes them diverge — the
      // route used to attribute the leave/end to the KICKED target instead
      // of the moderator who performed it, the one place in the codebase
      // where `endedBy`/`userId` didn't name the actor (every socket
      // handler — call:leave/call:end/call:force-leave — always passes its
      // own authenticated userId; there is no kick path through sockets).
      // `CallSession.metadata.endedBy` feeds `wasCancelledByInitiator()`
      // (packages/shared/utils/call-summary.ts) and `CallEndedEvent.endedBy`
      // is broadcast to every client on `call:ended`.
      const callSession = await callService.leaveCall({
        callId,
        userId,
        participantId: leaveParticipantId,
      });
      // Parité socket call:leave — invalide le cache de session `call:signal`
      // (TTL 2s), inconditionnellement comme le handler socket (un leave de
      // groupe qui ne termine pas l'appel écrit quand même `leftAt` pour le
      // partant — voir le commentaire sur invalidateSignalCache).
      callService.invalidateSignalCache(callId);
      // Idem que la route end : la route REST leave ne poste pas le summary.
      // No-op si l'appel de groupe continue (createCallSummaryMessage se garde
      // sur le statut terminal), finalise la bulle si l'appel s'est terminé.
      callService.finalizeCallSummary(callId);
      // Parité socket call:leave — diffuse `call:ended` au pair UNIQUEMENT si le
      // leave a rendu l'appel terminal (broadcastCallEndedIfTerminal auto-gardé).
      callService.broadcastCallEndedIfTerminal(callSession, userId);
      // Bug fix — cette route (self-leave ET kick modérateur) ne diffusait
      // JAMAIS `call:participant-left`, contrairement au handler socket
      // `call:leave` : les autres pairs d'un appel de groupe qui continue
      // gardaient le partant/l'exclu dans leur grille vidéo/roster et leur
      // RTCPeerConnection ouverte jusqu'au GC (~120s). Inconditionnel comme le
      // handler socket (pas seulement quand l'appel devient terminal).
      if (leavingCallParticipant) {
        callService.broadcastParticipantLeft(
          callId,
          leavingCallParticipant.id,
          participantId,
          callSession.mode
        );
      }

      return sendSuccess(reply, toCallSessionResponse(callSession));
    } catch (error: any) {
      // Vague 182 (#4202/Vague 181 follow-up) — mirrors the END route's own
      // CallAlreadyEndedError handling above and the socket call:leave
      // handler: leaveCall() throws it when this leave/kick lost the race
      // to a concurrent terminal write, not when it genuinely failed. The
      // caller's intent already holds, so this is a 200 with the call's
      // current (terminal) session, not an error — nothing here
      // re-broadcasts call:ended, re-posts the call-summary, or touches
      // broadcastParticipantLeft.
      if (error instanceof CallAlreadyEndedError) {
        logger.info('ℹ️ REST: call already ended — idempotent no-op', {
          callId: request.params.callId, endReason: error.endReason
        });
        const currentSession = await callService.getCallSession(request.params.callId);
        return sendSuccess(reply, toCallSessionResponse(currentSession));
      }

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
