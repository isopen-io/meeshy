/**
 * Poser et retirer l'étoile PERSONNELLE d'un lecteur sur un message (#7377).
 *
 * POSER juge le droit de lire à la participation COURANTE (règle 1) et le
 * verdict du message (règle 2) — `starredMessageVerdict.ts`, le même que la
 * liste. RETIRER ne juge rien : l'appelant ne touche que SA ligne, adressée
 * par `(userId, messageId)`, et on peut toujours défaire ce qu'on a fait
 * (même lecture que `routes/posts/bookmarks.ts`).
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { unsetOrNull } from '../../../utils/prisma-unset';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloor } from '../../historyFloor';
import { loadPersonalHistoryHiding } from '../../personalHistoryFilter';
import { readableByReader, starredMessageVerdict } from './starredMessageVerdict';

/** Ce que la pose rend — la route en dérive le statut, jamais l'inverse. */
export type StarOutcome =
  | { readonly kind: 'starred'; readonly messageId: string; readonly conversationId: string; readonly starredAt: Date }
  | { readonly kind: 'not-found' }
  | { readonly kind: 'not-starrable' };

/** Ce que le retrait rend — `removed: null` quand il n'y avait rien à retirer. */
export type UnstarOutcome = { readonly removed: { readonly conversationId: string } | null };

const NOT_FOUND: StarOutcome = { kind: 'not-found' };
const NOT_STARRABLE: StarOutcome = { kind: 'not-starrable' };

/** Seules les colonnes du verdict et de la participation — aucun contenu. */
const STAR_ADMISSION_MESSAGE_SELECT = {
  id: true,
  conversationId: true,
  messageType: true,
  createdAt: true,
  deletedAt: true,
  expiresAt: true,
  isViewOnce: true,
  isBlurred: true,
  isEncrypted: true,
  effectFlags: true,
} as const;

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002';
}

export class MessageStarWriter {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async star(userId: string, messageId: string): Promise<StarOutcome> {
    const message = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: STAR_ADMISSION_MESSAGE_SELECT,
    });
    if (!message) return NOT_FOUND;

    // La participation AVANT le verdict : un 409 « vue unique » dirait à un
    // non-participant qu'un tel message existe dans une conversation qui lui
    // est fermée. Tous les refus qui précèdent sont donc un même 404.
    const participation = await this.prisma.participant.findFirst({
      where: { conversationId: message.conversationId, userId, isActive: true, ...unsetOrNull('bannedAt') },
      select: HISTORY_FLOOR_PARTICIPANT_SELECT,
    });
    if (!participation) return NOT_FOUND;

    const verdict = starredMessageVerdict(message, this.now());
    if (verdict === 'gone') return NOT_FOUND;

    const [floor, hiding] = await Promise.all([
      loadHistoryFloor(this.prisma, participation),
      loadPersonalHistoryHiding(this.prisma, { userId, conversationId: message.conversationId }),
    ]);
    if (!readableByReader(message, { floor, hiding })) return NOT_FOUND;
    if (verdict === 'view-once') return NOT_STARRABLE;

    const star = await this.placeStar(userId, message.id, message.conversationId);
    return { kind: 'starred', messageId: message.id, conversationId: star.conversationId, starredAt: star.createdAt };
  }

  async unstar(userId: string, messageId: string): Promise<UnstarOutcome> {
    const existing = await this.prisma.messageStar.findUnique({
      where: { userId_messageId: { userId, messageId } },
      select: { conversationId: true },
    });
    if (!existing) return { removed: null };

    // `deleteMany`, jamais `delete` : un retrait concurrent (deux appareils)
    // ne doit pas lever. Seul ce qui a RÉELLEMENT été retiré est annoncé.
    const { count } = await this.prisma.messageStar.deleteMany({ where: { userId, messageId } });
    return { removed: count > 0 ? { conversationId: existing.conversationId } : null };
  }

  /**
   * Créer, et relire sur une violation d'unicité — jamais un `upsert` : reposer
   * une étoile ne doit pas déplacer sa date, qui ordonne la liste.
   */
  private async placeStar(
    userId: string,
    messageId: string,
    conversationId: string,
  ): Promise<{ readonly conversationId: string; readonly createdAt: Date }> {
    try {
      return await this.prisma.messageStar.create({
        data: { userId, messageId, conversationId },
        select: { conversationId: true, createdAt: true },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.prisma.messageStar.findUnique({
        where: { userId_messageId: { userId, messageId } },
        select: { conversationId: true, createdAt: true },
      });
      if (!existing) throw error;
      return existing;
    }
  }
}
