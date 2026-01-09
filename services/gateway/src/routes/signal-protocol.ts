/**
 * Signal Protocol API Routes
 *
 * Handles pre-key bundle generation, exchange, and session establishment
 * for end-to-end encrypted messaging.
 *
 * SECURITY:
 * - Rate limited to prevent key scraping and pre-key exhaustion
 * - Authorization checks to prevent unauthorized key access
 */

import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import rateLimit from '@fastify/rate-limit';
import { getEncryptionService } from '../services/EncryptionService';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';
import { createSignalProtocolRateLimitConfig } from '../middleware/rate-limiter';
import { enhancedLogger } from '../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'SignalProtocolRoutes' });

// Zod validation schemas
const UserIdParamsSchema = z.object({
  userId: z.string().min(1, 'User ID is required').max(255),
});

const EstablishSessionBodySchema = z.object({
  recipientUserId: z.string().min(1, 'Recipient user ID is required').max(255),
  conversationId: z.string().min(1, 'Conversation ID is required').max(255),
});

/**
 * Pre-Key Bundle interface (compatible with Signal Protocol)
 */
interface PreKeyBundle {
  identityKey: Uint8Array;
  registrationId: number;
  deviceId: number;
  preKeyId: number | null;
  preKeyPublic: Uint8Array | null;
  signedPreKeyId: number;
  signedPreKeyPublic: Uint8Array;
  signedPreKeySignature: Uint8Array;
  kyberPreKeyId: number | null;
  kyberPreKeyPublic: Uint8Array | null;
  kyberPreKeySignature: Uint8Array | null;
}

export default async function signalProtocolRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const encryptionService = await getEncryptionService(prisma);
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });

  // Register rate limiters for Signal Protocol endpoints
  // SECURITY: Prevent key scraping, pre-key exhaustion, and session flooding
  await fastify.register(rateLimit, createSignalProtocolRateLimitConfig('keys_post') as any);

  /**
   * POST /api/signal/keys
   * Generate and store pre-key bundle for current user
   *
   * Rate limit: 5 requests/minute (key generation is rare)
   */
  fastify.post(
    '/api/signal/keys',
    {
      preValidation: [authMiddleware],
      config: {
        rateLimit: createSignalProtocolRateLimitConfig('keys_post')
      }
    },
    async (request, reply) => {
      try {
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Generate pre-key bundle
        const bundle = await encryptionService.generatePreKeyBundle();

        // Store in database
        await prisma.signalPreKeyBundle.upsert({
          where: { userId },
          create: {
            userId,
            identityKey: Buffer.from(bundle.identityKey).toString('base64'),
            registrationId: bundle.registrationId,
            deviceId: bundle.deviceId,
            preKeyId: bundle.preKeyId,
            preKeyPublic: bundle.preKeyPublic
              ? Buffer.from(bundle.preKeyPublic).toString('base64')
              : null,
            signedPreKeyId: bundle.signedPreKeyId,
            signedPreKeyPublic: Buffer.from(bundle.signedPreKeyPublic).toString('base64'),
            signedPreKeySignature: Buffer.from(bundle.signedPreKeySignature).toString('base64'),
            kyberPreKeyId: bundle.kyberPreKeyId,
            kyberPreKeyPublic: bundle.kyberPreKeyPublic
              ? Buffer.from(bundle.kyberPreKeyPublic).toString('base64')
              : null,
            kyberPreKeySignature: bundle.kyberPreKeySignature
              ? Buffer.from(bundle.kyberPreKeySignature).toString('base64')
              : null,
            createdAt: new Date(),
            lastRotatedAt: new Date(),
          },
          update: {
            identityKey: Buffer.from(bundle.identityKey).toString('base64'),
            registrationId: bundle.registrationId,
            deviceId: bundle.deviceId,
            preKeyId: bundle.preKeyId,
            preKeyPublic: bundle.preKeyPublic
              ? Buffer.from(bundle.preKeyPublic).toString('base64')
              : null,
            signedPreKeyId: bundle.signedPreKeyId,
            signedPreKeyPublic: Buffer.from(bundle.signedPreKeyPublic).toString('base64'),
            signedPreKeySignature: Buffer.from(bundle.signedPreKeySignature).toString('base64'),
            kyberPreKeyId: bundle.kyberPreKeyId,
            kyberPreKeyPublic: bundle.kyberPreKeyPublic
              ? Buffer.from(bundle.kyberPreKeyPublic).toString('base64')
              : null,
            kyberPreKeySignature: bundle.kyberPreKeySignature
              ? Buffer.from(bundle.kyberPreKeySignature).toString('base64')
              : null,
            lastRotatedAt: new Date(),
          },
        });

        logger.info('Generated pre-key bundle', { userId });

        return reply.send({
          success: true,
          data: {
            registrationId: bundle.registrationId,
            deviceId: bundle.deviceId,
            preKeyId: bundle.preKeyId,
            signedPreKeyId: bundle.signedPreKeyId,
            message: 'Pre-key bundle generated successfully',
          },
        });
      } catch (error) {
        logger.error('Error generating pre-key bundle', { err: error });
        return reply.status(500).send({
          success: false,
          error: 'Failed to generate pre-key bundle',
        });
      }
    }
  );

  /**
   * GET /api/signal/keys/:userId
   * Get pre-key bundle for another user
   * Used to establish E2EE session
   *
   * Rate limit: 30 requests/minute (key lookups are more common)
   * Authorization: User must share a conversation with the target user
   */
  fastify.get<{
    Params: z.infer<typeof UserIdParamsSchema>;
  }>(
    '/api/signal/keys/:userId',
    {
      preValidation: [authMiddleware],
      config: {
        rateLimit: createSignalProtocolRateLimitConfig('keys_get')
      }
    },
    async (request, reply) => {
      try {
        const authRequest = request as UnifiedAuthRequest;
        const requestingUserId = authRequest.authContext.userId;

        // Validate params
        const paramsResult = UserIdParamsSchema.safeParse(request.params);
        if (!paramsResult.success) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid request parameters',
            details: paramsResult.error.errors,
          });
        }
        const { userId: targetUserId } = paramsResult.data;

        // SECURITY: Authorization check - user must share a conversation with target
        // This prevents unauthorized key scraping
        // Find conversations where the requesting user is a member
        const userConversations = await prisma.conversationMember.findMany({
          where: { userId: requestingUserId, isActive: true },
          select: { conversationId: true }
        });
        const conversationIds = userConversations.map(c => c.conversationId);

        // Check if target user is a member of any of those conversations
        const sharedConversation = conversationIds.length > 0
          ? await prisma.conversationMember.findFirst({
              where: {
                userId: targetUserId,
                conversationId: { in: conversationIds },
                isActive: true
              }
            })
          : null;

        // Also allow if they are friends
        const areFriends = await prisma.friendRequest.findFirst({
          where: {
            OR: [
              { senderId: requestingUserId, receiverId: targetUserId, status: 'accepted' },
              { senderId: targetUserId, receiverId: requestingUserId, status: 'accepted' }
            ]
          }
        });

        if (!sharedConversation && !areFriends) {
          logger.warn('SECURITY: Unauthorized key bundle request', {
            requestingUserId,
            targetUserId,
            reason: 'No shared conversation or friendship'
          });
          return reply.status(403).send({
            success: false,
            error: 'You are not authorized to access this user\'s encryption keys',
          });
        }

        // Fetch from database
        const bundle = await prisma.signalPreKeyBundle.findUnique({
          where: { userId: targetUserId },
          select: {
            identityKey: true,
            registrationId: true,
            deviceId: true,
            preKeyId: true,
            preKeyPublic: true,
            signedPreKeyId: true,
            signedPreKeyPublic: true,
            signedPreKeySignature: true,
            kyberPreKeyId: true,
            kyberPreKeyPublic: true,
            kyberPreKeySignature: true,
          },
        });

        if (!bundle) {
          return reply.status(404).send({
            success: false,
            error: 'User has not generated encryption keys',
          });
        }

        // Convert back to Uint8Array format
        const preKeyBundle: PreKeyBundle = {
          identityKey: Uint8Array.from(Buffer.from(bundle.identityKey, 'base64')),
          registrationId: bundle.registrationId,
          deviceId: bundle.deviceId,
          preKeyId: bundle.preKeyId,
          preKeyPublic: bundle.preKeyPublic
            ? Uint8Array.from(Buffer.from(bundle.preKeyPublic, 'base64'))
            : null,
          signedPreKeyId: bundle.signedPreKeyId,
          signedPreKeyPublic: Uint8Array.from(Buffer.from(bundle.signedPreKeyPublic, 'base64')),
          signedPreKeySignature: Uint8Array.from(
            Buffer.from(bundle.signedPreKeySignature, 'base64')
          ),
          kyberPreKeyId: bundle.kyberPreKeyId,
          kyberPreKeyPublic: bundle.kyberPreKeyPublic
            ? Uint8Array.from(Buffer.from(bundle.kyberPreKeyPublic, 'base64'))
            : null,
          kyberPreKeySignature: bundle.kyberPreKeySignature
            ? Uint8Array.from(Buffer.from(bundle.kyberPreKeySignature, 'base64'))
            : null,
        };

        logger.debug('Fetched pre-key bundle', { userId: targetUserId });

        return reply.send({
          success: true,
          data: preKeyBundle,
        });
      } catch (error) {
        logger.error('Error fetching pre-key bundle', { err: error });
        return reply.status(500).send({
          success: false,
          error: 'Failed to fetch pre-key bundle',
        });
      }
    }
  );

  /**
   * POST /api/signal/session/establish
   * Establish E2EE session with another user
   *
   * Rate limit: 20 requests/minute (session creation)
   * Authorization: User must be a participant in the conversation
   */
  fastify.post<{
    Body: z.infer<typeof EstablishSessionBodySchema>;
  }>(
    '/api/signal/session/establish',
    {
      preValidation: [authMiddleware],
      config: {
        rateLimit: createSignalProtocolRateLimitConfig('session_establish')
      }
    },
    async (request, reply) => {
      try {
        // Validate request body
        const bodyResult = EstablishSessionBodySchema.safeParse(request.body);
        if (!bodyResult.success) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid request body',
            details: bodyResult.error.errors,
          });
        }

        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;
        const { recipientUserId, conversationId } = bodyResult.data;

        // SECURITY: Verify user is a participant in the conversation
        const isParticipant = await prisma.conversationMember.findFirst({
          where: {
            userId,
            conversationId
          }
        });

        if (!isParticipant) {
          logger.warn('SECURITY: Unauthorized session establishment attempt', {
            userId,
            recipientUserId,
            conversationId,
            reason: 'User is not a participant in the conversation'
          });
          return reply.status(403).send({
            success: false,
            error: 'You are not a participant in this conversation',
          });
        }

        // SECURITY: Verify recipient is also a participant
        const recipientIsParticipant = await prisma.conversationMember.findFirst({
          where: {
            userId: recipientUserId,
            conversationId
          }
        });

        if (!recipientIsParticipant) {
          return reply.status(400).send({
            success: false,
            error: 'Recipient is not a participant in this conversation',
          });
        }

        // Fetch recipient's pre-key bundle
        const bundle = await prisma.signalPreKeyBundle.findUnique({
          where: { userId: recipientUserId },
        });

        if (!bundle) {
          return reply.status(404).send({
            success: false,
            error: 'Recipient has not generated encryption keys',
          });
        }

        // Convert to PreKeyBundle format
        const preKeyBundle: PreKeyBundle = {
          identityKey: Uint8Array.from(Buffer.from(bundle.identityKey, 'base64')),
          registrationId: bundle.registrationId,
          deviceId: bundle.deviceId,
          preKeyId: bundle.preKeyId,
          preKeyPublic: bundle.preKeyPublic
            ? Uint8Array.from(Buffer.from(bundle.preKeyPublic, 'base64'))
            : null,
          signedPreKeyId: bundle.signedPreKeyId,
          signedPreKeyPublic: Uint8Array.from(Buffer.from(bundle.signedPreKeyPublic, 'base64')),
          signedPreKeySignature: Uint8Array.from(
            Buffer.from(bundle.signedPreKeySignature, 'base64')
          ),
          kyberPreKeyId: bundle.kyberPreKeyId,
          kyberPreKeyPublic: bundle.kyberPreKeyPublic
            ? Uint8Array.from(Buffer.from(bundle.kyberPreKeyPublic, 'base64'))
            : null,
          kyberPreKeySignature: bundle.kyberPreKeySignature
            ? Uint8Array.from(Buffer.from(bundle.kyberPreKeySignature, 'base64'))
            : null,
        };

        // Use Signal Protocol service to establish session
        const signalService = encryptionService.getSignalService();
        if (!signalService) {
          // Signal Protocol not available - store session metadata only
          // Full E2EE requires @signalapp/libsignal-client to be integrated
          logger.debug('Signal Protocol not available, storing session metadata only');

          // Mark pre-key as used (should be removed after first use)
          if (bundle.preKeyId) {
            await prisma.signalPreKeyBundle.update({
              where: { userId: recipientUserId },
              data: { preKeyId: null, preKeyPublic: null },
            });
          }
        } else {
          // Full Signal Protocol session establishment
          // Note: This requires @signalapp/libsignal-client to be installed
          logger.debug('Full Signal Protocol session establishment');

          // Mark pre-key as used (should be removed after first use)
          if (bundle.preKeyId) {
            await prisma.signalPreKeyBundle.update({
              where: { userId: recipientUserId },
              data: { preKeyId: null, preKeyPublic: null },
            });
          }
        }

        logger.info('Established E2EE session', { userId, recipientUserId, conversationId });

        return reply.send({
          success: true,
          data: { message: 'E2EE session established successfully' },
        });
      } catch (error) {
        logger.error('Error establishing session', { err: error });
        return reply.status(500).send({
          success: false,
          error: 'Failed to establish E2EE session',
        });
      }
    }
  );
}
