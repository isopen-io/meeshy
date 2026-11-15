/**
 * Routes calls — types et dépendances PARTAGÉS entre calls-lifecycle.ts et
 * calls-consultation.ts (issue #4284). Point d'entrée : calls.ts.
 */
import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware } from '../middleware/auth.js';
import { CallService } from '../services/CallService.js';

export interface CallParams {
  callId: string;
}

export type CallRouteDeps = {
  prisma: FastifyInstance['prisma'];
  callService: CallService;
  requiredAuth: ReturnType<typeof createUnifiedAuthMiddleware>;
};
