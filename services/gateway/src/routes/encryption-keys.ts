/**
 * Encryption Key Exchange Routes
 *
 * Handles Signal Protocol key exchange for E2EE conversations:
 * - Store and retrieve public keys for E2EE
 * - Generate and publish pre-key bundles
 * - Get pre-key bundles for session initialization
 *
 * These routes support the Signal Protocol key exchange process
 * needed for end-to-end encrypted conversations.
 */

import { FastifyInstance } from 'fastify';
import { getEncryptionService } from '../services/EncryptionService';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';

/**
 * Request/Response Types
 */
interface ConversationParams {
  conversationId: string;
}

interface KeyExchangeBody {
  publicKey: string;
  keyType: 'identity' | 'preKey' | 'signedPreKey';
  keyId?: number;
  signature?: string;
}

interface PublishPreKeyBundleBody {
  identityKey: string;
  registrationId: number;
  deviceId: number;
  preKeyId: number | null;
  preKeyPublic: string | null;
  signedPreKeyId: number;
  signedPreKeyPublic: string;
  signedPreKeySignature: string;
  kyberPreKeyId?: number | null;
  kyberPreKeyPublic?: string | null;
  kyberPreKeySignature?: string | null;
}

/**
 * Encryption Keys Routes
 */
export default async function encryptionKeysRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const encryptionService = getEncryptionService(prisma);
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });

  /**
   * POST /api/conversations/:conversationId/keys/exchange
   *
   * Exchange public keys with other participants in a conversation.
   * This route stores the user's public key and returns other participants' keys.
   *
   * Used for establishing E2EE sessions in a conversation.
   */
  fastify.post<{
    Params: ConversationParams;
    Body: KeyExchangeBody;
  }>(
    '/api/conversations/:conversationId/keys/exchange',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params as ConversationParams;
        const { publicKey, keyType, keyId, signature } = request.body as KeyExchangeBody;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Verify conversation exists and user is a member
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            encryptionMode: true,
            encryptionEnabledAt: true,
            members: {
              where: { isActive: true },
              select: {
                userId: true,
                user: {
                  select: {
                    id: true,
                    username: true,
                  }
                }
              }
            }
          }
        });

        if (!conversation) {
          return reply.status(404).send({
            success: false,
            error: 'Conversation not found'
          });
        }

        // Check if user is a member
        const isMember = conversation.members.some(m => m.userId === userId);
        if (!isMember) {
          return reply.status(403).send({
            success: false,
            error: 'Not a member of this conversation'
          });
        }

        // Check if conversation has E2EE enabled
        if (!conversation.encryptionEnabledAt ||
            (conversation.encryptionMode !== 'e2ee' && conversation.encryptionMode !== 'hybrid')) {
          return reply.status(400).send({
            success: false,
            error: 'Conversation does not have E2EE enabled'
          });
        }

        // Validate key format (base64)
        if (!/^[A-Za-z0-9+/=]+$/.test(publicKey)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid public key format. Must be base64 encoded.'
          });
        }

        // Store the user's public key in the database
        const keyData = {
          userId,
          conversationId,
          keyType,
          publicKey,
          keyId,
          signature,
          createdAt: new Date(),
        };

        // Upsert the key (update if exists, create if not)
        const storedKey = await prisma.conversationPublicKey.upsert({
          where: {
            userId_conversationId_keyType: {
              userId,
              conversationId,
              keyType,
            }
          },
          create: keyData,
          update: {
            publicKey,
            keyId,
            signature,
            updatedAt: new Date(),
          },
        });

        // Get other participants' public keys
        const otherMemberIds = conversation.members
          .map(m => m.userId)
          .filter(id => id !== userId);

        const otherKeys = await prisma.conversationPublicKey.findMany({
          where: {
            conversationId,
            userId: { in: otherMemberIds },
            keyType,
          },
          include: {
            user: {
              select: {
                id: true,
                username: true,
              }
            }
          }
        });

        console.log(`[EncryptionKeys] Key exchange for user ${userId} in conversation ${conversationId}`);

        return reply.send({
          success: true,
          data: {
            stored: {
              keyType: storedKey.keyType,
              keyId: storedKey.keyId,
              createdAt: storedKey.createdAt,
            },
            participantKeys: otherKeys.map(key => ({
              userId: key.userId,
              username: key.user.username,
              publicKey: key.publicKey,
              keyType: key.keyType,
              keyId: key.keyId,
              signature: key.signature,
            }))
          },
          message: 'Key exchange successful'
        });

      } catch (error) {
        console.error('[EncryptionKeys] Error during key exchange:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error during key exchange'
        });
      }
    }
  );

  /**
   * GET /api/conversations/:conversationId/keys/bundle
   *
   * Get pre-key bundle for Signal Protocol initialization.
   * Returns the current user's complete pre-key bundle for establishing
   * E2EE sessions with other participants.
   *
   * If no bundle exists, generates a new one automatically.
   */
  fastify.get<{
    Params: ConversationParams;
  }>(
    '/api/conversations/:conversationId/keys/bundle',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params as ConversationParams;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Verify conversation exists and user is a member
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            encryptionMode: true,
            encryptionEnabledAt: true,
            members: {
              where: { isActive: true, userId },
              select: { userId: true }
            }
          }
        });

        if (!conversation) {
          return reply.status(404).send({
            success: false,
            error: 'Conversation not found'
          });
        }

        // Check if user is a member
        if (conversation.members.length === 0) {
          return reply.status(403).send({
            success: false,
            error: 'Not a member of this conversation'
          });
        }

        // Check if conversation has E2EE enabled
        if (!conversation.encryptionEnabledAt ||
            (conversation.encryptionMode !== 'e2ee' && conversation.encryptionMode !== 'hybrid')) {
          return reply.status(400).send({
            success: false,
            error: 'Conversation does not have E2EE enabled'
          });
        }

        // Try to get existing pre-key bundle
        let bundle = await prisma.signalPreKeyBundle.findUnique({
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
            createdAt: true,
            lastRotatedAt: true,
          }
        });

        // If no bundle exists, generate one
        if (!bundle) {
          console.log(`[EncryptionKeys] No pre-key bundle found for user ${userId}, generating new one...`);

          const generatedBundle = await encryptionService.generatePreKeyBundle();

          // Store in database
          const storedBundle = await prisma.signalPreKeyBundle.create({
            data: {
              userId,
              identityKey: Buffer.from(generatedBundle.identityKey).toString('base64'),
              registrationId: generatedBundle.registrationId,
              deviceId: generatedBundle.deviceId,
              preKeyId: generatedBundle.preKeyId,
              preKeyPublic: generatedBundle.preKeyPublic
                ? Buffer.from(generatedBundle.preKeyPublic).toString('base64')
                : null,
              signedPreKeyId: generatedBundle.signedPreKeyId,
              signedPreKeyPublic: Buffer.from(generatedBundle.signedPreKeyPublic).toString('base64'),
              signedPreKeySignature: Buffer.from(generatedBundle.signedPreKeySignature).toString('base64'),
              kyberPreKeyId: generatedBundle.kyberPreKeyId,
              kyberPreKeyPublic: generatedBundle.kyberPreKeyPublic
                ? Buffer.from(generatedBundle.kyberPreKeyPublic).toString('base64')
                : null,
              kyberPreKeySignature: generatedBundle.kyberPreKeySignature
                ? Buffer.from(generatedBundle.kyberPreKeySignature).toString('base64')
                : null,
              createdAt: new Date(),
              lastRotatedAt: new Date(),
            }
          });

          bundle = storedBundle;
        }

        console.log(`[EncryptionKeys] Retrieved pre-key bundle for user ${userId} in conversation ${conversationId}`);

        return reply.send({
          success: true,
          data: {
            identityKey: bundle.identityKey,
            registrationId: bundle.registrationId,
            deviceId: bundle.deviceId,
            preKeyId: bundle.preKeyId,
            preKeyPublic: bundle.preKeyPublic,
            signedPreKeyId: bundle.signedPreKeyId,
            signedPreKeyPublic: bundle.signedPreKeyPublic,
            signedPreKeySignature: bundle.signedPreKeySignature,
            kyberPreKeyId: bundle.kyberPreKeyId,
            kyberPreKeyPublic: bundle.kyberPreKeyPublic,
            kyberPreKeySignature: bundle.kyberPreKeySignature,
            createdAt: bundle.createdAt,
            lastRotatedAt: bundle.lastRotatedAt,
          }
        });

      } catch (error) {
        console.error('[EncryptionKeys] Error retrieving pre-key bundle:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error retrieving pre-key bundle'
        });
      }
    }
  );

  /**
   * POST /api/conversations/:conversationId/keys/publish
   *
   * Publish user's pre-key bundle to the server.
   * This allows other participants to retrieve the bundle and establish
   * E2EE sessions.
   *
   * Client-generated bundles should be published using this endpoint.
   */
  fastify.post<{
    Params: ConversationParams;
    Body: PublishPreKeyBundleBody;
  }>(
    '/api/conversations/:conversationId/keys/publish',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const { conversationId } = request.params as ConversationParams;
        const bundleData = request.body as PublishPreKeyBundleBody;
        const authRequest = request as UnifiedAuthRequest;
        const userId = authRequest.authContext.userId;

        // Verify conversation exists and user is a member
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          select: {
            id: true,
            encryptionMode: true,
            encryptionEnabledAt: true,
            members: {
              where: { isActive: true, userId },
              select: { userId: true }
            }
          }
        });

        if (!conversation) {
          return reply.status(404).send({
            success: false,
            error: 'Conversation not found'
          });
        }

        // Check if user is a member
        if (conversation.members.length === 0) {
          return reply.status(403).send({
            success: false,
            error: 'Not a member of this conversation'
          });
        }

        // Check if conversation has E2EE enabled
        if (!conversation.encryptionEnabledAt ||
            (conversation.encryptionMode !== 'e2ee' && conversation.encryptionMode !== 'hybrid')) {
          return reply.status(400).send({
            success: false,
            error: 'Conversation does not have E2EE enabled'
          });
        }

        // Validate required fields
        if (!bundleData.identityKey || !bundleData.signedPreKeyPublic || !bundleData.signedPreKeySignature) {
          return reply.status(400).send({
            success: false,
            error: 'Missing required fields: identityKey, signedPreKeyPublic, signedPreKeySignature'
          });
        }

        // Validate base64 format for all keys
        const base64Regex = /^[A-Za-z0-9+/=]+$/;
        if (!base64Regex.test(bundleData.identityKey) ||
            !base64Regex.test(bundleData.signedPreKeyPublic) ||
            !base64Regex.test(bundleData.signedPreKeySignature) ||
            (bundleData.preKeyPublic && !base64Regex.test(bundleData.preKeyPublic)) ||
            (bundleData.kyberPreKeyPublic && !base64Regex.test(bundleData.kyberPreKeyPublic)) ||
            (bundleData.kyberPreKeySignature && !base64Regex.test(bundleData.kyberPreKeySignature))) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid key format. All keys must be base64 encoded.'
          });
        }

        // Store pre-key bundle
        const bundle = await prisma.signalPreKeyBundle.upsert({
          where: { userId },
          create: {
            userId,
            identityKey: bundleData.identityKey,
            registrationId: bundleData.registrationId,
            deviceId: bundleData.deviceId,
            preKeyId: bundleData.preKeyId,
            preKeyPublic: bundleData.preKeyPublic,
            signedPreKeyId: bundleData.signedPreKeyId,
            signedPreKeyPublic: bundleData.signedPreKeyPublic,
            signedPreKeySignature: bundleData.signedPreKeySignature,
            kyberPreKeyId: bundleData.kyberPreKeyId || null,
            kyberPreKeyPublic: bundleData.kyberPreKeyPublic || null,
            kyberPreKeySignature: bundleData.kyberPreKeySignature || null,
            createdAt: new Date(),
            lastRotatedAt: new Date(),
          },
          update: {
            identityKey: bundleData.identityKey,
            registrationId: bundleData.registrationId,
            deviceId: bundleData.deviceId,
            preKeyId: bundleData.preKeyId,
            preKeyPublic: bundleData.preKeyPublic,
            signedPreKeyId: bundleData.signedPreKeyId,
            signedPreKeyPublic: bundleData.signedPreKeyPublic,
            signedPreKeySignature: bundleData.signedPreKeySignature,
            kyberPreKeyId: bundleData.kyberPreKeyId || null,
            kyberPreKeyPublic: bundleData.kyberPreKeyPublic || null,
            kyberPreKeySignature: bundleData.kyberPreKeySignature || null,
            lastRotatedAt: new Date(),
          },
        });

        console.log(`[EncryptionKeys] Published pre-key bundle for user ${userId} in conversation ${conversationId}`);

        return reply.send({
          success: true,
          data: {
            registrationId: bundle.registrationId,
            deviceId: bundle.deviceId,
            preKeyId: bundle.preKeyId,
            signedPreKeyId: bundle.signedPreKeyId,
            publishedAt: bundle.lastRotatedAt,
          },
          message: 'Pre-key bundle published successfully'
        });

      } catch (error) {
        console.error('[EncryptionKeys] Error publishing pre-key bundle:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error publishing pre-key bundle'
        });
      }
    }
  );
}
