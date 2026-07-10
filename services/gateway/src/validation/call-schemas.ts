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
 * GET /api/calls/active - Get active call for user (crash recovery)
 * No params or query needed — uses authenticated userId
 */
export const getActiveCallForUserSchema = z.object({});

/**
 * GET /api/calls/history - Paginated call journal (query params)
 * Parsed in-handler (mirrors the feed route), so this is the query shape only.
 */
export const callHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(30),
  cursor: objectIdSchema.optional(),
  filter: z.enum(['all', 'missed']).default('all')
});
export type CallHistoryQueryInput = z.infer<typeof callHistoryQuerySchema>;

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
    type: z.enum(['offer', 'answer', 'ice-candidate', 'ice-restart'], {
      error: () => 'Signal type must be offer, answer, ice-candidate, or ice-restart'
    }),
    from: z.string().min(1, 'from field is required'),
    to: z.string().min(1, 'to field is required'),
    // SDP data for offer/answer — size-capped and structurally validated.
    // Every RFC 4566 WebRTC SDP must contain "v=0" (version field, always first)
    // and at least one "m=" line (media description). A string that passes the
    // 50KB cap but lacks these fields is either malformed or a crafted payload
    // that could exploit the client-side SDP parser.
    sdp: z.string()
      .max(50000, 'SDP data exceeds maximum size of 50KB')
      .refine(
        (s) => s.includes('v=0') && s.includes('m='),
        'SDP must contain a version field (v=0) and at least one media line (m=) per RFC 4566'
      )
      .optional(),
    // ICE candidate data — validated against RFC 8445 candidate-attribute format.
    // An empty string is accepted as the end-of-candidates marker (§8.2.1).
    // Rejecting non-conforming strings prevents forwarding crafted payloads that
    // could trigger parser bugs in the peer's WebRTC implementation.
    candidate: z.string()
      .max(1000, 'ICE candidate exceeds maximum size of 1KB')
      .refine(
        (s) => s === '' || /^candidate:\S+/i.test(s),
        'ICE candidate must start with "candidate:" (RFC 8445) or be empty (end-of-candidates marker)'
      )
      .optional(),
    sdpMLineIndex: z.number().optional(),
    sdpMid: z.string().optional(),
    // §3.5 negotiation epoch — declared so Zod does not strip it from the
    // opaque relay payload (the gateway passes it through verbatim; the
    // receiving client uses it to drop stale offers/candidates).
    negotiationId: z.number().int().min(0).optional()
  }).refine(
    (data) => {
      if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice-restart') {
        return typeof data.sdp === 'string' && data.sdp.length > 0;
      }
      /* istanbul ignore else -- enum guarantees all 4 types are handled */
      if (data.type === 'ice-candidate') {
        return typeof data.candidate === 'string';
      }
      /* istanbul ignore next -- enum guarantees all 4 types handled above */
      return true;
    },
    {
      message: 'Invalid signal structure: offer/answer/ice-restart requires sdp, ice-candidate requires candidate'
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
 * Socket.IO Event: call:end
 */
export const socketEndCallSchema = z.object({
  callId: objectIdSchema,
  // Whitelist: only lowercase letters and underscores. Prevents XSS payloads
  // from being stored in call session metadata if the client later renders the
  // raw reason string. The service maps it to a known CallEndReason enum anyway,
  // but the gate here stops malicious payloads from reaching the DB or logs.
  reason: z.string().max(50).regex(/^[a-z_]+$/, 'End reason must contain only lowercase letters and underscores').optional()
});

/**
 * Socket.IO Event: call:heartbeat (fire-and-forget)
 */
export const socketHeartbeatSchema = z.object({
  callId: objectIdSchema
});

/**
 * Socket.IO Event: call:quality-report (fire-and-forget)
 */
export const socketQualityReportSchema = z.object({
  callId: objectIdSchema,
  stats: z.object({
    level: z.enum(['excellent', 'good', 'fair', 'poor']).optional(),
    packetLoss: z.number().min(0).max(100),
    rtt: z.number().min(0),
    bitrate: z.object({
      audio: z.number().min(0),
      video: z.number().min(0)
    }).optional(),
    jitter: z.number().min(0).optional(),
    timestamp: z.iso.datetime().or(z.date()).optional(),
    // Cumulative WebRTC byte counters (monotonic). The last report before
    // teardown carries the call totals, persisted to surface "data spent".
    bytesSent: z.number().min(0).optional(),
    bytesReceived: z.number().min(0).optional(),
    // TWCC GCC bandwidth estimate (bps). 0 or absent = TWCC not yet active.
    availableOutgoingBitrateBps: z.number().min(0).optional()
  })
});

/**
 * Socket.IO Event: call:reconnecting (fire-and-forget)
 */
export const socketReconnectingSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1),
  attempt: z.number().int().min(1).max(10)
});

/**
 * Socket.IO Event: call:reconnected (fire-and-forget)
 */
export const socketReconnectedSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1)
});

/**
 * Socket.IO Event: call:force-leave
 */
export const socketForceLeaveSchema = z.object({
  conversationId: objectIdSchema
});

/**
 * Socket.IO Event: call:transcription-segment (fire-and-forget)
 */
export const socketTranscriptionSegmentSchema = z.object({
  callId: objectIdSchema,
  segment: z.object({
    text: z.string().min(1).max(5000),
    speakerId: z.string().min(1),
    startMs: z.number().min(0),
    endMs: z.number().min(0),
    isFinal: z.boolean(),
    confidence: z.number().min(0).max(1),
    language: z.string().min(2).max(10)
  })
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
export type GetActiveCallForUserInput = z.infer<typeof getActiveCallForUserSchema>;
export type SocketInitiateCallInput = z.infer<typeof socketInitiateCallSchema>;
export type SocketJoinCallInput = z.infer<typeof socketJoinCallSchema>;
export type SocketLeaveCallInput = z.infer<typeof socketLeaveCallSchema>;
export type SocketSignalInput = z.infer<typeof socketSignalSchema>;
export type SocketMediaToggleInput = z.infer<typeof socketMediaToggleSchema>;
export type SocketEndCallInput = z.infer<typeof socketEndCallSchema>;
export type SocketHeartbeatInput = z.infer<typeof socketHeartbeatSchema>;
export type SocketQualityReportInput = z.infer<typeof socketQualityReportSchema>;
export type SocketReconnectingInput = z.infer<typeof socketReconnectingSchema>;
export type SocketReconnectedInput = z.infer<typeof socketReconnectedSchema>;
export type SocketForceLeaveInput = z.infer<typeof socketForceLeaveSchema>;
export type SocketTranscriptionSegmentInput = z.infer<typeof socketTranscriptionSegmentSchema>;

/**
 * Socket.IO Event: call:request-ice-servers (fire-and-forget, Client → Server)
 * Sent by the client near credential expiry to obtain fresh TURN credentials.
 */
export const socketRequestIceServersSchema = z.object({
  callId: objectIdSchema,
});
export type SocketRequestIceServersInput = z.infer<typeof socketRequestIceServersSchema>;

/**
 * Socket.IO Event: call:backgrounded (fire-and-forget, Client → Server)
 * Emitted when the app enters background while a call is active so the gateway
 * can extend heartbeat tolerance and skip socket-delivery for ringing.
 */
export const socketCallBackgroundedSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1),
});
export type SocketCallBackgroundedInput = z.infer<typeof socketCallBackgroundedSchema>;

/**
 * Socket.IO Event: call:foregrounded (fire-and-forget, Client → Server)
 * Emitted when the app returns to foreground so the gateway can reset heartbeat
 * tolerance and resume normal socket delivery for incoming calls.
 */
export const socketCallForegroundedSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1),
});
export type SocketCallForegroundedInput = z.infer<typeof socketCallForegroundedSchema>;

/**
 * Socket.IO Event: call:screen-capture-detected (fire-and-forget, Client → Server)
 * Emitted when UIScreen.isCaptured changes so the gateway can alert other
 * participants via call:screen-capture-alert.
 */
export const socketCallScreenCaptureDetectedSchema = z.object({
  callId: objectIdSchema,
  participantId: z.string().min(1),
  isCapturing: z.boolean(),
});
export type SocketCallScreenCaptureDetectedInput = z.infer<typeof socketCallScreenCaptureDetectedSchema>;
