import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { reportTargetsActor, type ReportedContent } from '../../services/reports/reportedContentAuthor';
import { logWarn } from '../../utils/logger';
import { sendForbidden } from '../../utils/response';
import { actorOf } from './publication-moderation-writer';

/**
 * **UN MODÉRATEUR NE TRAITE PAS UN SIGNALEMENT QUI VISE SON PROPRE CONTENU** (#10458).
 *
 * La garde est la même pour tout ce qui ÉCRIT sur un signalement — l'acte en un
 * geste, la mise à jour, la suppression, la prise en charge : 403 `SELF_MODERATION`,
 * et rien n'est écrit sur le signalement. Le refus est journalisé
 * (`ADMIN_REPORT_SELF_MODERATION_REFUSED`, comme `SERVER_OPERATION_REFUSED` pour les
 * opérations serveur, #10459) : un modérateur qui tente de classer le signalement de
 * sa propre publication est un fait que le rang supérieur doit pouvoir lire.
 * L'échec du journal ne lève pas le refus : la garde est fail-closed, le journal est
 * un effort.
 */
export type ReportWriteGesture = 'act' | 'update' | 'delete' | 'assign';

type GuardedReport = ReportedContent & { readonly id: string };

type Refusal = { readonly gesture: ReportWriteGesture; readonly act?: string };

async function journalRefusal(fastify: FastifyInstance, request: FastifyRequest, report: GuardedReport, refusal: Refusal): Promise<void> {
  try {
    await fastify.prisma.adminAuditLog.create({
      data: {
        adminId: actorOf(request).id,
        userId: report.reportedEntityId,
        action: 'ADMIN_REPORT_SELF_MODERATION_REFUSED',
        entity: 'Report',
        entityId: report.id,
        metadata: JSON.stringify({ code: 'SELF_MODERATION', gesture: refusal.gesture, ...(refusal.act === undefined ? {} : { act: refusal.act }), reportedType: report.reportedType }),
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] ?? null,
      },
    });
  } catch (error) {
    logWarn(fastify.log, '[admin report] self-moderation refusal audit failed', error);
  }
}

/** Vrai quand la réponse 403 est PARTIE : la route s'arrête là. */
export async function refusedAsSelfModeration(
  fastify: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
  report: GuardedReport,
  refusal: Refusal,
): Promise<boolean> {
  if (!(await reportTargetsActor(fastify.prisma, report, actorOf(request).id))) return false;
  await journalRefusal(fastify, request, report, refusal);
  sendForbidden(reply, 'Un signalement qui vise votre propre contenu ne se traite pas par vous', { code: 'SELF_MODERATION' });
  return true;
}
