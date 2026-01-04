/**
 * Voice Profile Routes
 *
 * API endpoints for voice profile management:
 * - POST /api/voice/profile/consent - Update consent for voice recording
 * - POST /api/voice/profile/register - Register new voice profile (10s min audio)
 * - PUT /api/voice/profile/:profileId - Update existing profile with fingerprint verification
 * - GET /api/voice/profile - Get profile details
 * - DELETE /api/voice/profile - Delete voice profile
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { VoiceProfileService, ConsentRequest, RegisterProfileRequest, UpdateProfileRequest } from '../services/voice-profile.service';
import { createUnifiedAuthMiddleware, UnifiedAuthContext } from '../middleware/auth';
import { ZMQSingleton } from '../services/zmq-singleton';

// Extend FastifyRequest to include auth
declare module 'fastify' {
  interface FastifyRequest {
    auth?: UnifiedAuthContext;
  }
}

export async function voiceProfileRoutes(fastify: FastifyInstance) {
  // Get services from Fastify instance
  const prisma = (fastify as any).prisma;

  if (!prisma) {
    console.error('[VoiceProfile] Missing required service: prisma');
    return;
  }

  // Get ZMQ client from singleton
  const zmqClient = await ZMQSingleton.getInstance();

  const voiceProfileService = new VoiceProfileService(prisma, zmqClient);
  const authMiddleware = createUnifiedAuthMiddleware({ requireRegistered: true });

  // ═══════════════════════════════════════════════════════════════════════════
  // CONSENT ENDPOINTS
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /consent - Update voice consent
   */
  fastify.post('/consent', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['voiceRecordingConsent'],
        properties: {
          voiceRecordingConsent: { type: 'boolean' },
          voiceCloningConsent: { type: 'boolean' },
          birthDate: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const consent = request.body as ConsentRequest;
    const result = await voiceProfileService.updateConsent(auth.registeredUser.id, consent);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  /**
   * GET /consent - Get consent status
   */
  fastify.get('/consent', {
    preHandler: authMiddleware
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const result = await voiceProfileService.getConsentStatus(auth.registeredUser.id);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE REGISTRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /register - Register new voice profile
   * Requires minimum 10 seconds of audio
   */
  fastify.post('/register', {
    preHandler: authMiddleware,
    schema: {
      body: {
        type: 'object',
        required: ['audioData', 'audioFormat'],
        properties: {
          audioData: { type: 'string', minLength: 100 },  // base64, minimum size check
          audioFormat: { type: 'string', enum: ['wav', 'mp3', 'ogg', 'webm', 'm4a'] }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const registerRequest = request.body as RegisterProfileRequest;
    const result = await voiceProfileService.registerProfile(auth.registeredUser.id, registerRequest);

    if (!result.success) {
      const statusCode = result.errorCode === 'CONSENT_REQUIRED' ? 403 :
                         result.errorCode === 'PROFILE_EXISTS' ? 409 : 400;
      return reply.status(statusCode).send(result);
    }

    return reply.status(201).send(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE UPDATE
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * PUT /:profileId - Update existing profile
   * Requires fingerprint verification (voice match)
   */
  fastify.put('/:profileId', {
    preHandler: authMiddleware,
    schema: {
      params: {
        type: 'object',
        required: ['profileId'],
        properties: {
          profileId: { type: 'string', minLength: 1 }
        }
      },
      body: {
        type: 'object',
        required: ['audioData', 'audioFormat'],
        properties: {
          audioData: { type: 'string', minLength: 100 },
          audioFormat: { type: 'string', enum: ['wav', 'mp3', 'ogg', 'webm', 'm4a'] }
        }
      }
    }
  }, async (request: FastifyRequest<{ Params: { profileId: string } }>, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const { profileId } = request.params;
    const updateRequest = request.body as UpdateProfileRequest;
    const result = await voiceProfileService.updateProfile(auth.registeredUser.id, profileId, updateRequest);

    if (!result.success) {
      const statusCode = result.errorCode === 'PROFILE_NOT_FOUND' ? 404 :
                         result.errorCode === 'PROFILE_MISMATCH' ? 403 : 400;
      return reply.status(statusCode).send(result);
    }

    return reply.send(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE RETRIEVAL
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * GET / - Get current user's voice profile
   */
  fastify.get('/', {
    preHandler: authMiddleware
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const result = await voiceProfileService.getProfile(auth.registeredUser.id);

    if (!result.success) {
      const statusCode = result.errorCode === 'PROFILE_NOT_FOUND' ? 404 : 400;
      return reply.status(statusCode).send(result);
    }

    return reply.send(result);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PROFILE DELETION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * DELETE / - Delete voice profile and revoke consent
   */
  fastify.delete('/', {
    preHandler: authMiddleware
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const auth = request.auth;
    if (!auth?.isAuthenticated || !auth.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const result = await voiceProfileService.deleteProfile(auth.registeredUser.id);

    if (!result.success) {
      return reply.status(400).send(result);
    }

    return reply.send(result);
  });

  console.log('[VoiceProfile] Routes registered: /consent, /register, /:profileId, /, DELETE /');
}
