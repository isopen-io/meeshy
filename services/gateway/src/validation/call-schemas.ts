/**
 * Call Validation Schemas - Zod validation for call-related inputs
 *
 * CVE-006 Fix: Comprehensive input validation to prevent injection attacks
 * and ensure data integrity for all call operations
 */

import { z } from 'zod';
import {
  callTypeEnum,
  CommonSchemas,
  type VCallType,
} from '@meeshy/shared/utils/validation';

/**
 * Validates MongoDB ObjectId format (24 hex characters)
 * Re-exported from shared CommonSchemas.mongoId
 */
const objectIdSchema = CommonSchemas.mongoId;

/**
 * Call type enum - re-exported from shared
 */
const callTypeSchema = callTypeEnum;

/**
 * Call settings schema
 */
const callSettingsSchema = z
  .object({
    audioEnabled: z.boolean().optional(),
    videoEnabled: z.boolean().optional(),
    screenShareEnabled: z.boolean().optional()
  })
  .optional();

/**
 * Join call settings schema
 */
const joinCallSettingsSchema = z
  .object({
    audioEnabled: z.boolean().optional(),
    videoEnabled: z.boolean().optional()
  })
  .optional();

/**
 * POST /api/calls - Initiate call
 */
export const initiateCallSchema = z.object({
  body: z.object({
    conversationId: objectIdSchema,
    type: callTypeSchema,
    settings: callSettingsSchema
  })
});

/**
 * GET /api/calls/:callId - Get call details
 */
export const getCallSchema = z.object({
  params: z.object({
    callId: objectIdSchema
  })
});

/**
 * DELETE /api/calls/:callId - End call
 */
export const endCallSchema = z.object({
  params: z.object({
    callId: objectIdSchema
  })
});

/**
 * POST /api/calls/:callId/participants - Join call
 */
export const joinCallSchema = z.object({
  params: z.object({
    callId: objectIdSchema
  }),
  body: z.object({
    settings: joinCallSettingsSchema
  }).optional()
});

/**
 * DELETE /api/calls/:callId/participants/:participantId - Leave call
 */
export const leaveCallSchema = z.object({
  params: z.object({
    callId: objectIdSchema,
    participantId: z.string().min(1, 'participantId is required')
  })
});

/**
 * GET /api/conversations/:conversationId/active-call
 */
export const getActiveCallSchema = z.object({
  params: z.object({
    conversationId: objectIdSchema
  })
});

/**
 * Socket.IO Event: call:initiate
 */
export const socketInitiateCallSchema = z.object({
  conversationId: objectIdSchema,
  type: callTypeSchema,
  settings: callSettingsSchema
});

/**
 * Socket.IO Event: call:join
 */
export const socketJoinCallSchema = z.object({
  callId: objectIdSchema,
  settings: joinCallSettingsSchema
});

/**
 * Socket.IO Event: call:leave
 */
export const socketLeaveCallSchema = z.object({
  callId: objectIdSchema
});

/**
 * Socket.IO Event: call:signal
 *
 * Validates WebRTC signaling data with strict size limits
 */
export const socketSignalSchema = z.object({
  callId: objectIdSchema,
  signal: z.object({
    type: z.enum(['offer', 'answer', 'ice-candidate'], {
      errorMap: () => ({ message: 'Signal type must be offer, answer, or ice-candidate' })
    }),
    from: z.string().min(1, 'from field is required'),
    to: z.string().min(1, 'to field is required'),
    // SDP data for offer/answer
    sdp: z.string().max(50000, 'SDP data exceeds maximum size of 50KB').optional(),
    // ICE candidate data
    candidate: z.string().max(1000, 'ICE candidate exceeds maximum size of 1KB').optional(),
    sdpMLineIndex: z.number().optional(),
    sdpMid: z.string().optional()
  }).refine(
    (data) => {
      // Offer/answer must have sdp, ice-candidate must have candidate
      if (data.type === 'offer' || data.type === 'answer') {
        return typeof data.sdp === 'string' && data.sdp.length > 0;
      }
      if (data.type === 'ice-candidate') {
        return typeof data.candidate === 'string';
      }
      return true;
    },
    {
      message: 'Invalid signal structure: offer/answer requires sdp, ice-candidate requires candidate'
    }
  )
});

/**
 * Socket.IO Event: call:toggle-audio / call:toggle-video
 */
export const socketMediaToggleSchema = z.object({
  callId: objectIdSchema,
  enabled: z.boolean(),
  mediaType: z.enum(['audio', 'video']).optional(),
  participantId: z.string().optional()
});

/**
 * Type exports for TypeScript
 */
export type InitiateCallInput = z.infer<typeof initiateCallSchema>;
export type GetCallInput = z.infer<typeof getCallSchema>;
export type EndCallInput = z.infer<typeof endCallSchema>;
export type JoinCallInput = z.infer<typeof joinCallSchema>;
export type LeaveCallInput = z.infer<typeof leaveCallSchema>;
export type GetActiveCallInput = z.infer<typeof getActiveCallSchema>;
export type SocketInitiateCallInput = z.infer<typeof socketInitiateCallSchema>;
export type SocketJoinCallInput = z.infer<typeof socketJoinCallSchema>;
export type SocketLeaveCallInput = z.infer<typeof socketLeaveCallSchema>;
export type SocketSignalInput = z.infer<typeof socketSignalSchema>;
export type SocketMediaToggleInput = z.infer<typeof socketMediaToggleSchema>;
