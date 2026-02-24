import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { EmailService } from '../../services/EmailService';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'DeleteAccount' });

const GRACE_PERIOD_DAYS = 90;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildGatewayUrl(path: string): string {
  const base = process.env.GATEWAY_URL || process.env.API_URL || 'https://gate.meeshy.me';
  return `${base}/api/v1/me${path}`;
}

function htmlPage(title: string, emoji: string, message: string, detail: string, color: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} - Meeshy</title><style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb}@media(prefers-color-scheme:dark){body{background:#111827;color:#e5e7eb}.card{background:#1f2937!important;border-color:#374151!important}.detail{color:#9ca3af!important}}.card{background:white;border-radius:16px;padding:40px;text-align:center;max-width:480px;margin:20px;box-shadow:0 4px 20px rgba(0,0,0,0.08);border:1px solid #e5e7eb}.emoji{font-size:48px;margin-bottom:16px}.title{font-size:22px;font-weight:700;color:${color};margin-bottom:12px}.message{font-size:16px;line-height:1.5;margin-bottom:8px}.detail{font-size:14px;color:#6b7280}</style></head><body><div class="card"><div class="emoji">${emoji}</div><div class="title">${title}</div><p class="message">${message}</p><p class="detail">${detail}</p></div></body></html>`;
}

export async function deleteAccountRoutes(fastify: FastifyInstance) {

  // ============================================================
  // DELETE /delete-account — Initiate deletion (authenticated)
  // ============================================================
  fastify.delete(
    '/delete-account',
    {
      preValidation: [(fastify as any).authenticate],
      schema: {
        description: 'Initiate account deletion with email confirmation',
        tags: ['me', 'account'],
        summary: 'Request account deletion',
        body: {
          type: 'object',
          required: ['confirmationPhrase'],
          properties: {
            confirmationPhrase: { type: 'string' }
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
                  message: { type: 'string' }
                }
              }
            }
          },
          400: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } }
            }
          },
          401: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } }
            }
          },
          409: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } }
            }
          },
          500: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } } }
            }
          }
        }
      }
    },
    async (request, reply) => {
      const authContext = (request as any).authContext;

      if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
        return reply.status(401).send({
          success: false,
          error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
        });
      }

      const { confirmationPhrase } = request.body as { confirmationPhrase: string };

      if (confirmationPhrase !== 'SUPPRIMER MON COMPTE') {
        return reply.status(400).send({
          success: false,
          error: { code: 'INVALID_CONFIRMATION', message: 'Phrase de confirmation incorrecte' }
        });
      }

      try {
        const userId = authContext.userId;

        const activeRequest = await fastify.prisma.accountDeletionRequest.findFirst({
          where: {
            userId,
            status: { in: ['PENDING_EMAIL_CONFIRMATION', 'CONFIRMED'] }
          }
        });

        if (activeRequest) {
          return reply.status(409).send({
            success: false,
            error: { code: 'ALREADY_PENDING', message: 'Une demande de suppression est deja en cours' }
          });
        }

        await fastify.prisma.accountDeletionRequest.updateMany({
          where: { userId, status: 'GRACE_PERIOD_EXPIRED' },
          data: { status: 'CANCELLED', cancelledAt: new Date() }
        });

        const confirmToken = crypto.randomBytes(32).toString('base64url');
        const cancelToken = crypto.randomBytes(32).toString('base64url');
        const confirmTokenHash = hashToken(confirmToken);
        const cancelTokenHash = hashToken(cancelToken);

        await fastify.prisma.accountDeletionRequest.create({
          data: {
            userId,
            status: 'PENDING_EMAIL_CONFIRMATION',
            confirmTokenHash,
            cancelTokenHash,
          }
        });

        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, displayName: true, firstName: true, systemLanguage: true }
        });

        if (user?.email) {
          const emailService = new EmailService();
          const name = user.displayName || user.firstName || 'Utilisateur';
          const confirmLink = buildGatewayUrl(`/delete-account/confirm?token=${confirmToken}`);
          const cancelLink = buildGatewayUrl(`/delete-account/cancel?token=${cancelToken}`);

          await emailService.sendAccountDeletionConfirmEmail({
            to: user.email,
            name,
            confirmLink,
            cancelLink,
            language: user.systemLanguage || 'en',
          });

          logger.info(`[DeleteAccount] Confirmation email sent to user=${userId}`);
        }

        return reply.send({
          success: true,
          data: { message: 'Un email de confirmation a ete envoye a votre adresse' }
        });
      } catch (error) {
        logger.error('[DeleteAccount] Failed to initiate deletion:', error);
        return reply.status(500).send({
          success: false,
          error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de la demande de suppression' }
        });
      }
    }
  );

  // ============================================================
  // GET /delete-account/confirm — Confirm deletion (public)
  // ============================================================
  fastify.get(
    '/delete-account/confirm',
    {
      schema: {
        description: 'Confirm account deletion via email link',
        tags: ['me', 'account'],
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } }
        }
      }
    },
    async (request, reply) => {
      const { token } = request.query as { token: string };
      const tokenHash = hashToken(token);

      try {
        const deletionRequest = await fastify.prisma.accountDeletionRequest.findFirst({
          where: { confirmTokenHash: tokenHash, status: 'PENDING_EMAIL_CONFIRMATION' }
        });

        if (!deletionRequest) {
          return reply.type('text/html').send(
            htmlPage('Lien invalide', '\u274c', 'Ce lien de confirmation est invalide ou a deja ete utilise.', 'Veuillez refaire une demande de suppression depuis l\'application.', '#ef4444')
          );
        }

        const gracePeriodEndsAt = new Date();
        gracePeriodEndsAt.setDate(gracePeriodEndsAt.getDate() + GRACE_PERIOD_DAYS);

        await fastify.prisma.accountDeletionRequest.update({
          where: { id: deletionRequest.id },
          data: {
            status: 'CONFIRMED',
            confirmedAt: new Date(),
            gracePeriodEndsAt,
          }
        });

        logger.info(`[DeleteAccount] Deletion confirmed for user=${deletionRequest.userId}, grace period ends=${gracePeriodEndsAt.toISOString()}`);

        const dateStr = gracePeriodEndsAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

        return reply.type('text/html').send(
          htmlPage('Suppression confirmee', '\u2705', `Votre demande de suppression a ete confirmee. Votre compte sera supprime apres le ${dateStr}.`, 'Vous pouvez annuler cette demande a tout moment via le lien dans l\'email ou depuis l\'application.', '#22c55e')
        );
      } catch (error) {
        logger.error('[DeleteAccount] Confirm error:', error);
        return reply.type('text/html').send(
          htmlPage('Erreur', '\u26a0\ufe0f', 'Une erreur est survenue lors de la confirmation.', 'Veuillez reessayer plus tard.', '#f59e0b')
        );
      }
    }
  );

  // ============================================================
  // GET /delete-account/cancel — Cancel deletion (public)
  // ============================================================
  fastify.get(
    '/delete-account/cancel',
    {
      schema: {
        description: 'Cancel account deletion via email link',
        tags: ['me', 'account'],
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } }
        }
      }
    },
    async (request, reply) => {
      const { token } = request.query as { token: string };
      const tokenHash = hashToken(token);

      try {
        const deletionRequest = await fastify.prisma.accountDeletionRequest.findFirst({
          where: {
            cancelTokenHash: tokenHash,
            status: { in: ['PENDING_EMAIL_CONFIRMATION', 'CONFIRMED', 'GRACE_PERIOD_EXPIRED'] }
          }
        });

        if (!deletionRequest) {
          return reply.type('text/html').send(
            htmlPage('Lien invalide', '\u274c', 'Ce lien d\'annulation est invalide ou a deja ete utilise.', 'Votre compte n\'a peut-etre pas de demande de suppression active.', '#ef4444')
          );
        }

        await fastify.prisma.accountDeletionRequest.update({
          where: { id: deletionRequest.id },
          data: { status: 'CANCELLED', cancelledAt: new Date() }
        });

        const user = await fastify.prisma.user.findUnique({
          where: { id: deletionRequest.userId },
          select: { isActive: true }
        });

        if (user && !user.isActive) {
          await fastify.prisma.user.update({
            where: { id: deletionRequest.userId },
            data: { isActive: true, deletedAt: null }
          });
        }

        logger.info(`[DeleteAccount] Deletion cancelled for user=${deletionRequest.userId}`);

        return reply.type('text/html').send(
          htmlPage('Suppression annulee', '\ud83c\udf89', 'La suppression de votre compte a ete annulee avec succes.', 'Votre compte reste actif et toutes vos donnees sont preservees. Vous pouvez fermer cette page.', '#6366f1')
        );
      } catch (error) {
        logger.error('[DeleteAccount] Cancel error:', error);
        return reply.type('text/html').send(
          htmlPage('Erreur', '\u26a0\ufe0f', 'Une erreur est survenue lors de l\'annulation.', 'Veuillez reessayer plus tard.', '#f59e0b')
        );
      }
    }
  );

  // ============================================================
  // GET /delete-account/delete-now — Immediate deletion (public)
  // ============================================================
  fastify.get(
    '/delete-account/delete-now',
    {
      schema: {
        description: 'Immediately delete account after grace period (via email link)',
        tags: ['me', 'account'],
        querystring: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string' } }
        }
      }
    },
    async (request, reply) => {
      const { token } = request.query as { token: string };
      const tokenHash = hashToken(token);

      try {
        const deletionRequest = await fastify.prisma.accountDeletionRequest.findFirst({
          where: { confirmTokenHash: tokenHash, status: 'GRACE_PERIOD_EXPIRED' }
        });

        if (!deletionRequest) {
          return reply.type('text/html').send(
            htmlPage('Lien invalide', '\u274c', 'Ce lien de suppression est invalide ou la demande n\'est plus active.', 'La suppression immediate n\'est disponible qu\'apres expiration de la periode de grace.', '#ef4444')
          );
        }

        await fastify.prisma.user.update({
          where: { id: deletionRequest.userId },
          data: { isActive: false, deletedAt: new Date() }
        });

        await fastify.prisma.accountDeletionRequest.update({
          where: { id: deletionRequest.id },
          data: { status: 'COMPLETED' }
        });

        logger.info(`[DeleteAccount] Account deleted immediately for user=${deletionRequest.userId}`);

        return reply.type('text/html').send(
          htmlPage('Compte supprime', '\ud83d\udc4b', 'Votre compte Meeshy a ete supprime definitivement.', 'Merci d\'avoir utilise Meeshy. Vous pouvez fermer cette page.', '#6b7280')
        );
      } catch (error) {
        logger.error('[DeleteAccount] Delete-now error:', error);
        return reply.type('text/html').send(
          htmlPage('Erreur', '\u26a0\ufe0f', 'Une erreur est survenue lors de la suppression.', 'Veuillez reessayer plus tard.', '#f59e0b')
        );
      }
    }
  );
}
