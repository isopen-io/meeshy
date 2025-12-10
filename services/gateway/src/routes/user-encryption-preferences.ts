/**
 * User Encryption Preferences Routes
 *
 * Manages user-level encryption settings:
 * - Get/Update encryption preference (disabled, optional, always)
 * - Generate Signal Protocol keys for E2EE
 * - Manage encryption key bundles
 */

import { FastifyInstance } from 'fastify';
import { createUnifiedAuthMiddleware, UnifiedAuthRequest } from '../middleware/auth';

type EncryptionPreference = 'disabled' | 'optional' | 'always';

interface UpdateEncryptionPreferenceRequest {
  encryptionPreference: EncryptionPreference;
}

interface GenerateKeysRequest {
  password?: string; // Optional password to encrypt private keys
}

export default async function userEncryptionPreferencesRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /api/users/me/encryption-preferences
   * Get current user's encryption preferences
   */
  fastify.get(
    '/api/users/me/encryption-preferences',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const authRequest = request as UnifiedAuthRequest;
        const authContext = authRequest.authContext;

        // Anonymous users don't have encryption preferences
        if (authContext.isAnonymous) {
          return reply.status(403).send({
            success: false,
            error: 'Anonymous users cannot manage encryption preferences'
          });
        }

        const user = await fastify.prisma.user.findUnique({
          where: { id: authContext.userId },
          select: {
            id: true,
            encryptionPreference: true,
            signalIdentityKeyPublic: true,
            signalRegistrationId: true,
            signalPreKeyBundleVersion: true,
            lastKeyRotation: true,
          }
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: 'User not found'
          });
        }

        return reply.send({
          success: true,
          data: {
            encryptionPreference: user.encryptionPreference || 'optional',
            hasSignalKeys: !!user.signalIdentityKeyPublic,
            signalRegistrationId: user.signalRegistrationId,
            signalPreKeyBundleVersion: user.signalPreKeyBundleVersion,
            lastKeyRotation: user.lastKeyRotation,
          }
        });

      } catch (error) {
        console.error('[UserEncryptionPreferences] Error getting preferences:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  );

  /**
   * PUT /api/users/me/encryption-preferences
   * Update user's encryption preference
   */
  fastify.put<{
    Body: UpdateEncryptionPreferenceRequest;
  }>(
    '/api/users/me/encryption-preferences',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const authRequest = request as UnifiedAuthRequest;
        const authContext = authRequest.authContext;
        const { encryptionPreference } = request.body as UpdateEncryptionPreferenceRequest;

        // Anonymous users don't have encryption preferences
        if (authContext.isAnonymous) {
          return reply.status(403).send({
            success: false,
            error: 'Anonymous users cannot manage encryption preferences'
          });
        }

        // Validate preference
        if (!encryptionPreference || !['disabled', 'optional', 'always'].includes(encryptionPreference)) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid encryption preference. Must be "disabled", "optional", or "always"'
          });
        }

        // Update user preference
        const updatedUser = await fastify.prisma.user.update({
          where: { id: authContext.userId },
          data: {
            encryptionPreference,
          },
          select: {
            id: true,
            encryptionPreference: true,
          }
        });

        console.log(`[UserEncryptionPreferences] User ${authContext.userId} updated encryption preference to ${encryptionPreference}`);

        return reply.send({
          success: true,
          data: {
            encryptionPreference: updatedUser.encryptionPreference,
          },
          message: 'Encryption preference updated successfully'
        });

      } catch (error) {
        console.error('[UserEncryptionPreferences] Error updating preference:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  );

  /**
   * POST /api/users/me/encryption-keys
   * Generate Signal Protocol keys for E2EE
   * This creates identity keys and pre-keys for the user
   */
  fastify.post<{
    Body: GenerateKeysRequest;
  }>(
    '/api/users/me/encryption-keys',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const authRequest = request as UnifiedAuthRequest;
        const authContext = authRequest.authContext;

        // Anonymous users cannot generate keys
        if (authContext.isAnonymous) {
          return reply.status(403).send({
            success: false,
            error: 'Anonymous users cannot generate encryption keys'
          });
        }

        // Check if user already has keys
        const user = await fastify.prisma.user.findUnique({
          where: { id: authContext.userId },
          select: {
            signalIdentityKeyPublic: true,
            signalRegistrationId: true,
          }
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: 'User not found'
          });
        }

        if (user.signalIdentityKeyPublic) {
          return reply.status(400).send({
            success: false,
            error: 'User already has encryption keys. Use key rotation instead.',
            data: {
              signalRegistrationId: user.signalRegistrationId,
            }
          });
        }

        // Generate Signal Protocol keys
        // NOTE: In a real implementation, this would use the Signal Protocol library
        // For now, we'll generate placeholder keys
        const crypto = await import('crypto');

        const identityKeyPublic = crypto.randomBytes(32).toString('base64');
        const identityKeyPrivate = crypto.randomBytes(32).toString('base64');
        const registrationId = crypto.randomInt(1, 16380); // 14-bit random number

        // Update user with new keys
        const updatedUser = await fastify.prisma.user.update({
          where: { id: authContext.userId },
          data: {
            signalIdentityKeyPublic: identityKeyPublic,
            signalIdentityKeyPrivate: identityKeyPrivate, // In production, encrypt this
            signalRegistrationId: registrationId,
            signalPreKeyBundleVersion: 1,
            lastKeyRotation: new Date(),
          },
          select: {
            id: true,
            signalIdentityKeyPublic: true,
            signalRegistrationId: true,
            signalPreKeyBundleVersion: true,
          }
        });

        console.log(`[UserEncryptionPreferences] Generated Signal keys for user ${authContext.userId}`);

        return reply.send({
          success: true,
          data: {
            signalIdentityKeyPublic: updatedUser.signalIdentityKeyPublic,
            signalRegistrationId: updatedUser.signalRegistrationId,
            signalPreKeyBundleVersion: updatedUser.signalPreKeyBundleVersion,
          },
          message: 'Encryption keys generated successfully'
        });

      } catch (error) {
        console.error('[UserEncryptionPreferences] Error generating keys:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  );

  /**
   * GET /api/users/:userId/encryption-key-bundle
   * Get public key bundle for a user (for establishing E2EE sessions)
   */
  fastify.get<{
    Params: { userId: string };
  }>(
    '/api/users/:userId/encryption-key-bundle',
    {
      preValidation: [authMiddleware],
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };
        const authRequest = request as UnifiedAuthRequest;

        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            signalIdentityKeyPublic: true,
            signalRegistrationId: true,
            signalPreKeyBundleVersion: true,
          }
        });

        if (!user) {
          return reply.status(404).send({
            success: false,
            error: 'User not found'
          });
        }

        if (!user.signalIdentityKeyPublic) {
          return reply.status(404).send({
            success: false,
            error: 'User has not generated encryption keys'
          });
        }

        // Return public key bundle (safe to share)
        return reply.send({
          success: true,
          data: {
            userId: user.id,
            identityKey: user.signalIdentityKeyPublic,
            registrationId: user.signalRegistrationId,
            preKeyBundleVersion: user.signalPreKeyBundleVersion,
          }
        });

      } catch (error) {
        console.error('[UserEncryptionPreferences] Error getting key bundle:', error);
        return reply.status(500).send({
          success: false,
          error: 'Internal server error'
        });
      }
    }
  );
}
