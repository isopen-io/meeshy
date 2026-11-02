/**
 * Le branchement de l'envoi chiffré sur les singletons de l'application
 * (#14592) — chargé à la demande par `useSend`, comme la pile elle-même.
 */
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import type { Message, Participant } from '@/lib/api/types';
import { outboxStore } from '@/lib/send/outbox-store';

import { e2eeClientFor } from './runtime';
import { performEndToEndSend } from './send';

export function sendEndToEnd(params: {
  readonly conversationId: string;
  readonly peerUserId: string;
  readonly viewerId: string;
  readonly sender?: Participant;
  readonly text: string;
  readonly language: string;
  readonly replyTo: Message | null;
  readonly regimeEpoch?: number;
}): Promise<void> {
  return performEndToEndSend({
    conversationId: params.conversationId,
    peerUserId: params.peerUserId,
    viewerId: params.viewerId,
    ...(params.sender === undefined ? {} : { sender: params.sender }),
    draft: { text: params.text, language: params.language, replyTo: params.replyTo },
    ...(params.regimeEpoch === undefined ? {} : { regimeEpoch: params.regimeEpoch }),
    client: () => e2eeClientFor(params.viewerId),
    transport: apiDeps.transport,
    queryClient: appQueryClient,
    outbox: outboxStore,
  });
}
