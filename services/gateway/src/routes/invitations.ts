import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { logError } from '../utils/logger';

const sendEmailInvitationSchema = z.object({
  email: z.string().email(),
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
      const { userId } = request.user as { userId: string };

      const user = await fastify.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true, username: true, avatar: true, systemLanguage: true },
      });

      if (!user) {
        return reply.status(404).send({ success: false, error: { code: 'USER_NOT_FOUND', message: 'Utilisateur non trouve' } });
      }

      const existingUser = await fastify.prisma.user.findFirst({
        where: { email },
        select: { id: true },
      });

      if (existingUser) {
        return reply.status(409).send({
          success: false,
          error: { code: 'USER_ALREADY_EXISTS', message: 'Cet utilisateur est deja sur Meeshy' },
        });
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

      return reply.status(201).send({
        success: true,
        data: {
          email,
          sentAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Adresse email invalide' },
        });
      }
      logError(fastify.log, 'Failed to send email invitation', error);
      return reply.status(500).send({
        success: false,
        error: { code: 'INTERNAL_ERROR', message: 'Erreur lors de l\'envoi de l\'invitation' },
      });
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
