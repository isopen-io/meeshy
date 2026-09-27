/**
 * `POST /admin/users/:userId/verification-requests` — l'administration RENVOIE
 * la vérification d'un contact du membre (#8289).
 *
 * - `email` : le même envoi que `POST /auth/resend-verification` (code + lien,
 *   dans la langue du membre) ;
 * - `phone` : le même SMS que `POST /auth/send-phone-code`.
 *
 * Le geste n'écrit AUCUNE preuve : il ne fait qu'émettre ce que le membre
 * aurait pu redemander lui-même. Marquer vérifié reste l'affaire de
 * `PATCH /admin/users/:userId/verifications`.
 *
 * ## Les gardes
 *
 * Celles des écritures d'un compte (`users-write.ts`) : `canUpdateUsers`, le
 * RANG (`requireHierarchy`), puis la loi du champ de vérification du canal
 * (`emailVerified` / `phoneVerified`) — relancer une vérification ne coûte pas
 * moins que de la poser.
 *
 * ## L'audit ne porte rien de secret
 *
 * La ligne dit QUEL canal a été relancé, et le motif. Ni le code, ni le lien,
 * ni l'adresse ou le numéro : ils vivent déjà sur la fiche, et une trace
 * d'audit n'est pas un second endroit où les recopier.
 */
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { UserAuditAction, UserRoleEnum } from '@meeshy/shared/types';
import type { UserAuditService } from '../../services/admin/user-audit.service';
import { requireUserModifyAccess } from '../../middleware/admin-user-auth.middleware';
import { requireHierarchy } from '../../middleware/authorize';
import { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { sendBadRequest, sendError, sendForbidden, sendInternalError, sendNotFound, sendSuccess } from '../../utils/response';
import { logError } from '../../utils/logger.js';
import { evaluerLoiDesChamps } from './user-field-law';
import { AuthService } from '../../services/AuthService';
import { getJwtSecret } from '../../utils/secrets';

export type VerificationSendOutcome = { readonly success: boolean; readonly error?: string };

/** Les deux envois PUBLICS, injectés : la route ne recompose ni code ni lien. */
export type VerificationSender = {
  readonly email: (address: string) => Promise<VerificationSendOutcome>;
  readonly phone: (phoneNumber: string) => Promise<VerificationSendOutcome>;
};

/**
 * Les envois de `AuthService`, construits au PREMIER appel — comme
 * `routes/magic-link.ts` : aucun service d'authentification n'est monté pour
 * une route qu'aucun administrateur n'a encore appelée.
 */
export function authVerificationSender(fastify: FastifyInstance): VerificationSender {
  let service: AuthService | null = null;
  const auth = (): AuthService => {
    service ??= new AuthService(fastify.prisma, getJwtSecret());
    return service;
  };
  return {
    email: (address) => auth().resendVerificationEmail(address),
    phone: (phoneNumber) => auth().sendPhoneVerificationCode(phoneNumber),
  };
}

type Deps = { readonly userAuditService: UserAuditService; readonly sender: VerificationSender };

const bodySchema = z.object({
  channel: z.enum(['email', 'phone']),
  reason: z.string().max(500).optional(),
});

type Channel = z.infer<typeof bodySchema>['channel'];

const CHAMP_DE_LOI: Readonly<Record<Channel, string>> = { email: 'emailVerified', phone: 'phoneVerified' };

const TARGET_SELECT = {
  id: true,
  email: true,
  phoneNumber: true,
  emailVerifiedAt: true,
  phoneVerifiedAt: true,
} as const;

function refuserSelonLaLoi(reply: FastifyReply, role: UserRoleEnum, channel: Channel, motif: string | undefined): boolean {
  const refus = evaluerLoiDesChamps({ role, champs: [CHAMP_DE_LOI[channel]], ...(motif === undefined ? {} : { motif }) });
  if (!refus) return false;
  if (refus.cause === 'inconnu' || refus.cause === 'motif') sendBadRequest(reply, refus.message);
  else sendForbidden(reply, refus.message, { message: refus.message });
  return true;
}

export function registerUserVerificationRequestRoutes(fastify: FastifyInstance, deps: Deps): void {
  const gardes = [fastify.authenticate, requireUserModifyAccess, requireHierarchy({ param: 'userId' })];

  fastify.post<{ Params: { userId: string } }>('/admin/users/:userId/verification-requests', { preHandler: gardes }, async (request, reply) => {
    try {
      const parsed = bodySchema.safeParse(request.body);
      if (!parsed.success) return sendBadRequest(reply, 'Invalid input data');
      const { channel } = parsed.data;
      const motif = parsed.data.reason?.trim() || undefined;

      const ctx = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const moi = { id: ctx.registeredUser!.id, role: ctx.registeredUser!.role as UserRoleEnum };
      if (refuserSelonLaLoi(reply, moi.role, channel, motif)) return;

      const { userId } = request.params;
      const cible = await fastify.prisma.user.findUnique({ where: { id: userId }, select: TARGET_SELECT });
      if (!cible) return sendNotFound(reply, 'User not found', { message: 'The requested user does not exist' });

      const contact = channel === 'email' ? cible.email : cible.phoneNumber;
      if (!contact) return sendError(reply, 400, 'The member has no contact on this channel', { code: 'NO_CONTACT' });

      const verifie = channel === 'email' ? cible.emailVerifiedAt : cible.phoneVerifiedAt;
      if (verifie) return sendError(reply, 409, 'This contact is already verified', { code: 'ALREADY_VERIFIED' });

      const envoi = channel === 'email' ? await deps.sender.email(contact) : await deps.sender.phone(contact);
      if (!envoi.success) {
        return sendError(reply, 502, 'The verification could not be sent', { code: 'VERIFICATION_NOT_SENT' });
      }

      await deps.userAuditService.createAuditLog({
        userId,
        adminId: moi.id,
        action: UserAuditAction.REQUEST_VERIFICATION,
        entityId: userId,
        changes: { verificationRequested: { before: null, after: channel } },
        metadata: motif === undefined ? null : { reason: motif },
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'],
      });

      return sendSuccess(reply, { channel, sentAt: new Date().toISOString() }, { message: 'Verification sent' });
    } catch (error) {
      logError(fastify.log, 'Error requesting a verification', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to send the verification' });
    }
  });
}
