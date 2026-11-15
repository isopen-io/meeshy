import {
  broadcastReadStatus,
  type ReadStatusBroadcastDeps,
} from '../../socketio/broadcastReadStatus';
import { RECEIPTS_MAX_WRITE_MESSAGE_IDS } from '../../routes/conversations/receipts-contracts';

/**
 * Les collaborateurs de la diffusion, résolus au moment d'émettre — `io` et le
 * pont ✦ naissent après `MessagingService` chez ses deux hôtes (le gestionnaire
 * Socket.IO, la route REST d'envoi).
 */
export type ReadBroadcastDepsProvider = () => ReadStatusBroadcastDeps;

/**
 * G-8 (#7347) — répondre marque lu l'arriéré de l'expéditeur
 * (`MessagingService.runPostSaveSideEffects` → `markMessagesAsRead`, mode
 * fenêtre) ; ce marquage doit se DIRE à la conversation comme n'importe quel
 * accusé, sinon les coches des messages ainsi lus restent grises chez leurs
 * auteurs jusqu'au rechargement.
 *
 * Le lot se RELIT dans ce que l'écriture a figé (`readAt ≥ frozenSince`, horloge
 * prise avant le marquage) plutôt que de rejouer la fenêtre du gel : une
 * seconde règle de fenêtre divergerait de la première. Une lecture concurrente
 * du même participant dans le même instant y figure aussi — elle est vraie, et
 * son résumé l'est aussi. Borné au plafond d'écriture des accusés : au-delà, la
 * diffusion par message coûterait plus que le rechargement qu'elle évite.
 *
 * La préférence `showReadReceipts`, les deux audiences et le badge restent la
 * règle de `broadcastReadStatus` — cette fonction ne fait que lui nommer le lot.
 */
export async function announceSenderBacklogRead(params: {
  readonly depsProvider: ReadBroadcastDepsProvider | undefined;
  readonly frozenCount: number;
  readonly frozenSince: Date;
  readonly participantId: string;
  readonly conversationId: string;
  readonly senderUserId: string | null;
}): Promise<void> {
  if (!params.depsProvider || params.frozenCount <= 0) return;
  const deps = params.depsProvider();

  const frozen = await deps.prisma.messageStatusEntry.findMany({
    where: {
      participantId: params.participantId,
      conversationId: params.conversationId,
      readAt: { gte: params.frozenSince },
    },
    select: { messageId: true },
    take: RECEIPTS_MAX_WRITE_MESSAGE_IDS,
  });
  if (frozen.length === 0) return;

  await broadcastReadStatus(deps, {
    conversationId: params.conversationId,
    participantId: params.participantId,
    userId: params.senderUserId ?? params.participantId,
    isAnonymous: params.senderUserId === null,
    type: 'read',
    messageIds: frozen.map((entry) => entry.messageId),
  });
}
