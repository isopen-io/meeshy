/**
 * Un appel DÉCROCHÉ compte pour la paire (#13932, RG-04).
 *
 * Quand le destinataire décroche (la transition vers `active` qui pose
 * `answeredAt`), les deux personnes d'un appel à DEUX comptent l'une envers
 * l'autre : un appel est un échange des deux côtés. Un appel manqué ou refusé
 * n'est pas une interaction de celui qui n'a pas répondu et ne compte pas ; un
 * appel de groupe n'adresse personne en particulier et ne compte pas non plus.
 *
 * Fire-and-forget : un compteur en panne ne défait jamais un appel.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { notePairInteraction, type PairInteractionDb } from './pairInteractionRecorder.js';

const logger = enhancedLogger.child({ module: 'CallInteractions' });

type CallInteractionDb = PairInteractionDb & {
  readonly callParticipant: {
    findMany(args: unknown): PromiseLike<ReadonlyArray<{ participant: { userId: string | null } | null }>>;
  };
};

export function noteAnsweredCall(prisma: CallInteractionDb | PrismaClient, params: { callId: string; at?: Date }): void {
  const db = prisma as CallInteractionDb;
  void Promise.resolve()
    .then(async () => {
      const rows = await db.callParticipant.findMany({
        where: { callSessionId: params.callId },
        select: { participant: { select: { userId: true } } },
      });
      const users = [...new Set(rows.map((row) => row.participant?.userId).filter((id): id is string => Boolean(id)))];
      if (users.length !== 2) return;
      const at = params.at ?? new Date();
      notePairInteraction(db, { actorId: users[0], otherId: users[1], nature: 'call', at });
      notePairInteraction(db, { actorId: users[1], otherId: users[0], nature: 'call', at });
    })
    .catch((error: unknown) => logger.warn('call interaction not counted', { callId: params.callId, error }));
}
