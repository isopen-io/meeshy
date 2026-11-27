/**
 * LA BULLE DE RÉSUMÉ SUIT LE DERNIER RELEVÉ (#20709).
 *
 * Le résumé « Appel … » est posté dès `call:end`, avec les octets et la
 * qualité persistés à cet instant. Le dernier `call:quality-report` du client
 * arrive pourtant APRÈS (fenêtre de grâce de #20459). Plutôt que de retarder
 * la bulle de tous les appels de la durée de cette fenêtre, on l'ÉDITE en
 * place quand ce relevé tardif a changé une mesure persistée, et on la
 * rediffuse par le diffuseur `message:edited` déjà utilisé pour la bascule
 * « en cours » → terminal.
 *
 * Seules les trois mesures de la métadonnée changent (`bytesTotal`,
 * `bytesEstimated`, `networkQuality`), recalculées par le MÊME constructeur
 * que la pose : aucun champ n'est retiré, renommé ni ajouté. Mesures
 * identiques ⇒ ni écriture ni événement. Les rafraîchissements d'un même
 * appel se coalescent : au plus un en cours et un de rattrapage, quel que
 * soit le nombre de relevés reçus pendant ce temps. Ne lève jamais.
 */
import { Prisma, type PrismaClient } from '@meeshy/shared/prisma/client';
import { buildCallSummaryMetadata, callSummaryClientMessageId } from '@meeshy/shared/utils/call-summary';
import { logger } from '../../utils/logger';
import { unsetOrNull } from '../../utils/prisma-unset';
import { CALL_SUMMARY_MESSAGE_INCLUDE } from '../CallService';
import { CALL_SUMMARY_FACTS_SELECT, callSummaryFacts } from './callSummaryFacts';
import { withCallSummaryParticipantNames } from './callSummaryParticipantNames';

export type LateCallSummaryRefreshPrisma = Pick<PrismaClient, 'callSession' | 'message' | 'participant'>;

type EditedBroadcaster = (message: unknown, conversationId: string) => Promise<void>;

type CallSummaryMessage = Prisma.MessageGetPayload<{ include: typeof CALL_SUMMARY_MESSAGE_INCLUDE }>;

const MEASURE_KEYS = ['bytesTotal', 'bytesEstimated', 'networkQuality'] as const;

type Measures = { readonly [K in (typeof MEASURE_KEYS)[number]]: unknown };

const measuresOf = (metadata: Measures): Measures => ({
  bytesTotal: metadata.bytesTotal,
  bytesEstimated: metadata.bytesEstimated,
  networkQuality: metadata.networkQuality
});

const sameMeasures = (a: Measures, b: Measures): boolean => MEASURE_KEYS.every((key) => a[key] === b[key]);

const asTerminalSummary = (metadata: unknown): (Record<string, unknown> & Measures) | null =>
  metadata !== null && typeof metadata === 'object' && (metadata as { kind?: unknown }).kind === 'call'
    ? (metadata as Record<string, unknown> & Measures)
    : null;

/**
 * Réécrit les mesures du résumé TERMINAL d'un appel terminé depuis la ligne
 * `CallSession` ; rend le message édité, ou `null` quand rien n'a changé, que
 * le résumé n'existe pas encore, est encore « en cours » ou a été effacé.
 * L'écriture est conditionnée à l'instantané lu (`updatedAt`) : une écriture
 * concurrente la fait renoncer (`P2025`), jamais écraser.
 */
export async function refreshEndedCallSummaryMeasures(
  prisma: LateCallSummaryRefreshPrisma,
  callId: string
): Promise<CallSummaryMessage | null> {
  const call = await prisma.callSession.findUnique({ where: { id: callId }, select: CALL_SUMMARY_FACTS_SELECT });
  const fresh = call ? buildCallSummaryMetadata(callSummaryFacts(call)) : null;
  if (!call || !fresh) return null;
  const existing = await prisma.message.findFirst({
    where: { conversationId: call.conversationId, clientMessageId: callSummaryClientMessageId(call.id), ...unsetOrNull('deletedAt') },
    select: { id: true, metadata: true, updatedAt: true }
  });
  const posted = asTerminalSummary(existing?.metadata);
  if (!existing || !posted || sameMeasures(posted, fresh)) return null;
  return prisma.message
    .update({
      where: { id: existing.id, updatedAt: existing.updatedAt },
      data: { metadata: { ...posted, ...measuresOf(fresh) } as Prisma.InputJsonValue },
      include: CALL_SUMMARY_MESSAGE_INCLUDE
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return null;
      throw error;
    });
}

/**
 * Le rafraîchisseur que branche le gestionnaire de `call:quality-report` : il
 * coalesce par appel, diffuse le résumé édité en `message:edited` (noms des
 * participants réhydratés, comme à la pose) et avale toute panne.
 */
export function createLateCallSummaryRefresher(deps: {
  readonly prisma: () => LateCallSummaryRefreshPrisma;
  readonly broadcastEdited: () => EditedBroadcaster | null;
}): (callId: string) => Promise<void> {
  const running = new Map<string, Promise<void>>();
  const rerun = new Set<string>();

  const refreshOnce = async (callId: string): Promise<void> => {
    const prisma = deps.prisma();
    const message = await refreshEndedCallSummaryMeasures(prisma, callId);
    const broadcast = deps.broadcastEdited();
    if (!message || !broadcast) return;
    const [served] = await withCallSummaryParticipantNames(prisma, [message]);
    await broadcast(served, message.conversationId);
  };

  const drain = async (callId: string): Promise<void> => {
    try {
      do {
        rerun.delete(callId);
        await refreshOnce(callId).catch((error: unknown) => {
          logger.warn('Late call summary refresh failed', { callId, error: error instanceof Error ? error.message : String(error) });
        });
      } while (rerun.has(callId));
    } finally {
      running.delete(callId);
    }
  };

  return (callId: string): Promise<void> => {
    const inFlight = running.get(callId);
    if (inFlight) {
      rerun.add(callId);
      return inFlight;
    }
    const started = drain(callId);
    running.set(callId, started);
    return started;
  };
}
