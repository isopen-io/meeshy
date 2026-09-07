import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError, logWarn } from '../utils/logger';
import { sendSuccess, sendBadRequest, sendNotFound, sendConflict, sendInternalError } from '../utils/response.js';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../utils/recipient-language';
import { createInvitationRateLimitConfig } from '../middleware/rate-limit';
import { generateUniqueAffiliateToken } from './affiliate';

const sendEmailInvitationSchema = z.object({
  email: z.email(),
});

/**
 * Nom générique du jeton d'affiliation créé pour une invitation par e-mail
 * (#3691). Jamais l'adresse du destinataire : `AffiliateToken.name` est rendu
 * PUBLIQUEMENT par `GET /affiliate/validate/:token`, et quiconque reçoit ou
 * relaie le lien ne doit pas y lire l'adresse d'un tiers.
 */
const EMAIL_INVITATION_TOKEN_NAME = 'Invitation par e-mail';

export async function invitationRoutes(fastify: FastifyInstance) {
  fastify.post('/invitations/email', {
    onRequest: [fastify.authenticate],
    config: { rateLimit: createInvitationRateLimitConfig() },
    schema: {
      description: 'Send an email invitation to join Meeshy',
      tags: ['invitations'],
      summary: 'Send email invitation',
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email } = sendEmailInvitationSchema.parse(request.body);
      const userId = request.user!.userId;

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, username: true, avatar: true, ...RECIPIENT_LANG_SELECT },
      });

      if (!user) {
        return sendNotFound(reply, 'Utilisateur non trouve', { code: 'USER_NOT_FOUND' });
      }

      const existingUser = await fastify.prisma.user.findFirst({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        return sendConflict(reply, 'Cet utilisateur est deja sur Meeshy', { code: 'USER_ALREADY_EXISTS' });
      }

      const senderName = user.displayName ?? user.username;

      // Relation d'invitation PERSISTÉE (#3691) : un jeton d'affiliation dédié
      // à cette invitation (usage unique) réutilise la page d'atterrissage et
      // le pipeline d'attribution existants (`/signup/affiliate/:token` →
      // `POST /affiliate/register`) plutôt que d'en bâtir un second — le lien
      // envoyé est donc TRACÉ (jeton unique par invitation) et mène à une page
      // qui EXISTE, au lieu du `/download` mort.
      const token = await generateUniqueAffiliateToken(fastify.prisma);
      const affiliateToken = await fastify.prisma.affiliateToken.create({
        data: {
          token,
          name: EMAIL_INVITATION_TOKEN_NAME,
          createdBy: userId,
          maxUses: 1,
        },
      });
      await fastify.prisma.emailInvitation.create({
        data: {
          senderId: userId,
          email,
          affiliateTokenId: affiliateToken.id,
        },
      });

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3100';
      const invitationUrl = `${baseUrl}/signup/affiliate/${token}`;

      const emailService = (fastify as unknown as { emailService?: { sendInvitationEmail: (data: InvitationEmailData) => Promise<unknown> } }).emailService;

      if (emailService) {
        await emailService.sendInvitationEmail({
          to: email,
          senderName,
          senderAvatar: user.avatar,
          downloadUrl: invitationUrl,
          language: recipientLanguage(user, 'fr'),
        });
      } else {
        logWarn(fastify.log, 'EmailService not available, invitation not sent');
      }

      return sendSuccess(reply, { email, sentAt: new Date().toISOString(), invitationUrl }, { statusCode: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return sendBadRequest(reply, 'Adresse email invalide', { code: 'VALIDATION_ERROR' });
      }
      logError(fastify.log, 'Failed to send email invitation', error);
      return sendInternalError(reply, 'Erreur lors de l\'envoi de l\'invitation', { code: 'INTERNAL_ERROR' });
    }
  });
}

interface InvitationEmailData {
  to: string;
  senderName: string;
  senderAvatar?: string | null;
  downloadUrl: string;
  language?: string;
}
