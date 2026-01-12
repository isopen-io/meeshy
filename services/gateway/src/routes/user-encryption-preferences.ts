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
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';

type EncryptionPreference = 'disabled' | 'optional' | 'always';

interface UpdateEncryptionPreferenceRequest {
  encryptionPreference: EncryptionPreference;
}

interface GenerateKeysRequest {
  password?: string; // Optional password to encrypt private keys
}

// ============================================================================
// SCHEMA DEFINITIONS
// ============================================================================

const encryptionPreferenceDataSchema = {
  type: 'object',
  properties: {
    encryptionPreference: {
      type: 'string',
      enum: ['disabled', 'optional', 'always'],
      description: 'User encryption preference level'
    },
    hasSignalKeys: {
      type: 'boolean',
      description: 'Whether user has generated Signal Protocol keys'
    },
    signalRegistrationId: {
      type: 'number',
      nullable: true,
      description: 'Signal Protocol registration ID (14-bit random number)'
    },
    signalPreKeyBundleVersion: {
      type: 'number',
      nullable: true,
      description: 'Current pre-key bundle version'
    },
    lastKeyRotation: {
      type: 'string',
      format: 'date-time',
      nullable: true,
      description: 'Last key rotation timestamp'
    }
  }
} as const;

const updateEncryptionPreferenceRequestSchema = {
  type: 'object',
  required: ['encryptionPreference'],
  properties: {
    encryptionPreference: {
      type: 'string',
      enum: ['disabled', 'optional', 'always'],
      description: 'New encryption preference: disabled (no encryption), optional (user choice), always (enforce E2EE)'
    }
  }
} as const;

const generateKeysRequestSchema = {
  type: 'object',
  properties: {
    password: {
      type: 'string',
      nullable: true,
      description: 'Optional password to encrypt private keys at rest'
    }
  }
} as const;

const signalKeyBundleSchema = {
  type: 'object',
  properties: {
    userId: {
      type: 'string',
      description: 'User ID owning this key bundle'
    },
    identityKey: {
      type: 'string',
      description: 'Public identity key (base64 encoded)'
    },
    registrationId: {
      type: 'number',
      description: 'Signal Protocol registration ID'
    },
    preKeyBundleVersion: {
      type: 'number',
      description: 'Pre-key bundle version'
    }
  }
} as const;

export default async function userEncryptionPreferencesRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

  /**
   * GET /users/me/encryption-preferences
   * Get current user's encryption preferences
   */
  fastify.get(
    '/users/me/encryption-preferences',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Get the authenticated user encryption preferences and Signal Protocol key status. Returns current encryption level, key generation status, and key rotation information.',
        tags: ['users', 'encryption'],
        summary: 'Get user encryption preferences',
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: encryptionPreferenceDataSchema
            }
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: { type: 'string', example: 'Anonymous users cannot manage encryption preferences' }
            }
          },
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const authContext = (request as any).authContext;

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
   * PUT /users/me/encryption-preferences
   * Update user's encryption preference
   */
  fastify.put<{
    Body: UpdateEncryptionPreferenceRequest;
  }>(
    '/users/me/encryption-preferences',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Update the authenticated user encryption preference level. Controls whether E2EE is disabled, optional, or enforced for all messages. Anonymous users cannot manage encryption settings.',
        tags: ['users', 'encryption'],
        summary: 'Update user encryption preference',
        body: updateEncryptionPreferenceRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  encryptionPreference: {
                    type: 'string',
                    enum: ['disabled', 'optional', 'always'],
                    description: 'Updated encryption preference'
                  }
                }
              },
              message: { type: 'string', example: 'Encryption preference updated successfully' }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: { type: 'string', example: 'Invalid encryption preference. Must be "disabled", "optional", or "always"' }
            }
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: { type: 'string', example: 'Anonymous users cannot manage encryption preferences' }
            }
          },
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const authContext = (request as any).authContext;
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
   * POST /users/me/encryption-keys
   * Generate Signal Protocol keys for E2EE
   * This creates identity keys and pre-keys for the user
   */
  fastify.post<{
    Body: GenerateKeysRequest;
  }>(
    '/users/me/encryption-keys',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Generate Signal Protocol identity keys and pre-key bundles for the authenticated user. Creates cryptographic keys required for E2EE sessions. Keys can only be generated once per user; use key rotation endpoint to update existing keys.',
        tags: ['users', 'encryption'],
        summary: 'Generate encryption keys',
        body: generateKeysRequestSchema,
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  signalIdentityKeyPublic: {
                    type: 'string',
                    description: 'Public identity key (base64 encoded, safe to share)'
                  },
                  signalRegistrationId: {
                    type: 'number',
                    description: 'Signal Protocol registration ID'
                  },
                  signalPreKeyBundleVersion: {
                    type: 'number',
                    description: 'Initial pre-key bundle version (typically 1)'
                  }
                }
              },
              message: { type: 'string', example: 'Encryption keys generated successfully' }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: { type: 'string', example: 'User already has encryption keys. Use key rotation instead.' },
              data: {
                type: 'object',
                nullable: true,
                properties: {
                  signalRegistrationId: { type: 'number', nullable: true }
                }
              }
            }
          },
          403: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: { type: 'string', example: 'Anonymous users cannot generate encryption keys' }
            }
          },
          404: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const authContext = (request as any).authContext;

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
   * GET /users/:userId/encryption-key-bundle
   * Get public key bundle for a user (for establishing E2EE sessions)
   */
  fastify.get<{
    Params: { userId: string };
  }>(
    '/users/:userId/encryption-key-bundle',
    {
      preValidation: [authMiddleware],
      schema: {
        description: 'Retrieve the public Signal Protocol key bundle for a specific user. Required to establish end-to-end encrypted sessions. Returns only public keys (safe to share). Used by clients to initiate encrypted conversations.',
        tags: ['users', 'encryption'],
        summary: 'Get user encryption key bundle',
        params: {
          type: 'object',
          required: ['userId'],
          properties: {
            userId: {
              type: 'string',
              description: 'Target user ID (MongoDB ObjectId)'
            }
          }
        },
        response: {
          200: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: signalKeyBundleSchema
            }
          },
          404: {
            type: 'object',
            properties: {
              success: { type: 'boolean', example: false },
              error: {
                type: 'string',
                description: 'Error message',
                examples: ['User not found', 'User has not generated encryption keys']
              }
            }
          },
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      try {
        const { userId } = request.params as { userId: string };

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
