/**
 * Mes invitations envoyées, leur relance, et la désinscription de l'invité (#19207).
 *
 * - `GET /invitations/email` — la liste de MES invitations, adresse masquée, état, relance.
 * - `POST /invitations/email/:id/resend` — une relance par 72 h, trois au plus.
 * - `POST /invitations/email/opt-out` — public : le porteur du lien « Ne plus recevoir
 *   d'invitation » de l'e-mail (`{ address, key }`) refuse toute invitation future à cette
 *   adresse. Le jeton d'inscription, que le parrain détient, n'y suffit pas.
 *
 * Les règles et l'accès aux tables vivent dans `services/referrals/emailInvitations.ts`.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { logError, logWarn } from '../utils/logger';
import { sendError, sendInternalError, sendNotFound, sendPaginatedSuccess, sendSuccess } from '../utils/response.js';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../utils/recipient-language';
import { createInvitationRateLimitConfig, createRateLimitConfig } from '../middleware/rate-limit';
import { requireEmailVerification } from '../middleware/auth';
import {
  claimInvitationResend,
  invitationOptOutUrl,
  listSentInvitations,
  optOutOfInvitations,
  type ResendRefusal,
} from '../services/referrals/emailInvitations';

type InvitationEmailData = {
  readonly to: string;
  readonly senderName: string;
  readonly senderAvatar?: string | null;
  readonly downloadUrl: string;
  readonly optOutUrl?: string;
  readonly language?: string;
};

type InvitationMailer = { sendInvitationEmail: (data: InvitationEmailData) => Promise<unknown> };

export const invitationMailerOf = (fastify: FastifyInstance): InvitationMailer | undefined =>
  (fastify as unknown as { emailService?: InvitationMailer }).emailService;

export const invitationUrlOf = (token: string): string =>
  `${process.env.FRONTEND_URL || 'http://localhost:3100'}/signup/affiliate/${token}`;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
});

const resendParamsSchema = z.object({ id: z.string().regex(/^[0-9a-f]{24}$/i) });

const optOutBodySchema = z.object({ address: z.string().regex(/^[0-9a-f]{64}$/), key: z.string().regex(/^[0-9a-f]{64}$/) });

const sentInvitationSchema = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    maskedEmail: { type: 'string', description: 'Adresse masquée côté serveur — jamais l’adresse complète' },
    sentAt: { type: 'string', format: 'date-time' },
    state: { type: 'string', enum: ['sent', 'opened', 'joined'] },
    resendCount: { type: 'number' },
    resendsLeft: { type: 'number' },
    canResend: { type: 'boolean' },
    nextResendAt: { type: 'string', format: 'date-time', nullable: true },
  },
} as const;

const errors = {
  400: errorResponseSchema,
  401: errorResponseSchema,
  403: errorResponseSchema,
  404: errorResponseSchema,
  409: errorResponseSchema,
  429: errorResponseSchema,
  500: errorResponseSchema,
  503: errorResponseSchema,
} as const;

const REFUSALS: Readonly<Record<Exclude<ResendRefusal, 'not-found'>, { status: number; code: string; error: string }>> = {
  joined: { status: 409, code: 'INVITATION_ALREADY_JOINED', error: 'Cette personne est deja sur Meeshy' },
  'opted-out': { status: 409, code: 'INVITATION_OPTED_OUT', error: 'Cette adresse ne souhaite plus recevoir d\'invitation' },
  'too-soon': { status: 429, code: 'INVITATION_RESEND_TOO_SOON', error: 'Une relance par 72 heures' },
  exhausted: { status: 429, code: 'INVITATION_RESEND_EXHAUSTED', error: 'Trois relances au plus' },
};

async function listHandler(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const parsed = listQuerySchema.safeParse(request.query);
  if (!parsed.success) return sendError(reply, 400, 'Parametres invalides', { code: 'VALIDATION_ERROR' });
  const { limit, offset } = parsed.data;
  try {
    const { items, total } = await listSentInvitations(fastify.prisma, { senderId: request.user!.userId, limit, offset, now: new Date() });
    return sendPaginatedSuccess(reply, items, { total, limit, offset, hasMore: offset + items.length < total });
  } catch (error) {
    logError(fastify.log, 'Failed to list email invitations', error);
    return sendInternalError(reply, 'Erreur lors de la lecture des invitations', { code: 'INTERNAL_ERROR' });
  }
}

async function resendHandler(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const parsed = resendParamsSchema.safeParse(request.params);
  if (!parsed.success) return sendNotFound(reply, 'Invitation introuvable', { code: 'INVITATION_NOT_FOUND' });
  const mailer = invitationMailerOf(fastify);
  if (!mailer) return sendError(reply, 503, 'Envoi d\'e-mail indisponible', { code: 'EMAIL_UNAVAILABLE' });
  const senderId = request.user!.userId;
  try {
    const sender = await fastify.prisma.user.findUnique({
      where: { id: senderId },
      select: { displayName: true, username: true, avatar: true, ...RECIPIENT_LANG_SELECT },
    });
    if (!sender) return sendNotFound(reply, 'Utilisateur non trouve', { code: 'USER_NOT_FOUND' });
    const claim = await claimInvitationResend(fastify.prisma, { senderId, invitationId: parsed.data.id, now: new Date() });
    if (claim.kind === 'refused') {
      if (claim.reason === 'not-found') return sendNotFound(reply, 'Invitation introuvable', { code: 'INVITATION_NOT_FOUND' });
      const refusal = REFUSALS[claim.reason];
      return sendError(reply, refusal.status, refusal.error, { code: refusal.code });
    }
    try {
      await mailer.sendInvitationEmail({
        to: claim.email,
        senderName: sender.displayName ?? sender.username,
        senderAvatar: sender.avatar,
        downloadUrl: invitationUrlOf(claim.token),
        optOutUrl: invitationOptOutUrl(claim.email),
        language: recipientLanguage(sender, 'fr'),
      });
    } catch (error) {
      await claim.release().catch((releaseError: unknown) => logWarn(fastify.log, 'invitation resend not released', releaseError));
      throw error;
    }
    return sendSuccess(reply, claim.served);
  } catch (error) {
    logError(fastify.log, 'Failed to resend email invitation', error);
    return sendInternalError(reply, 'Erreur lors de la relance de l\'invitation', { code: 'INTERNAL_ERROR' });
  }
}

async function optOutHandler(fastify: FastifyInstance, request: FastifyRequest, reply: FastifyReply) {
  const parsed = optOutBodySchema.safeParse(request.body);
  if (!parsed.success) return sendError(reply, 400, 'Lien invalide', { code: 'VALIDATION_ERROR' });
  try {
    const optedOut = await optOutOfInvitations(fastify.prisma, parsed.data);
    if (!optedOut) return sendNotFound(reply, 'Invitation introuvable', { code: 'INVITATION_NOT_FOUND' });
    return sendSuccess(reply, { optedOut: true });
  } catch (error) {
    logError(fastify.log, 'Failed to opt out of email invitations', error);
    return sendInternalError(reply, 'Erreur lors de la desinscription', { code: 'INTERNAL_ERROR' });
  }
}

export async function registerSentInvitationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/invitations/email', {
    onRequest: [fastify.authenticate],
    schema: {
      description: 'Mes invitations par e-mail (#19207) : adresse masquée, état sent/opened/joined, droits de relance',
      tags: ['invitations'],
      summary: 'List my email invitations',
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'array', items: sentInvitationSchema },
            pagination: {
              type: 'object',
              properties: { total: { type: 'number' }, limit: { type: 'number' }, offset: { type: 'number' }, hasMore: { type: 'boolean' } },
            },
          },
        },
        ...errors,
      },
    },
  }, (request, reply) => listHandler(fastify, request, reply));

  fastify.post('/invitations/email/:id/resend', {
    onRequest: [fastify.authenticate, requireEmailVerification],
    config: { rateLimit: createInvitationRateLimitConfig() },
    schema: {
      description: 'Relance une invitation (#19207) : une par 72 h, trois au plus, jamais vers une adresse inscrite ou désinscrite',
      tags: ['invitations'],
      summary: 'Resend an email invitation',
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: sentInvitationSchema } },
        ...errors,
      },
    },
  }, (request, reply) => resendHandler(fastify, request, reply));

  fastify.post('/invitations/email/opt-out', {
    ...createRateLimitConfig(20, '1 hour', 'invitation-opt-out'),
    schema: {
      description: 'L’invité refuse toute invitation future à son adresse (#19207) ; seule une empreinte est gardée',
      tags: ['invitations'],
      summary: 'Opt out of email invitations',
      response: {
        200: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object', properties: { optedOut: { type: 'boolean' } } } } },
        ...errors,
      },
    },
  }, (request, reply) => optOutHandler(fastify, request, reply));
}
