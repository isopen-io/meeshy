/**
 * Routes pour l'authentification à deux facteurs (2FA)
 *
 * Endpoints:
 * - GET  /auth/2fa/status         - Obtenir le statut 2FA de l'utilisateur
 * - POST /auth/2fa/setup          - Démarrer la configuration 2FA (génère QR code)
 * - POST /auth/2fa/enable         - Activer le 2FA (vérifie le premier code)
 * - POST /auth/2fa/disable        - Désactiver le 2FA
 * - POST /auth/2fa/verify         - Vérifier un code 2FA
 * - POST /auth/2fa/backup-codes   - Régénérer les codes de secours
 * - POST /auth/2fa/cancel         - Annuler la configuration en cours
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TwoFactorService } from '../services/TwoFactorService';

// Request body types
interface EnableBody {
  code: string;
}

interface DisableBody {
  password: string;
  code?: string;
}

interface VerifyBody {
  code: string;
}

interface RegenerateBackupCodesBody {
  code: string;
}

export async function twoFactorRoutes(fastify: FastifyInstance) {
  const twoFactorService = new TwoFactorService((fastify as any).prisma);

  // ==================== GET /auth/2fa/status ====================
  fastify.get('/status', {
    schema: {
      description: 'Get the 2FA status for the authenticated user',
      tags: ['auth', '2fa'],
      summary: 'Get 2FA status',
      response: {
        200: {
          description: '2FA status retrieved successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                enabled: { type: 'boolean', description: 'Whether 2FA is enabled' },
                enabledAt: { type: 'string', format: 'date-time', nullable: true, description: 'When 2FA was enabled' },
                hasBackupCodes: { type: 'boolean', description: 'Whether backup codes exist' },
                backupCodesCount: { type: 'number', description: 'Number of remaining backup codes' }
              }
            }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const status = await twoFactorService.getStatus(userId);

      return reply.send({
        success: true,
        data: status
      });
    } catch (error) {
      console.error('[2FA] Status error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la récupération du statut 2FA'
      });
    }
  });

  // ==================== POST /auth/2fa/setup ====================
  fastify.post('/setup', {
    schema: {
      description: 'Start 2FA setup. Returns a QR code and secret for authenticator apps. The setup must be confirmed with /enable endpoint.',
      tags: ['auth', '2fa'],
      summary: 'Start 2FA setup',
      response: {
        200: {
          description: '2FA setup initiated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                secret: { type: 'string', description: 'Base32 encoded secret for manual entry' },
                qrCodeDataUrl: { type: 'string', description: 'Data URL for QR code image (PNG)' },
                otpauthUrl: { type: 'string', description: 'otpauth:// URL for authenticator apps' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const result = await twoFactorService.setup(userId);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          secret: result.secret,
          qrCodeDataUrl: result.qrCodeDataUrl,
          otpauthUrl: result.otpauthUrl
        }
      });
    } catch (error) {
      console.error('[2FA] Setup error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la configuration du 2FA'
      });
    }
  });

  // ==================== POST /auth/2fa/enable ====================
  fastify.post<{ Body: EnableBody }>('/enable', {
    schema: {
      description: 'Enable 2FA by verifying the first TOTP code. Returns backup codes that should be stored safely.',
      tags: ['auth', '2fa'],
      summary: 'Enable 2FA',
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 6, description: '6-digit TOTP code from authenticator app' }
        }
      },
      response: {
        200: {
          description: '2FA enabled successfully - backup codes returned (save them!)',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                backupCodes: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Backup codes for account recovery (shown only once!)'
                }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest<{ Body: EnableBody }>, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { code } = request.body;

      const result = await twoFactorService.enable(userId, code);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Authentification à deux facteurs activée avec succès',
          backupCodes: result.backupCodes
        }
      });
    } catch (error) {
      console.error('[2FA] Enable error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'activation du 2FA'
      });
    }
  });

  // ==================== POST /auth/2fa/disable ====================
  fastify.post<{ Body: DisableBody }>('/disable', {
    schema: {
      description: 'Disable 2FA. Requires password verification and optionally a 2FA code.',
      tags: ['auth', '2fa'],
      summary: 'Disable 2FA',
      body: {
        type: 'object',
        required: ['password'],
        properties: {
          password: { type: 'string', minLength: 1, description: 'Current password for verification' },
          code: { type: 'string', minLength: 6, maxLength: 8, description: 'Optional 2FA code for additional security' }
        }
      },
      response: {
        200: {
          description: '2FA disabled successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest<{ Body: DisableBody }>, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { password, code } = request.body;

      const result = await twoFactorService.disable(userId, password, code);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Authentification à deux facteurs désactivée'
        }
      });
    } catch (error) {
      console.error('[2FA] Disable error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la désactivation du 2FA'
      });
    }
  });

  // ==================== POST /auth/2fa/verify ====================
  fastify.post<{ Body: VerifyBody }>('/verify', {
    schema: {
      description: 'Verify a 2FA code. Accepts both TOTP codes (6 digits) and backup codes (8 alphanumeric characters).',
      tags: ['auth', '2fa'],
      summary: 'Verify 2FA code',
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 9, description: 'TOTP code (6 digits) or backup code (XXXX-XXXX format)' }
        }
      },
      response: {
        200: {
          description: 'Code verified successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                valid: { type: 'boolean' },
                usedBackupCode: { type: 'boolean', description: 'Whether a backup code was used' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest<{ Body: VerifyBody }>, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { code } = request.body;

      const result = await twoFactorService.verify(userId, code);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          valid: true,
          usedBackupCode: result.usedBackupCode || false
        }
      });
    } catch (error) {
      console.error('[2FA] Verify error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la vérification du code'
      });
    }
  });

  // ==================== POST /auth/2fa/backup-codes ====================
  fastify.post<{ Body: RegenerateBackupCodesBody }>('/backup-codes', {
    schema: {
      description: 'Regenerate backup codes. Requires 2FA verification (TOTP only, not backup code).',
      tags: ['auth', '2fa'],
      summary: 'Regenerate backup codes',
      body: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string', minLength: 6, maxLength: 6, description: '6-digit TOTP code (backup codes not accepted)' }
        }
      },
      response: {
        200: {
          description: 'Backup codes regenerated successfully',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                backupCodes: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'New backup codes (old codes are now invalid)'
                }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest<{ Body: RegenerateBackupCodesBody }>, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const { code } = request.body;

      const result = await twoFactorService.regenerateBackupCodes(userId, code);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Codes de secours régénérés. Les anciens codes sont maintenant invalides.',
          backupCodes: result.backupCodes
        }
      });
    } catch (error) {
      console.error('[2FA] Regenerate backup codes error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de la régénération des codes de secours'
      });
    }
  });

  // ==================== POST /auth/2fa/cancel ====================
  fastify.post('/cancel', {
    schema: {
      description: 'Cancel an in-progress 2FA setup (before enabling).',
      tags: ['auth', '2fa'],
      summary: 'Cancel 2FA setup',
      response: {
        200: {
          description: '2FA setup cancelled',
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                message: { type: 'string' }
              }
            }
          }
        }
      },
      security: [{ bearerAuth: [] }]
    },
    preValidation: [(fastify as any).authenticate]
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const userId = (request as any).user.userId;
      const result = await twoFactorService.cancelSetup(userId);

      if (!result.success) {
        return reply.status(400).send({
          success: false,
          error: result.error
        });
      }

      return reply.send({
        success: true,
        data: {
          message: 'Configuration 2FA annulée'
        }
      });
    } catch (error) {
      console.error('[2FA] Cancel setup error:', error);
      return reply.status(500).send({
        success: false,
        error: 'Erreur lors de l\'annulation'
      });
    }
  });
}
