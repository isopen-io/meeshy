/**
 * LA BULLE DE RÉSUMÉ SUIT LE DERNIER RELEVÉ (#20709).
 *
 * Le résumé « Appel … » est posté dès `call:end`, avec les octets et la
 * qualité persistés à cet instant. Le dernier `call:quality-report` du client
 * arrive pourtant APRÈS (fenêtre de grâce de #20459). Plutôt que de retarder
 * la bulle de tous les appels de la durée de cette fenêtre, on l'ÉDITE en
 * place quand ce relevé tardif a changé une mesure persistée, et on la
 * rediffuse en `message:edited` — même événement et même charge que la bascule
 * « en cours » → terminal, sans remonter la conversation (#20747).
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

const CONFLICT = Symbol('call-summary-conflict');

/** Relances d'une passe après un compare-and-set perdu : assez pour un concurrent, jamais une boucle. */
const MAX_CONFLICT_RERUNS = 2;

export type CallSummaryRefreshOutcome = {
  readonly edited: ReadonlyArray<CallSummaryMessage>;
  readonly conflicted: boolean;
};

const NOTHING: CallSummaryRefreshOutcome = { edited: [], conflicted: false };

type PostedSummary = { readonly id: string; readonly updatedAt: Date; readonly metadata: Record<string, unknown> & Measures };

async function postedSummary(
  prisma: LateCallSummaryRefreshPrisma,
  conversationId: string,
  callId: string
): Promise<PostedSummary | null> {
  const existing = await prisma.message.findFirst({
    where: { conversationId, clientMessageId: callSummaryClientMessageId(callId), ...unsetOrNull('deletedAt') },
    select: { id: true, metadata: true, updatedAt: true }
  });
  const metadata = asTerminalSummary(existing?.metadata);
  return existing && metadata ? { id: existing.id, updatedAt: existing.updatedAt, metadata } : null;
}

function rewriteMeasures(
  prisma: LateCallSummaryRefreshPrisma,
  posted: PostedSummary,
  fresh: Measures
): Promise<CallSummaryMessage | typeof CONFLICT> {
  return prisma.message
    .update({
      where: { id: posted.id, updatedAt: posted.updatedAt },
      data: { metadata: { ...posted.metadata, ...measuresOf(fresh) } as Prisma.InputJsonValue },
      include: CALL_SUMMARY_MESSAGE_INCLUDE
    })
    .catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') return CONFLICT;
      throw error;
    });
}

/**
 * Réécrit les mesures des résumés TERMINAUX d'un appel terminé depuis la ligne
 * `CallSession` — celui de sa conversation et, pour un appel basculé, la bulle
 * miroir de son tête-à-tête d'origine (#19650) ; rend les messages édités
 * (aucun quand rien n'a changé, que le résumé n'existe pas encore, est encore
 * « en cours » ou a été effacé). Les bulles sont lues AVANT l'instantané des
 * mesures, et chaque écriture est conditionnée à l'`updatedAt` lu : une
 * écriture concurrente la fait renoncer (`P2025`, `conflicted`), jamais
 * écraser par un relevé plus ancien (#20747). Les faits relus pour une autre
 * conversation que l'ancre (une bascule de groupe, `callConversationRebranch`,
 * qui déplace la session) ne réécrivent rien.
 */
export async function refreshEndedCallSummaryMeasures(
  prisma: LateCallSummaryRefreshPrisma,
  callId: string
): Promise<CallSummaryRefreshOutcome> {
  const anchor = await prisma.callSession.findUnique({
    where: { id: callId },
    select: { conversationId: true, originConversationId: true }
  });
  if (!anchor) return NOTHING;
  const conversationIds = [anchor.conversationId, anchor.originConversationId].filter((id): id is string => typeof id === 'string');
  const posted = (await Promise.all(conversationIds.map((id) => postedSummary(prisma, id, callId))))
    .filter((summary): summary is PostedSummary => summary !== null);
  if (posted.length === 0) return NOTHING;
  const call = await prisma.callSession.findUnique({ where: { id: callId }, select: CALL_SUMMARY_FACTS_SELECT });
  const fresh = call && call.conversationId === anchor.conversationId ? buildCallSummaryMetadata(callSummaryFacts(call)) : null;
  if (!fresh) return NOTHING;
  const edited = await Promise.all(
    posted.filter((summary) => !sameMeasures(summary.metadata, fresh)).map((summary) => rewriteMeasures(prisma, summary, fresh))
  );
  return {
    edited: edited.filter((message): message is CallSummaryMessage => message !== CONFLICT),
    conflicted: edited.includes(CONFLICT)
  };
}

/**
 * Le rafraîchisseur que branchent le gestionnaire de `call:quality-report` et
 * la pose du résumé : il coalesce par appel, diffuse chaque résumé édité en
 * `message:edited` (noms des participants réhydratés, comme à la pose) par le
 * diffuseur d'édition de MESURES — qui ne remonte pas la conversation —, tait
 * celui qu'une conversation obsolète a scellé (#14643) et avale toute panne.
 * Une passe dont une écriture a perdu son compare-and-set se relance, au plus
 * `MAX_CONFLICT_RERUNS` fois. Choix assumé : quand la pose du résumé ne le
 * relance pas (pose nulle, diffuseur absent, réessai de la pose), le
 * rattrapage repose sur le prochain `call:quality-report` tardif.
 */
export function createLateCallSummaryRefresher(deps: {
  readonly prisma: () => LateCallSummaryRefreshPrisma;
  readonly broadcastEdited: () => EditedBroadcaster | null;
  readonly sealed: (message: { readonly id: string; readonly conversationId: string }) => Promise<boolean>;
}): (callId: string) => Promise<void> {
  const running = new Map<string, Promise<void>>();
  const rerun = new Set<string>();

  const refreshOnce = async (callId: string): Promise<boolean> => {
    const prisma = deps.prisma();
    const { edited, conflicted } = await refreshEndedCallSummaryMeasures(prisma, callId);
    for (const message of edited) {
      const broadcast = deps.broadcastEdited();
      if (!broadcast || (await deps.sealed(message))) continue;
      const [served] = await withCallSummaryParticipantNames(prisma, [message]);
      await broadcast(served, message.conversationId);
    }
    return conflicted;
  };

  const drain = async (callId: string): Promise<void> => {
    try {
      let conflictReruns = 0;
      do {
        rerun.delete(callId);
        const conflicted = await refreshOnce(callId).catch((error: unknown) => {
          logger.warn('Late call summary refresh failed', { callId, error: error instanceof Error ? error.message : String(error) });
          return false;
        });
        if (conflicted && conflictReruns < MAX_CONFLICT_RERUNS) {
          conflictReruns += 1;
          rerun.add(callId);
        }
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
