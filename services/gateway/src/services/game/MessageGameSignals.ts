/**
 * LES SIGNAUX D'UN MESSAGE (#9375, #9377, #9635) — ce que le jeu observe à l'ÉCRITURE d'un message, une fois
 * qu'il est committé :
 *
 *  - « message dans une conversation distincte » (`reply-distinct-conversations`, nom historique) — TOUT message
 *    compté, clé = la conversation : « écrire dans N conversations » ne demande plus de citer ;
 *  - « réponse à une story » — le message cite une story (`storyReplyToId`) ;
 *  - « échange avec quelqu'un d'une autre langue » — conversation à deux, langue principale du pair différente
 *    de celle de l'expéditeur ; clé = le pair ;
 *  - « message dans une autre langue » et « réponse dans la langue de l'autre » — la langue est celle que le
 *    SERVEUR établit (`serverLanguage.ts`), jamais la seule déclaration du client ; la détection ne part que si
 *    le compte attend l'un de ces signaux (mission du jour ou duo), et échoue fermée ;
 *  - « réponse reçue d'un auteur distinct » — signal de l'AUTEUR cité, clé = le répondant ;
 *  - l'ATLAS des langues (#9388) : la langue du message est ENVOYÉE pour l'expéditeur, REÇUE pour ses
 *    destinataires — voir `AtlasService` ;
 *  - **+3 points à l'auteur répondu**, une fois par message d'origine, si la réponse tombe dans l'heure, d'un
 *    autre compte de plus de 24 h et non bloqué, et au plus `REPLY_RECEIVED_DAILY_CAP` fois par jour civil.
 *
 * Les faits de l'expéditeur ne partent que s'il les attend aujourd'hui (une lecture indexée de ses missions du
 * jour et de son duo actif) : un message ordinaire ne paie ni détection de langue ni lecture de pair.
 *
 * **Une conversation chiffrée de bout en bout ne nourrit AUCUN signal de langue** (conformité E-3, #9224) : ni
 * les défis de langue, ni l'Atlas. Le serveur n'y voit pas le texte.
 *
 * Aucune règle n'est réécrite ici : les barèmes et la décision d'éligibilité viennent de `GameAbuseGuard`, les
 * paliers de `MissionService`. Chaque branche est isolée — l'échec d'un signal ne retient pas les autres, et
 * rien de tout cela ne remonte jamais au chemin d'envoi d'un message.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { REPLY_RECEIVED_DAILY_CAP } from '@meeshy/shared/utils/game/boosts';
import { civilDayInTimezone } from '../engagement/civilDay';
import { CONVERSATION_ENGAGEMENT_SELECT, dayCountsFor } from '../engagement/ConversationEngagementRecorder';
import { EngagementQuotas, dayBucket } from '../engagement/EngagementQuotas';
import { AtlasService } from './AtlasService';
import { GameAbuseGuard, quarterPoints, type MessageVerdict } from './GameAbuseGuard';
import { GAME_BONUS_AXIS, type MissionService } from './MissionService';
import { addDays } from '@meeshy/shared/utils/game/day-prng';
import type { MissionFactSignal } from '@meeshy/shared/utils/game/missions';
import { dayKeyOf } from './gameClock';
import { baseLanguage, translatorLanguageDetector, type LanguageDetector } from './serverLanguage';
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
  /** Le texte du message : la langue que le serveur établit se lit dessus. */
  readonly content?: string;
  /** La story citée (#9635 « répondre à une story »). */
  readonly storyReplyToId?: string | null;
  readonly now?: Date;
};

export type MessageGameSignalsDeps = {
  readonly missions: Pick<MissionService, 'onSignal'>;
  readonly creditPoints: (userId: string, points: number, axisKey: typeof GAME_BONUS_AXIS) => Promise<void>;
  readonly guard?: GameAbuseGuard;
  readonly atlas?: Pick<AtlasService, 'recordMessage' | 'conversationIsEncrypted'>;
  readonly detectLanguage?: LanguageDetector;
};

const LANGUAGE_FACTS: readonly MissionFactSignal[] = ['foreign-language-message', 'reply-in-their-language'];
const NOT_COMPLETED = { OR: [{ completedAt: null }, { completedAt: { isSet: false } }] };

export class MessageGameSignals {
  private readonly guard: GameAbuseGuard;

  private readonly quotas: EngagementQuotas;

  private readonly atlas: NonNullable<MessageGameSignalsDeps['atlas']>;

  private readonly detectLanguage: LanguageDetector;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly deps: MessageGameSignalsDeps,
  ) {
    this.guard = deps.guard ?? new GameAbuseGuard(prisma);
    this.quotas = new EngagementQuotas(prisma);
    this.atlas = deps.atlas ?? new AtlasService(prisma);
    this.detectLanguage = deps.detectLanguage ?? translatorLanguageDetector;
  }

  async record(input: MessageSignalInput): Promise<void> {
    const now = input.now ?? new Date();
    const sender = await this.prisma.user
      .findUnique({ where: { id: input.senderUserId }, select: { systemLanguage: true, timezone: true } })
      .catch(() => null);
    // Ce que vaut CE message dans sa conversation — la MÊME garde que ses points :
    // à soi seul, à un compte neuf ou bloqué, il ne fait avancer aucune mission
    // ni ne paie la réponse reçue ; au-delà de 50 par jour à deux, ÷ 4.
    const verdict = await this.messageVerdict(input, sender?.timezone ?? null, now);
    if (verdict === 'none') return;
    const encrypted = await this.atlas.conversationIsEncrypted(input.conversationId);
    await this.isolated('sender signals', () => this.senderSignals(input, sender, now, encrypted));
    if (!encrypted) {
      await this.isolated('atlas', async () => {
        await this.atlas.recordMessage({
          senderUserId: input.senderUserId,
          conversationId: input.conversationId,
          originalLanguage: input.originalLanguage,
          now,
        });
      });
    }
    if (input.replyToId !== null && input.quotedAuthorUserId !== null) {
      await this.isolated('reply received', () => this.replyReceived(input, input.quotedAuthorUserId as string, verdict, now));
    }
  }

  /** Les messages déjà crédités aujourd'hui dans la conversation, puis la garde d'entre-soi. */
  private async messageVerdict(input: MessageSignalInput, timezone: string | null, now: Date): Promise<MessageVerdict> {
    const row = await this.prisma.conversationEngagement
      .findUnique({
        where: { userId_conversationId: { userId: input.senderUserId, conversationId: input.conversationId } },
        select: CONVERSATION_ENGAGEMENT_SELECT,
      })
      .catch(() => null);
    const counts = dayCountsFor(row, civilDayInTimezone(now, timezone));
    return this.guard.assessMessage({
      userId: input.senderUserId,
      conversationId: input.conversationId,
      operationKey: 'content.text_message',
      dailyMessages: (counts['content.text_message'] ?? 0) + (counts['content.audio_message'] ?? 0),
      now,
    });
  }

  private async isolated(label: string, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (error) {
      log.warn(`game signal failed: ${label}`, { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /** Les faits que le compte attend aujourd'hui : ses missions du jour pas encore faites, et son duo actif. */
  private async pendingFacts(userId: string, dayKey: string): Promise<ReadonlySet<string>> {
    const [missions, duo] = await Promise.all([
      this.prisma.dailyMission.findMany({
        where: { userId, dayKey: { gte: addDays(dayKey, -1) }, ...NOT_COMPLETED },
        select: { signal: true },
        take: 8,
      }),
      this.prisma.gameDuo.findFirst({
        where: { status: 'active', OR: [{ inviterId: userId }, { inviteeId: userId }] },
        select: { signal: true },
      }),
    ]);
    return new Set([...missions.map((m) => m.signal), ...(duo?.signal ? [duo.signal] : [])]);
  }

  /** Le seul autre membre inscrit d'une conversation à deux, `null` sinon. */
  private async onlyPeer(conversationId: string, senderUserId: string): Promise<string | null> {
    const members = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true },
      select: { userId: true },
      take: 3,
    });
    const others = members.map((m) => m.userId).filter((id): id is string => typeof id === 'string' && id !== senderUserId);
    return members.length === 2 && others.length === 1 ? others[0]! : null;
  }

  private async systemLanguageOf(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { systemLanguage: true } });
    return baseLanguage(user?.systemLanguage);
  }

  private async senderSignals(
    input: MessageSignalInput,
    sender: { readonly systemLanguage: string | null; readonly timezone: string | null } | null,
    now: Date,
    encrypted: boolean,
  ): Promise<void> {
    const dayKey = dayKeyOf(now, sender?.timezone);
    const common = { now, dayKey, timezone: sender?.timezone ?? null };
    const emit = (signal: MissionFactSignal, key?: string) =>
      this.deps.missions.onSignal(input.senderUserId, signal, key === undefined ? common : { ...common, key });

    await emit('reply-distinct-conversations', input.conversationId);

    const pending = await this.pendingFacts(input.senderUserId, dayKey);
    if (input.storyReplyToId && pending.has('story-reply')) await emit('story-reply', input.storyReplyToId);
    if (encrypted) return;

    const own = baseLanguage(sender?.systemLanguage);
    if (pending.has('cross-language-exchange') && own !== '') {
      const peer = await this.onlyPeer(input.conversationId, input.senderUserId);
      if (peer !== null) {
        const theirs = await this.systemLanguageOf(peer);
        if (theirs !== '' && theirs !== own) await emit('cross-language-exchange', peer);
      }
    }

    if (own === '' || !LANGUAGE_FACTS.some((signal) => pending.has(signal)) || !input.content) return;
    const written = await this.detectLanguage(input.content);
    if (written === null || written === own) return;
    if (pending.has('foreign-language-message')) await emit('foreign-language-message');
    const quoted = input.quotedAuthorUserId;
    if (pending.has('reply-in-their-language') && input.replyToId !== null && quoted !== null && quoted !== input.senderUserId) {
      if ((await this.systemLanguageOf(quoted)) === written) await emit('reply-in-their-language', input.messageId);
    }
  }

  private async replyReceived(input: MessageSignalInput, authorId: string, worth: MessageVerdict, now: Date): Promise<void> {
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
    // Puis le plafond du JOUR de l'auteur : un seau de message déjà pris ne
    // consomme jamais une place du jour.
    const author = await this.prisma.user.findUnique({ where: { id: authorId }, select: { timezone: true } });
    const day = dayBucket(civilDayInTimezone(now, author?.timezone ?? null));
    if (!(await this.quotas.claim(authorId, QUOTA_OPERATION, day, REPLY_RECEIVED_DAILY_CAP))) return;
    await this.deps.creditPoints(
      authorId,
      worth === 'quarter' ? quarterPoints(REPLY_RECEIVED_POINTS) : REPLY_RECEIVED_POINTS,
      GAME_BONUS_AXIS,
    );
  }
}
