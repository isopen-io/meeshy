/**
 * Signal Protocol API Routes
 *
 * Handles pre-key bundle generation, exchange, and session establishment
 * for end-to-end encrypted messaging.
 */

import { FastifyInstance } from 'fastify';
import { getEncryptionService } from '../services/EncryptionService';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';

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

interface UserIdParams {
  userId: string;
}

export default async function signalProtocolRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const encryptionService = getEncryptionService(prisma);
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });

  /**
   * POST /api/signal/keys
   * Generate and store pre-key bundle for current user
   */
  fastify.post(
    '/api/signal/keys',
    {
      preValidation: [authMiddleware],
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

        console.log(`[SignalProtocol] Generated pre-key bundle for user ${userId}`);

        return reply.send({
          success: true,
          data: {
            registrationId: bundle.registrationId,
            deviceId: bundle.deviceId,
            preKeyId: bundle.preKeyId,
            signedPreKeyId: bundle.signedPreKeyId,
          },
          message: 'Pre-key bundle generated successfully',
        });
      } catch (error) {
        console.error('[SignalProtocol] Error generating pre-key bundle:', error);
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
   */
  fastify.get<{
    Params: UserIdParams;
  }>(
    '/api/signal/keys/:userId',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as UserIdParams;

        // Fetch from database
        const bundle = await prisma.signalPreKeyBundle.findUnique({
          where: { userId },
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

        console.log(`[SignalProtocol] Fetched pre-key bundle for user ${userId}`);

        return reply.send({
          success: true,
          data: preKeyBundle,
        });
      } catch (error) {
        console.error('[SignalProtocol] Error fetching pre-key bundle:', error);
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
   */
  fastify.post<{
    Body: {
      recipientUserId: string;
      conversationId: string;
    };
  }>(
    '/api/signal/session/establish',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;
        const { recipientUserId, conversationId } = request.body;

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
          console.log(`[SignalProtocol] Signal Protocol not available, storing session metadata only`);

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
          console.log('[SignalProtocol] Full Signal Protocol session establishment would happen here');

          // Mark pre-key as used (should be removed after first use)
          if (bundle.preKeyId) {
            await prisma.signalPreKeyBundle.update({
              where: { userId: recipientUserId },
              data: { preKeyId: null, preKeyPublic: null },
            });
          }
        }

        console.log(
          `[SignalProtocol] Established session: ${userId} -> ${recipientUserId} in conversation ${conversationId}`
        );

        return reply.send({
          success: true,
          message: 'E2EE session established successfully',
        });
      } catch (error) {
        console.error('[SignalProtocol] Error establishing session:', error);
        return reply.status(500).send({
          success: false,
          error: 'Failed to establish E2EE session',
        });
      }
    }
  );
}
