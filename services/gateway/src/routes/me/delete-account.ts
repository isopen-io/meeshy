import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { EmailService } from '../../services/EmailService';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { validateBody, validateQuery } from '../../validation/helpers.js';
import { DeleteAccountBodySchema, TokenQuerySchema } from '../../validation/delete-account-schemas.js';
import { sendSuccess, sendBadRequest, sendUnauthorized, sendConflict, sendInternalError } from '../../utils/response.js';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';
import { disconnectRevokedSessions } from '../../socketio/disconnectRevokedSessions';

const logger = enhancedLogger.child({ module: 'DeleteAccount' });

const GRACE_PERIOD_DAYS = 90;

/** 72 h — la durée de vie d'un lien de confirmation (#4183). */
export const TOKEN_TTL_MS = 72 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * L'adresse de la PAGE qui explique la conséquence avant de l'appliquer.
 *
 * Les liens de courriel visaient auparavant des `GET` du gateway qui MUTAIENT
 * — un pré-chargeur de liens (antivirus de messagerie, Safe Links, prefetch du
 * navigateur) confirmait donc la suppression d'un compte sans qu'aucun humain
 * ne clique. Ils visent désormais une page : c'est le CLIC qui devient le
 * consentement, et la page fait le `POST` (#4183).
 */
export function buildDeletionPageUrl(action: 'confirm' | 'cancel' | 'purge', token: string): string {
  const base = process.env.NEXT_PUBLIC_FRONTEND_URL || process.env.FRONTEND_URL || 'https://meeshy.me';
  return `${base.replace(/\/+$/, '')}/account/deletion?token=${encodeURIComponent(token)}&action=${action}`;
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
      preValidation: [fastify.authenticate],
      preHandler: [validateBody(DeleteAccountBodySchema)],
      schema: {
        description: 'Initiate account deletion with email confirmation',
        tags: ['me', 'account'],
        summary: 'Request account deletion',
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
          400: errorResponseSchema,
          401: errorResponseSchema,
          409: errorResponseSchema,
          500: errorResponseSchema
        }
      }
    },
    async (request, reply) => {
      const authContext = (request as unknown as UnifiedAuthRequest).authContext;

      if (!authContext?.isAuthenticated || !authContext?.registeredUser) {
        return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
      }

      const { confirmationPhrase } = request.body as { confirmationPhrase: string };

      if (confirmationPhrase !== 'SUPPRIMER MON COMPTE') {
        return sendBadRequest(reply, 'Phrase de confirmation incorrecte', { code: 'INVALID_CONFIRMATION' });
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
          return sendConflict(reply, 'Une demande de suppression est deja en cours', { code: 'ALREADY_PENDING' });
        }

        const expiredRequests = await fastify.prisma.accountDeletionRequest.count({
          where: { userId, status: 'GRACE_PERIOD_EXPIRED' }
        });
        if (expiredRequests > 0) {
          await fastify.prisma.$transaction([
            fastify.prisma.accountDeletionRequest.updateMany({
              where: { userId, status: 'GRACE_PERIOD_EXPIRED' },
              data: { status: 'CANCELLED', cancelledAt: new Date(), confirmTokenHash: 'revoked', cancelTokenHash: 'revoked' }
            }),
            fastify.prisma.user.update({
              where: { id: userId },
              data: { isActive: true, deletedAt: null }
            })
          ]);
        }

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
            // Un lien de courriel MEURT. Sans cette date, le jeton reçu il y a
            // six mois ouvrait encore la suppression du compte (#4183).
            tokenExpiresAt: new Date(Date.now() + TOKEN_TTL_MS),
          }
        });

        const user = await fastify.prisma.user.findUnique({
          where: { id: userId },
          select: { email: true, displayName: true, firstName: true, ...RECIPIENT_LANG_SELECT }
        });

        if (user?.email) {
          const emailService = new EmailService();
          const name = user.displayName || user.firstName || 'Utilisateur';
          const confirmLink = buildDeletionPageUrl('confirm', confirmToken);
          const cancelLink = buildDeletionPageUrl('cancel', cancelToken);

          await emailService.sendAccountDeletionConfirmEmail({
            to: user.email,
            name,
            confirmLink,
            cancelLink,
            language: recipientLanguage(user, 'en'),
          });

          logger.info(`[DeleteAccount] Confirmation email sent to user=${userId}`);
        }

        return sendSuccess(reply, { message: 'Un email de confirmation a ete envoye a votre adresse' });
      } catch (error) {
        logger.error('[DeleteAccount] Failed to initiate deletion:', error);
        return sendInternalError(reply, 'Erreur lors de la demande de suppression', { code: 'INTERNAL_ERROR' });
      }
    }
  );

  // ============================================================
  // Les trois anciens liens de courriel — désormais INERTES (#4183)
  // ============================================================
  //
  // `GET /delete-account/confirm` écrivait `status: 'CONFIRMED'` et
  // `gracePeriodEndsAt` à J+90. Une MUTATION destructrice déclenchée par une
  // requête que n'importe quoi peut émettre : antivirus de messagerie, Safe
  // Links, pré-chargeur du navigateur. Qui lançait la suppression puis se
  // ravisait et ne cliquait rien croyait avoir tout arrêté — et aucun courriel
  // n'est émis entre la confirmation et l'expiration, donc rien ne l'aurait
  // prévenu. Quatre-vingt-dix jours plus tard, son compte était désactivé.
  //
  // Le tirage n'était pas un coup de dé unique : le rappel hebdomadaire porte
  // LES DEUX liens, et l'ordre de visite du scanner décidait de l'issue,
  // toutes les semaines.
  //
  // Elles sont CONSERVÉES, et non supprimées : les courriels déjà envoyés
  // portent ces adresses, et une période de grâce dure quatre-vingt-dix jours.
  // Elles ne font plus que rediriger vers la page qui DIT la conséquence et
  // fait le `POST` au clic — c'est le clic humain qui devient le consentement.
  const REDIRECTIONS: ReadonlyArray<{ chemin: string; action: 'confirm' | 'cancel' | 'purge' }> = [
    { chemin: '/delete-account/confirm', action: 'confirm' },
    { chemin: '/delete-account/cancel', action: 'cancel' },
    { chemin: '/delete-account/delete-now', action: 'purge' },
  ];

  for (const { chemin, action } of REDIRECTIONS) {
    fastify.get(
      chemin,
      {
        preHandler: [validateQuery(TokenQuerySchema)],
        schema: {
          description: 'Legacy email link — redirects to the confirmation page. Performs NO mutation (see #4183).',
          tags: ['me', 'account'],
          deprecated: true,
        }
      },
      async (request, reply) => {
        const { token } = request.query as { token: string };
        return reply.redirect(buildDeletionPageUrl(action, token), 302);
      }
    );
  }
}
