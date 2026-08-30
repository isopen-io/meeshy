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
 *
 * Compositeur (issue #4284) : le détail de chaque route vit dans les
 * fichiers frères calls-shared.ts, calls-lifecycle.ts et
 * calls-consultation.ts.
 */

import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../middleware/auth.js';
import { CallService } from '../services/CallService.js';
import { registerCallsLifecycleRoutes } from './calls-lifecycle';
import { registerCallsConsultationRoutes } from './calls-consultation';

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

  const deps = { prisma, callService, requiredAuth };

  // Issue #4284 — routes regroupées par surface (calls-lifecycle.ts,
  // calls-consultation.ts) ; au sein de chaque surface, l'ordre relatif des
  // routes reste celui du fichier original.
  registerCallsLifecycleRoutes(fastify, deps);
  registerCallsConsultationRoutes(fastify, deps);
}
