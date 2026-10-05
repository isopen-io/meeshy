/**
 * LES GARDE-FOUS CONTRE L'ENTRE-SOI (#9377) — le jeu ne doit pas pousser au
 * spam : il récompense l'échange réel.
 *
 *  - **rien** pour un message à soi, à un compte de moins de 24 h, ou bloqué ;
 *  - **points ÷ 4** au-delà de 50 messages par jour entre deux mêmes comptes
 *    seuls (une conversation à deux, ni plus ni moins) ;
 *  - une réponse reçue ne rapporte rien non plus venant de soi, d'un compte de
 *    moins de 24 h ou bloqué.
 *
 * Deux propriétés d'exploitation :
 *  - **fail-open** — une panne de lecture ne coûte JAMAIS de points : le jeu
 *    est un bonus, il ne refuse pas un geste sur une incertitude ;
 *  - **mémoire bornée** — la forme d'une conversation (soi seul, deux comptes,
 *    groupe) se garde 5 minutes par (compte, conversation) : le geste le plus
 *    fréquent du produit (envoyer un message) ne paie pas une lecture chacun.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'GameAbuseGuard' });

export const MESSAGES_PER_PAIR_PER_DAY = 50;
export const REPLY_BONUS_WINDOW_MS = 60 * 60 * 1000;
export const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 5000;

/** Les axes qui sont des MESSAGES — les seuls que ces gardes jugent. */
const MESSAGE_OPERATIONS: ReadonlySet<string> = new Set(['content.text_message', 'content.audio_message']);

/** Points au-delà du plafond d'entre-soi : divisés par 4, jamais zéro. */
export const quarterPoints = (points: number): number => Math.max(1, Math.round(points / 4));

/** `none` : rien ; `quarter` : points ÷ 4 ; `full` : points entiers. */
export type MessageVerdict = 'none' | 'quarter' | 'full';

type Shape = { readonly kind: 'self' | 'blocked-or-fresh' | 'pair' | 'group'; readonly expiresAt: number };

export class GameAbuseGuard {
  private readonly shapes = new Map<string, Shape>();

  constructor(private readonly prisma: PrismaClient) {}

  private async accountsAllowed(a: string, b: string, now: Date): Promise<{ readonly fresh: boolean; readonly blocked: boolean }> {
    const accounts = await this.prisma.user.findMany({
      where: { id: { in: [a, b] } },
      select: { id: true, createdAt: true, blockedUserIds: true },
    });
    const left = accounts.find((u) => u.id === a);
    const right = accounts.find((u) => u.id === b);
    return {
      fresh: now.getTime() - (right?.createdAt?.getTime() ?? 0) < MIN_ACCOUNT_AGE_MS,
      blocked: Boolean(left?.blockedUserIds?.includes(b) || right?.blockedUserIds?.includes(a)),
    };
  }

  private async shapeOf(userId: string, conversationId: string, now: Date): Promise<Shape['kind']> {
    const key = `${userId}:${conversationId}`;
    const cached = this.shapes.get(key);
    if (cached && cached.expiresAt > now.getTime()) return cached.kind;

    const participants = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { userId: true },
      take: 3,
    });
    let kind: Shape['kind'];
    if (participants.length <= 1) kind = 'self';
    else if (participants.length > 2) kind = 'group';
    else {
      const peer = participants.map((p) => p.userId).find((id): id is string => typeof id === 'string' && id !== userId);
      if (peer === undefined) kind = 'pair';
      else {
        const verdict = await this.accountsAllowed(userId, peer, now);
        kind = verdict.fresh || verdict.blocked ? 'blocked-or-fresh' : 'pair';
      }
    }

    if (this.shapes.size >= CACHE_MAX_ENTRIES) {
      for (const [k, v] of this.shapes) if (v.expiresAt <= now.getTime()) this.shapes.delete(k);
      if (this.shapes.size >= CACHE_MAX_ENTRIES) this.shapes.clear();
    }
    this.shapes.set(key, { kind, expiresAt: now.getTime() + CACHE_TTL_MS });
    return kind;
  }

  /**
   * Ce que vaut CE message : entier, divisé par 4, ou rien.
   * `dailyMessages` : les messages déjà crédités aujourd'hui dans la conversation.
   */
  async assessMessage(params: {
    readonly userId: string;
    readonly conversationId: string;
    readonly operationKey: string;
    readonly dailyMessages: number;
    readonly now?: Date;
  }): Promise<MessageVerdict> {
    if (!MESSAGE_OPERATIONS.has(params.operationKey)) return 'full';
    try {
      const kind = await this.shapeOf(params.userId, params.conversationId, params.now ?? new Date());
      if (kind === 'self' || kind === 'blocked-or-fresh') return 'none';
      if (kind === 'pair' && params.dailyMessages >= MESSAGES_PER_PAIR_PER_DAY) return 'quarter';
      return 'full';
    } catch (error) {
      log.warn('message assessment unavailable, counted in full', { error: error instanceof Error ? error.message : String(error) });
      return 'full';
    }
  }

  /**
   * Une réponse reçue par `authorId` de `replierId` : éligible aux missions si
   * c'est une autre personne, un compte de plus de 24 h, aucun blocage ;
   * `withinWindow` dit si elle tombe dans l'heure du message d'origine (+3 points).
   */
  async assessReply(params: {
    readonly replierId: string;
    readonly authorId: string;
    readonly originalCreatedAt: Date;
    readonly now?: Date;
  }): Promise<{ readonly eligible: boolean; readonly withinWindow: boolean }> {
    const now = params.now ?? new Date();
    if (params.replierId === params.authorId) return { eligible: false, withinWindow: false };
    // Les comptes se lisent côté répondant : c'est lui dont l'ancienneté compte
    // (un faux compte qui répond pour faire gagner son auteur).
    const verdict = await this.accountsAllowed(params.authorId, params.replierId, now);
    if (verdict.fresh || verdict.blocked) return { eligible: false, withinWindow: false };
    return {
      eligible: true,
      withinWindow: now.getTime() - params.originalCreatedAt.getTime() <= REPLY_BONUS_WINDOW_MS,
    };
  }
}
