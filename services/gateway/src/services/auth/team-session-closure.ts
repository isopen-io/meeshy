/**
 * UN MEMBRE DÉCONNECTÉ PAR L'ADMINISTRATION EN EST TOUJOURS INFORMÉ (#9613),
 * et l'administrateur n'est JAMAIS nommé — c'est « l'équipe Meeshy ».
 *
 * Trois canaux, chacun pour ce qu'il sait faire :
 *  - la socket de l'appareil coupé reçoit `auth:session-revoked` avec le motif
 *    `admin_revoke` (posé par l'appelant, `disconnectSession` /
 *    `disconnectRevokedSessions`) ;
 *  - un `SecurityEvent` reste dans l'historique du compte, que le membre
 *    retrouve dans son export et l'administration dans sa fiche ;
 *  - un e-mail, quand plus AUCUNE session ne vit — le membre n'a alors plus
 *    d'appareil pour l'apprendre autrement. Il part par le gabarit d'alerte de
 *    sécurité existant, dans la langue de CADRAGE du membre (Prisme).
 *
 * Ni l'identifiant, ni l'adresse, ni l'agent de l'administrateur n'entrent dans
 * l'événement ou l'e-mail : ils vivent dans `AdminAuditLog`, que l'équipe lit.
 *
 * Best-effort : la fermeture est déjà écrite quand ceci s'exécute ; un canal
 * qui échoue est journalisé, jamais remonté en 500.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { RECIPIENT_LANG_SELECT, recipientLanguage } from '../../utils/recipient-language';

const logger = enhancedLogger.child({ module: 'TeamSessionClosure' });

export type TeamClosureScope = 'one' | 'all';

const CLOSURE_EVENT = {
  one: { eventType: 'SESSION_CLOSED_BY_TEAM', description: 'Session fermée par l’équipe Meeshy' },
  all: { eventType: 'SESSIONS_CLOSED_BY_TEAM', description: 'Toutes les sessions ont été fermées par l’équipe Meeshy' },
} as const;

/** Le gabarit d'alerte (`services/email/translations.ts`) qui dit la fermeture au membre. */
export const TEAM_CLOSURE_ALERT_TYPE = 'sessions_closed_by_team';

type ClosureStore = Pick<PrismaClient, 'securityEvent' | 'userSession' | 'user'>;

export type TeamClosureMailer = {
  sendSecurityAlertEmail(data: { to: string; name: string; alertType: string; details: string; language?: string }): Promise<unknown>;
};

export async function informMemberOfTeamClosure(
  deps: { readonly prisma: ClosureStore; readonly emailService: TeamClosureMailer },
  params: { readonly userId: string; readonly scope: TeamClosureScope; readonly sessionIds: readonly string[] },
): Promise<void> {
  const { prisma, emailService } = deps;
  const { userId, scope, sessionIds } = params;

  try {
    await prisma.securityEvent.create({
      data: {
        userId,
        ...CLOSURE_EVENT[scope],
        severity: 'MEDIUM',
        status: 'SUCCESS',
        metadata: { scope, sessionIds: [...sessionIds] },
      },
    });
  } catch (error) {
    logger.error('team closure security event not recorded', { error });
  }

  try {
    const live = await prisma.userSession.count({
      where: { userId, isValid: true, expiresAt: { gt: new Date() } },
    });
    if (live > 0) return;

    const member = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, username: true, firstName: true, displayName: true, ...RECIPIENT_LANG_SELECT },
    });
    if (!member?.email) return;

    await emailService.sendSecurityAlertEmail({
      to: member.email,
      name: member.displayName || member.firstName || member.username,
      alertType: TEAM_CLOSURE_ALERT_TYPE,
      details: '',
      language: recipientLanguage(member, 'fr'),
    });
  } catch (error) {
    logger.error('team closure e-mail not sent', { error });
  }
}
