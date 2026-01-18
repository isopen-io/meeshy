import { FastifyRequest, FastifyReply } from 'fastify';
import { errorResponseSchema } from '@meeshy/shared/types';
import { getRequestContext } from '../../services/GeoIPService';
import {
  createPhoneTransferRateLimiter,
  createPhoneTransferCodeRateLimiter,
  createPhoneTransferResendRateLimiter
} from '../../utils/rate-limiter.js';
import { AuthRouteContext } from './types';

/**
 * Register phone transfer routes (for registration with existing phone number)
 */
export function registerPhoneTransferRoutes(context: AuthRouteContext) {
  const { fastify, phoneTransferService, redis } = context;

  const phoneTransferRateLimiter = createPhoneTransferRateLimiter(redis);
  const phoneTransferCodeRateLimiter = createPhoneTransferCodeRateLimiter(redis);
  const phoneTransferResendRateLimiter = createPhoneTransferResendRateLimiter(redis);

  // POST /phone-transfer/check - Check if phone number belongs to another account
  fastify.post('/phone-transfer/check', {
    schema: {
      description: 'Check if a phone number is already associated with another account',
      tags: ['auth'],
      summary: 'Check phone ownership',
      body: {
        type: 'object',
        required: ['phoneNumber'],
        properties: {
          phoneNumber: { type: 'string', description: 'Phone number to check' },
          countryCode: { type: 'string', description: 'ISO country code (e.g., FR, US)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                exists: { type: 'boolean', description: 'Whether the phone belongs to another account' },
                maskedInfo: {
                  type: 'object',
                  properties: {
                    displayName: { type: 'string' },
                    username: { type: 'string' },
                    email: { type: 'string' }
                  }
                }
              }
            }
          }
        },
        429: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' }
          }
        },
        500: errorResponseSchema
      },
      security: []
    },
    preHandler: [phoneTransferRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { phoneNumber, countryCode } = request.body as { phoneNumber: string; countryCode?: string };

      const { normalizePhoneWithCountry } = await import('../../utils/normalize');
      const normalized = normalizePhoneWithCountry(phoneNumber, countryCode || 'FR');

      if (!normalized || !normalized.isValid) {
        return reply.status(400).send({
          success: false,
          error: 'Numéro de téléphone invalide'
        });
      }

      const result = await phoneTransferService.checkPhoneOwnership(normalized.phoneNumber);

      return reply.send({
        success: true,
        data: {
          exists: result.exists,
          maskedInfo: result.maskedInfo
        }
      });
    } catch (error) {
      console.error('[AUTH] ❌ Erreur check phone:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification du numéro'
      });
    }
  });

  // POST /phone-transfer/initiate - Initiate phone transfer (sends SMS to current owner)
  fastify.post('/phone-transfer/initiate', {
    schema: {
      description: 'Initiate phone number transfer by sending SMS verification to current owner',
      tags: ['auth'],
      summary: 'Initiate phone transfer',
      body: {
        type: 'object',
        required: ['phoneNumber', 'newUserId'],
        properties: {
          phoneNumber: { type: 'string', description: 'Phone number to transfer' },
          phoneCountryCode: { type: 'string', description: 'ISO country code' },
          newUserId: { type: 'string', description: 'ID of the new user (just registered)' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                transferId: { type: 'string', description: 'Transfer session ID' },
                maskedOwnerInfo: {
                  type: 'object',
                  properties: {
                    displayName: { type: 'string' },
                    username: { type: 'string' },
                    email: { type: 'string' }
                  }
                }
              }
            },
            error: { type: 'string' }
          }
        },
        429: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' }
          }
        },
        500: errorResponseSchema
      },
      security: []
    },
    preHandler: [phoneTransferRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { phoneNumber, phoneCountryCode, newUserId } = request.body as {
        phoneNumber: string;
        phoneCountryCode?: string;
        newUserId: string;
      };

      const { normalizePhoneWithCountry } = await import('../../utils/normalize');
      const normalized = normalizePhoneWithCountry(phoneNumber, phoneCountryCode || 'FR');

      if (!normalized || !normalized.isValid) {
        return reply.status(400).send({
          success: false,
          error: 'Numéro de téléphone invalide'
        });
      }

      const requestContext = await getRequestContext(request);

      const result = await phoneTransferService.initiateTransfer({
        phoneNumber: normalized.phoneNumber,
        phoneCountryCode: normalized.countryCode,
        newUserId,
        ipAddress: requestContext.ip,
        userAgent: requestContext.userAgent || 'Unknown'
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          transferId: result.transferId,
          maskedOwnerInfo: result.maskedOwnerInfo
        }
      });
    } catch (error) {
      console.error('[AUTH] ❌ Erreur initiate transfer:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'initiation du transfert'
      });
    }
  });

  // POST /phone-transfer/verify - Verify SMS code and complete transfer
  fastify.post('/phone-transfer/verify', {
    schema: {
      description: 'Verify SMS code and complete phone number transfer',
      tags: ['auth'],
      summary: 'Verify phone transfer',
      body: {
        type: 'object',
        required: ['transferId', 'code'],
        properties: {
          transferId: { type: 'string', description: 'Transfer session ID' },
          code: { type: 'string', description: '6-digit SMS verification code' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                transferred: { type: 'boolean', description: 'Whether transfer was successful' }
              }
            },
            error: { type: 'string' }
          }
        },
        500: errorResponseSchema
      },
      security: []
    },
    preHandler: [phoneTransferCodeRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { transferId, code } = request.body as { transferId: string; code: string };
      const requestContext = await getRequestContext(request);

      const result = await phoneTransferService.verifyAndTransfer({
        transferId,
        code,
        ipAddress: requestContext.ip
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          transferred: result.transferred
        }
      });
    } catch (error) {
      console.error('[AUTH] ❌ Erreur verify transfer:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification du transfert'
      });
    }
  });

  // POST /phone-transfer/resend - Resend SMS code for transfer
  fastify.post('/phone-transfer/resend', {
    schema: {
      description: 'Resend SMS verification code for phone transfer',
      tags: ['auth'],
      summary: 'Resend transfer code',
      body: {
        type: 'object',
        required: ['transferId'],
        properties: {
          transferId: { type: 'string', description: 'Transfer session ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        500: errorResponseSchema
      },
      security: []
    },
    preHandler: [phoneTransferResendRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { transferId } = request.body as { transferId: string };
      const requestContext = await getRequestContext(request);

      const result = await phoneTransferService.resendCode(transferId, requestContext.ip);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true
      });
    } catch (error) {
      console.error('[AUTH] ❌ Erreur resend transfer code:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors du renvoi du code'
      });
    }
  });

  // POST /phone-transfer/cancel - Cancel pending transfer
  fastify.post('/phone-transfer/cancel', {
    schema: {
      description: 'Cancel a pending phone transfer',
      tags: ['auth'],
      summary: 'Cancel phone transfer',
      body: {
        type: 'object',
        required: ['transferId'],
        properties: {
          transferId: { type: 'string', description: 'Transfer session ID' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
          }
        }
      },
      security: []
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { transferId } = request.body as { transferId: string };
      await phoneTransferService.cancelTransfer(transferId);
      return reply.send({ success: true });
    } catch (error) {
      console.error('[AUTH] ❌ Erreur cancel transfer:', error);
      return reply.send({ success: true });
    }
  });

  // POST /phone-transfer/initiate-registration - Phone transfer during registration (account not created yet)
  fastify.post('/phone-transfer/initiate-registration', {
    schema: {
      description: 'Initiate phone transfer during registration (account not created yet)',
      tags: ['auth'],
      summary: 'Initiate registration phone transfer',
      body: {
        type: 'object',
        required: ['phoneNumber', 'pendingUsername', 'pendingEmail'],
        properties: {
          phoneNumber: { type: 'string', description: 'Phone number to transfer' },
          phoneCountryCode: { type: 'string', description: 'ISO country code' },
          pendingUsername: { type: 'string', description: 'Username for the pending registration' },
          pendingEmail: { type: 'string', description: 'Email for the pending registration' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                transferId: { type: 'string', description: 'Transfer session ID' }
              }
            },
            error: { type: 'string' }
          }
        },
        429: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string' }
          }
        },
        500: errorResponseSchema
      },
      security: []
    },
    preHandler: [phoneTransferRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { phoneNumber, phoneCountryCode, pendingUsername, pendingEmail } = request.body as {
        phoneNumber: string;
        phoneCountryCode?: string;
        pendingUsername: string;
        pendingEmail: string;
      };

      const { normalizePhoneWithCountry } = await import('../../utils/normalize');
      const normalized = normalizePhoneWithCountry(phoneNumber, phoneCountryCode || 'FR');

      if (!normalized || !normalized.isValid) {
        return reply.status(400).send({
          success: false,
          error: 'Numéro de téléphone invalide'
        });
      }

      const requestContext = await getRequestContext(request);

      const result = await phoneTransferService.initiateTransferForRegistration({
        phoneNumber: normalized.phoneNumber,
        phoneCountryCode: normalized.countryCode,
        pendingUsername,
        pendingEmail,
        ipAddress: requestContext.ip,
        userAgent: requestContext.userAgent || 'Unknown'
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          transferId: result.transferId
        }
      });
    } catch (error) {
      console.error('[AUTH] ❌ Erreur initiate registration transfer:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'initiation du transfert'
      });
    }
  });

  // POST /phone-transfer/verify-registration - Verify SMS code for registration transfer
  fastify.post('/phone-transfer/verify-registration', {
    schema: {
      description: 'Verify SMS code for registration phone transfer',
      tags: ['auth'],
      summary: 'Verify registration phone transfer',
      body: {
        type: 'object',
        required: ['transferId', 'code'],
        properties: {
          transferId: { type: 'string', description: 'Transfer session ID' },
          code: { type: 'string', description: '6-digit SMS verification code' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                verified: { type: 'boolean', description: 'Whether verification succeeded' },
                transferToken: { type: 'string', description: 'Token to use in /register call' }
              }
            },
            error: { type: 'string' }
          }
        },
        500: errorResponseSchema
      },
      security: []
    },
    preHandler: [phoneTransferCodeRateLimiter.middleware()]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { transferId, code } = request.body as { transferId: string; code: string };
      const requestContext = await getRequestContext(request);

      const result = await phoneTransferService.verifyForRegistration({
        transferId,
        code,
        ipAddress: requestContext.ip
      });

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          verified: result.verified,
          transferToken: result.transferToken
        }
      });
    } catch (error) {
      console.error('[AUTH] ❌ Erreur verify registration transfer:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification'
      });
    }
  });
}
