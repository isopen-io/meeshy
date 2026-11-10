/**
 * SIGNALER UN CONTENU REÇU D'UN RÉSEAU TIERS (#17120, chantier #17007 ; DSA
 * art. 16 et 17, #16991 / #16992).
 *
 * Une conversation externe est chiffrée de bout en bout : le serveur n'en lit
 * aucun message, et ce lot ne change rien à cela.
 *
 * - **Le clair ne part que si le signalant le transmet LUI-MÊME**
 *   (`disclosedText`, facultatif, borné) : il devient la raison du signalement,
 *   lue par un modérateur humain. Aucune analyse automatique : ce module
 *   n'appelle ni traduction, ni classification, ni modération automatique.
 * - **Le pair est bloqué localement** (`ExternalConversationPeer.blockedAt`),
 *   par défaut : Meeshy ne peut pas agir sur le compte WhatsApp, il cesse de
 *   remettre à l'ouvreur ce qui vient de ce pair (le relais lit ce champ).
 * - **L'orientation** : la réponse dit au client d'indiquer le mécanisme de
 *   signalement de Meta (`EXTERNAL_REPORT_ORIENTATION`) — le retrait chez
 *   WhatsApp n'appartient qu'à Meta.
 * - Seul un membre ACTIF d'une conversation `external` la signale ; toute autre
 *   cible est une absence (404, sans dire laquelle des deux).
 *
 * Ce module ne journalise rien : le texte transmis et le numéro du pair n'ont
 * rien à faire dans un journal.
 */
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EXTERNAL_CONVERSATION_TYPE } from '@meeshy/shared/types/external-conversation';
import {
  EXTERNAL_REPORT_DISCLOSED_TEXT_MAX,
  EXTERNAL_REPORT_ORIENTATION,
  type ExternalReportAcknowledgement,
} from '@meeshy/shared/types/external-interop-compliance';

export const externalReportRequestSchema = z
  .object({
    reportType: z.enum(['spam', 'inappropriate', 'harassment', 'violence', 'hate_speech', 'fake_profile', 'impersonation', 'other']),
    disclosedText: z.string().trim().min(1).max(EXTERNAL_REPORT_DISCLOSED_TEXT_MAX).optional(),
    blockPeer: z.boolean().default(true),
  })
  .strict();

export type ExternalReportRequest = z.infer<typeof externalReportRequestSchema>;

/** Ce que le signalement écrit dans la file de modération : une ligne `Report` ordinaire, sur la conversation. */
export type ExternalReportRow = {
  readonly reportedType: 'conversation';
  readonly reportedEntityId: string;
  readonly reportType: ExternalReportRequest['reportType'];
  readonly reporterId: string;
  readonly reporterName?: string;
  readonly reason?: string;
};

export type ExternalReportDeps = {
  readonly prisma: Pick<PrismaClient, 'conversation' | 'externalConversationPeer'>;
  readonly createReport: (row: ExternalReportRow) => Promise<{ readonly id: string }>;
  readonly now: () => Date;
};

export type ExternalReportOutcome =
  | { readonly kind: 'reported'; readonly acknowledgement: ExternalReportAcknowledgement }
  | { readonly kind: 'not-found' };

async function isExternalMember(deps: ExternalReportDeps, conversationId: string, userId: string): Promise<boolean> {
  const conversation = await deps.prisma.conversation.findFirst({
    where: { id: conversationId, type: EXTERNAL_CONVERSATION_TYPE, participants: { some: { userId, isActive: true } } },
    select: { id: true },
  });
  return conversation !== null;
}

async function blockPeer(deps: ExternalReportDeps, conversationId: string, userId: string): Promise<boolean> {
  const { count } = await deps.prisma.externalConversationPeer.updateMany({
    where: { conversationId, openedByUserId: userId },
    data: { blockedAt: deps.now() },
  });
  return count > 0;
}

export async function reportExternalContent(
  deps: ExternalReportDeps,
  params: { readonly userId: string; readonly username?: string; readonly conversationId: string; readonly request: ExternalReportRequest },
): Promise<ExternalReportOutcome> {
  if (!(await isExternalMember(deps, params.conversationId, params.userId))) return { kind: 'not-found' };

  const report = await deps.createReport({
    reportedType: 'conversation',
    reportedEntityId: params.conversationId,
    reportType: params.request.reportType,
    reporterId: params.userId,
    ...(params.username ? { reporterName: params.username } : {}),
    ...(params.request.disclosedText ? { reason: params.request.disclosedText } : {}),
  });
  const peerBlocked = params.request.blockPeer ? await blockPeer(deps, params.conversationId, params.userId) : false;

  return { kind: 'reported', acknowledgement: { reportId: report.id, peerBlocked, orientation: EXTERNAL_REPORT_ORIENTATION } };
}
