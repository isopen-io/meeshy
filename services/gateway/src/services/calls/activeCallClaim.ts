import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logger } from '../../utils/logger';

/**
 * La RÉSERVATION d'appel d'une conversation (`Conversation.activeCallId`) —
 * extraite de `CallService` (#7545), dont elle était la partie « qui détient
 * l'appel de cette conversation ? ». Trois opérations, toutes par
 * compare-and-swap sur un seul document (MongoDB garantit l'atomicité d'une
 * écriture de document sans transaction) :
 *
 * - `claim` — prendre la réservation pour un appel neuf ; se reprend sur un
 *   détenteur TERMINÉ (fuite de réservation, incident prod 2026-07-02) ;
 * - `release` — la rendre, seulement si c'est bien CET appel qui la tient ;
 * - `notifyChanged` — dire qu'un appel vivant a changé (arrivée, départ).
 *
 * Chaque changement EFFECTIF notifie l'écouteur, que `server.ts` branche sur
 * `emitConversationActivityUpdate` : la liste de conversations apprend
 * « Appel en cours · 3 participants » et sa fin. Une réservation perdue ou une
 * libération sans effet ne notifient rien.
 */

export type ActiveCallChangedListener = (conversationId: string, callId: string) => void;

type ClaimPrisma = Pick<PrismaClient, 'conversation' | 'callSession'>;

export class ActiveCallClaim {
  private listener: ActiveCallChangedListener | null = null;

  constructor(
    private readonly prisma: ClaimPrisma,
    private readonly liveStatuses: readonly string[],
  ) {}

  setListener(listener: ActiveCallChangedListener): void {
    this.listener = listener;
  }

  /** Best-effort : un écouteur qui lève ne touche jamais la réservation. */
  notifyChanged(conversationId: string, callId: string): void {
    try {
      this.listener?.(conversationId, callId);
    } catch (error) {
      logger.warn('active-call listener failed', { conversationId, error });
    }
  }

  /**
   * Prisma-on-MongoDB : `activeCallId: null` ne matche QUE le champ présent et
   * nul, jamais le champ ABSENT (toute conversation antérieure à la
   * réservation) — d'où la branche `isSet: false`, sans laquelle aucun appel ne
   * démarrait sur ces documents (incident prod 2026-07-02 : 211/211).
   */
  async claim(conversationId: string, callId: string): Promise<boolean> {
    const claim = await this.prisma.conversation.updateMany({
      where: { id: conversationId, OR: [{ activeCallId: null }, { activeCallId: { isSet: false } }] },
      data: { activeCallId: callId },
    });
    const won = claim.count > 0 || (await this.reclaimFromTerminalHolder(conversationId, callId));
    if (won) this.notifyChanged(conversationId, callId);
    return won;
  }

  /**
   * Compare-and-clear sur `activeCallId: callId` : un appel qui n'a jamais tenu
   * la réservation — ou qui l'a perdue au profit d'un plus récent — ne peut pas
   * écraser celle d'un autre. Best-effort : l'état de l'appel fait foi, et une
   * réservation restée en place se reprend au prochain `claim`.
   */
  async release(conversationId: string, callId: string): Promise<void> {
    try {
      const released = await this.prisma.conversation.updateMany({
        where: { id: conversationId, activeCallId: callId },
        data: { activeCallId: null },
      });
      if (released.count > 0) this.notifyChanged(conversationId, callId);
    } catch (error) {
      logger.error('Failed to release active-call claim', { conversationId, callId, error });
    }
  }

  /**
   * Reprise d'une réservation FUITÉE : quand le détenteur courant est terminé —
   * ou que la réservation a disparu entre notre échec et cette lecture — la
   * prendre par un seul compare-and-swap, pour qu'une réservation saine
   * concurrente ne soit jamais écrasée.
   */
  private async reclaimFromTerminalHolder(conversationId: string, newCallId: string): Promise<boolean> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { activeCallId: true },
    });
    const holderId = conversation?.activeCallId;

    if (!holderId) {
      const retry = await this.prisma.conversation.updateMany({
        where: { id: conversationId, OR: [{ activeCallId: null }, { activeCallId: { isSet: false } }] },
        data: { activeCallId: newCallId },
      });
      return retry.count > 0;
    }

    const holder = await this.prisma.callSession.findUnique({ where: { id: holderId }, select: { status: true } });
    if (holder && this.liveStatuses.includes(holder.status)) return false;

    const swap = await this.prisma.conversation.updateMany({
      where: { id: conversationId, activeCallId: holderId },
      data: { activeCallId: newCallId },
    });
    if (swap.count === 0) return false;
    logger.warn('⚠️ Active-call claim self-healed from terminal holder', {
      conversationId,
      staleHolderCallId: holderId,
      newCallId,
    });
    return true;
  }
}
