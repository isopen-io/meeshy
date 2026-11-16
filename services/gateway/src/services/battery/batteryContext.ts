/**
 * « EN CONVERSATION » avec l'émetteur (#14147, spec § 5) — les trois faits que la passerelle
 * lit pour chaque lecteur : la conversation directe ouverte au premier plan, l'heure du dernier
 * échange, et la réponse que l'émetteur doit encore (le dernier message est du lecteur, depuis
 * moins de 24 h). La décision elle-même reste à `batteryReaderInConversation` (shared).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { directConversationIdsOf } from '../conversations/directPair';
import type { BatteryContextReader, BatteryReaderContext } from './batteryRelay';

const AWAITING_REPLY_WINDOW_MS = 24 * 60 * 60 * 1000;

const NOTHING: BatteryReaderContext = { roomOpen: false, lastExchangeAt: null, awaitingReply: false };

export type BatteryContextDb = Pick<PrismaClient, 'conversation' | 'participant' | 'message'>;

export type BatteryContextDeps = {
  readonly prisma: BatteryContextDb;
  readonly isViewing: (userId: string, conversationId: string) => boolean;
};

async function contextOf(deps: BatteryContextDeps, params: { readonly emitterId: string; readonly readerId: string; readonly now: Date }): Promise<BatteryReaderContext> {
  const ids = await directConversationIdsOf(deps.prisma, { userId: params.readerId, peerId: params.emitterId });
  if (ids.length === 0) return NOTHING;
  const [mine, last] = await Promise.all([
    deps.prisma.participant.findMany({
      where: { conversationId: { in: [...ids] }, userId: params.readerId, isActive: true },
      select: { id: true },
    } as never) as Promise<ReadonlyArray<{ readonly id: string }>>,
    deps.prisma.message.findFirst({
      where: { conversationId: { in: [...ids] }, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { senderId: true, createdAt: true },
    } as never) as Promise<{ readonly senderId: string | null; readonly createdAt: Date } | null>,
  ]);
  const roomOpen = ids.some((id) => deps.isViewing(params.readerId, id));
  if (last === null) return { ...NOTHING, roomOpen };
  const fromReader = mine.some((row) => row.id === last.senderId);
  const fresh = params.now.getTime() - last.createdAt.getTime() < AWAITING_REPLY_WINDOW_MS;
  return { roomOpen, lastExchangeAt: last.createdAt.toISOString(), awaitingReply: fromReader && fresh };
}

export function batteryContextReaderOf(deps: BatteryContextDeps): BatteryContextReader {
  return async ({ emitterId, readerIds, now }) => {
    const entries = await Promise.all(
      readerIds.map(async (readerId) => [readerId, await contextOf(deps, { emitterId, readerId, now }).catch(() => NOTHING)] as const),
    );
    return new Map(entries);
  };
}
