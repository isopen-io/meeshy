/**
 * LES SIGNAUX D'UN MESSAGE (#9375, #9377) — ce que le jeu observe à l'ÉCRITURE
 * d'un message, une fois qu'il est committé :
 *
 *  - « réponse dans une conversation distincte » — le message répond à un autre
 *    compte ; la clé est la conversation (une fois par conversation et par jour) ;
 *  - « message dans une autre langue » — la langue détectée diffère de la
 *    langue système de l'expéditeur (variantes régionales confondues) : c'est le
 *    fait du Prisme que les missions linguistiques attendent ;
 *  - « réponse reçue d'un auteur distinct » — signal de l'AUTEUR répondu, clé = le
 *    répondant ;
 *  - **+3 points à l'auteur répondu**, une fois par message d'origine, si la
 *    réponse tombe dans l'heure, d'un autre compte de plus de 24 h et non bloqué.
 *
 * Aucune règle n'est réécrite ici : les barèmes et la décision d'éligibilité
 * viennent de `GameAbuseGuard`, les paliers de `MissionService`. Chaque branche
 * est isolée — l'échec d'un signal ne retient pas les autres, et rien de tout
 * cela ne remonte jamais au chemin d'envoi d'un message.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { EngagementQuotas } from '../engagement/EngagementQuotas';
import { GameAbuseGuard } from './GameAbuseGuard';
import { GAME_BONUS_AXIS, type MissionService } from './MissionService';
import { dayKeyOf } from './gameClock';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'MessageGameSignals' });

/** Les points que rapporte une réponse reçue dans l'heure. */
export const REPLY_RECEIVED_POINTS = 3;

const QUOTA_OPERATION = 'game.reply_received';

export type MessageSignalInput = {
  readonly senderUserId: string;
  readonly conversationId: string;
  readonly messageId: string;
  readonly replyToId: string | null;
  /** L'auteur du message auquel on répond (`Participant.userId`, `null` pour un anonyme). */
  readonly quotedAuthorUserId: string | null;
  readonly originalLanguage: string;
  readonly now?: Date;
};

export type MessageGameSignalsDeps = {
  readonly missions: Pick<MissionService, 'onSignal'>;
  readonly creditPoints: (userId: string, points: number, axisKey: typeof GAME_BONUS_AXIS) => Promise<void>;
  readonly guard?: GameAbuseGuard;
};

const baseLanguage = (code: string): string => code.trim().toLowerCase().split(/[-_]/)[0] ?? '';

/** Une langue détectée utilisable : jamais vide, jamais le marqueur d'incertitude. */
const isKnownLanguage = (code: string): boolean => {
  const base = baseLanguage(code);
  return base.length > 0 && base !== 'unknown' && base !== 'auto' && base !== 'und';
};

export class MessageGameSignals {
  private readonly guard: GameAbuseGuard;

  private readonly quotas: EngagementQuotas;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: MessageGameSignalsDeps,
  ) {
    this.guard = deps.guard ?? new GameAbuseGuard(prisma);
    this.quotas = new EngagementQuotas(prisma);
  }

  async record(input: MessageSignalInput): Promise<void> {
    const now = input.now ?? new Date();
    await this.isolated('sender signals', () => this.senderSignals(input, now));
    if (input.replyToId !== null && input.quotedAuthorUserId !== null) {
      await this.isolated('reply received', () => this.replyReceived(input, input.quotedAuthorUserId as string, now));
    }
  }

  private async isolated(label: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      log.warn(`game signal failed: ${label}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private async senderSignals(input: MessageSignalInput, now: Date): Promise<void> {
    const sender = await this.prisma.user.findUnique({
      where: { id: input.senderUserId },
      select: { systemLanguage: true, timezone: true },
    });
    const dayKey = dayKeyOf(now, sender?.timezone);
    const common = { now, dayKey, timezone: sender?.timezone ?? null };

    const isReplyToSomeoneElse = input.replyToId !== null && input.quotedAuthorUserId !== null && input.quotedAuthorUserId !== input.senderUserId;
    if (isReplyToSomeoneElse) {
      await this.deps.missions.onSignal(input.senderUserId, 'reply-distinct-conversations', { ...common, key: input.conversationId });
    }

    const systemLanguage = sender?.systemLanguage;
    if (systemLanguage && isKnownLanguage(input.originalLanguage) && baseLanguage(input.originalLanguage) !== baseLanguage(systemLanguage)) {
      await this.deps.missions.onSignal(input.senderUserId, 'foreign-language-message', common);
    }
  }

  private async replyReceived(input: MessageSignalInput, authorId: string, now: Date): Promise<void> {
    const original = await this.prisma.message.findUnique({
      where: { id: input.replyToId as string },
      select: { createdAt: true },
    });
    if (!original) return;

    const verdict = await this.guard.assessReply({
      replierId: input.senderUserId,
      authorId,
      originalCreatedAt: original.createdAt,
      now,
    });
    if (!verdict.eligible) return;

    await this.deps.missions.onSignal(authorId, 'replies-received-distinct-authors', { now, key: input.senderUserId });

    if (!verdict.withinWindow) return;
    // UNE fois par message d'origine : le seau tranche, jamais une relecture.
    if (!(await this.quotas.claim(authorId, QUOTA_OPERATION, `message:${input.replyToId}`, 1))) return;
    await this.deps.creditPoints(authorId, REPLY_RECEIVED_POINTS, GAME_BONUS_AXIS);
  }
}
