import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';
import { sendSuccess, sendBadRequest, sendNotFound, sendConflict, sendInternalError } from '../utils/response.js';

const sendEmailInvitationSchema = z.object({
  email: z.email(),
});

export async function invitationRoutes(fastify: FastifyInstance) {
  fastify.post('/invitations/email', {
    onRequest: [fastify.authenticate],
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '1 hour',
      },
    },
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
        select: { displayName: true, username: true, avatar: true, systemLanguage: true },
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
      const emailService = (fastify as unknown as { emailService?: { sendInvitationEmail: (data: InvitationEmailData) => Promise<unknown> } }).emailService;

      if (emailService) {
        await emailService.sendInvitationEmail({
          to: email,
          senderName,
          senderAvatar: user.avatar,
          downloadUrl: 'https://meeshy.me/download',
          language: user.systemLanguage ?? 'fr',
        });
      } else {
        fastify.log.warn('EmailService not available, invitation not sent');
      }

      return sendSuccess(reply, { email, sentAt: new Date().toISOString() }, { statusCode: 201 });
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
