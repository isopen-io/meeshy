import { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { withOrphanedSenderRepair } from './messaging/withOrphanedSenderRepair';
import {
  aggregateMessageStatsUnderFloor,
  countCharacters,
  countWords,
  foldMessageStats,
  FOLDABLE_MESSAGE_SELECT,
  pruneDailyActivity,
  shapeMessageStats,
  type FoldableMessage,
  type ParticipantStatEntry,
} from './conversations/messageStatsAggregate';

interface CacheEntry {
  data: Record<string, unknown>;
  expiresAt: number;
}

// Maps an attachment token (derived from a message's MIME types) to its
// conversation-level counter. Location is NOT here: it is a `messageType`,
// never an attachment token, so it is counted by `messageType === 'location'`
// on both the incremental path AND recompute() — see isLocationMessageStat.
const ATTACHMENT_TYPE_FIELDS: Record<string, string> = {
  image: 'imageCount',
  audio: 'audioCount',
  video: 'videoCount',
  file: 'fileCount',
};

// A message counts as "text" for stats iff it has no attachments AND its
// messageType is 'text'. This mirrors the authoritative recompute()
// (`msgType === 'text' && attachments.length === 0`) EXACTLY; the incremental
// path MUST use the same rule or the two diverge. Content emptiness is
// deliberately NOT checked: recompute counts a blank-content text message
// (e.g. a whitespace-only `' '`, which the gateway's `min(1)` schema allows),
// so adding a `content.trim()` gate here would undercount contentTypes.text
// incrementally and let it jump up on the next periodic recompute.
function isTextMessageStat(
  attachmentTypes: string[],
  messageType?: string,
): boolean {
  return attachmentTypes.length === 0 && (messageType || 'text') === 'text';
}

// A message counts as "location" for stats iff its messageType is 'location'.
// Location is a messageType dimension (like 'text'/'system'), NOT an attachment
// token, so the incremental path MUST count it by messageType — exactly like
// the authoritative recompute() (`msgType === 'location'`) — or locationCount
// silently stays frozen at its seed value forever (no periodic recompute).
function isLocationMessageStat(messageType?: string): boolean {
  return messageType === 'location';
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHour(): string {
  return String(new Date().getUTCHours());
}

export class ConversationMessageStatsService {
  private static instance: ConversationMessageStatsService | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  /**
   * Les agrégats PLANCHÉISÉS, dans un seau à part — `conversationId` puis
   * plancher (#17076).
   *
   * **Deux niveaux, et c'est ce qui garde `invalidate` en O(1).** Une clé
   * composite dans la carte d'origine aurait obligé chaque nouveau message à
   * balayer la carte pour trouver ses variantes ; un seau par conversation
   * s'efface d'un `delete`, donc un lecteur planchéisé n'est jamais plus
   * périmé qu'un lecteur ordinaire.
   *
   * **Et le seau ne peut pas servir une fenêtre pour une autre** : la clé EST
   * le plancher. Mettre un agrégat planchéisé dans la carte d'origine l'aurait
   * servi à toute la conversation — la fuite inverse de celle qu'on ferme.
   */
  private readonly flooredCache = new Map<string, Map<string, CacheEntry>>();
  private readonly ttlMs = 5 * 60 * 1000;

  private constructor() {}

  static getInstance(): ConversationMessageStatsService {
    if (!this.instance) {
      this.instance = new ConversationMessageStatsService();
    }
    return this.instance;
  }

  invalidate(conversationId: string): void {
    this.cache.delete(conversationId);
    this.flooredCache.delete(conversationId);
  }

  private isValid(entry?: CacheEntry | null): entry is CacheEntry {
    return !!entry && Date.now() < entry.expiresAt;
  }

  private setCache(conversationId: string, data: Record<string, unknown>): void {
    this.cache.set(conversationId, { data, expiresAt: Date.now() + this.ttlMs });
  }

  // NOTE: scalar counters (totalMessages, totalWords, attachment counts, …) are
  // written with atomic { increment } / { decrement } across onNewMessage /
  // onMessageEdited / onMessageDeleted so concurrent edits/deletes never clobber
  // one another (no lost update). The DB-level Math.max(0, …) floor is intentionally
  // dropped in favour of atomicity: balanced operations never go negative, and any
  // residual drift on the denormalized JSON fields (participantStats, dailyActivity,
  // …), which still use non-atomic read-modify-write, is corrected by periodic
  // recompute().
  async onNewMessage(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    content: string,
    attachmentTypes: string[],
    originalLanguage: string | null,
    messageType: string = 'text',
  ): Promise<void> {
    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!existing) {
      await this.recompute(prisma, conversationId);
      return;
    }

    const words = countWords(content);
    const chars = countCharacters(content);
    const day = todayKey();
    const hour = currentHour();
    const now = new Date().toISOString();

    const attachmentIncrements: Record<string, number> = {};
    for (const t of attachmentTypes) {
      const field = ATTACHMENT_TYPE_FIELDS[t];
      if (field) {
        attachmentIncrements[field] = (attachmentIncrements[field] || 0) + 1;
      }
    }

    const isTextMessage = isTextMessageStat(attachmentTypes, messageType);
    const isLocationMessage = isLocationMessageStat(messageType);

    const participantStats = (typeof existing.participantStats === 'string'
      ? JSON.parse(existing.participantStats)
      : existing.participantStats) as Record<string, ParticipantStatEntry>;

    const entry = participantStats[senderId] || {
      messageCount: 0,
      wordCount: 0,
      characterCount: 0,
      imageCount: 0,
      audioCount: 0,
      videoCount: 0,
      firstMessageAt: null,
      lastMessageAt: null,
    };

    entry.messageCount += 1;
    entry.wordCount += words;
    entry.characterCount += chars;
    for (const t of attachmentTypes) {
      if (t === 'image') entry.imageCount += 1;
      if (t === 'audio') entry.audioCount += 1;
      if (t === 'video') entry.videoCount += 1;
    }
    if (!entry.firstMessageAt) entry.firstMessageAt = now;
    entry.lastMessageAt = now;
    participantStats[senderId] = entry;

    const dailyActivity = (typeof existing.dailyActivity === 'string'
      ? JSON.parse(existing.dailyActivity)
      : existing.dailyActivity) as Record<string, number>;
    dailyActivity[day] = (dailyActivity[day] || 0) + 1;
    const prunedDaily = pruneDailyActivity(dailyActivity);

    const hourlyDistribution = (typeof existing.hourlyDistribution === 'string'
      ? JSON.parse(existing.hourlyDistribution)
      : existing.hourlyDistribution) as Record<string, number>;
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;

    const languageDistribution = (typeof existing.languageDistribution === 'string'
      ? JSON.parse(existing.languageDistribution)
      : existing.languageDistribution) as Record<string, number>;
    if (originalLanguage) {
      languageDistribution[originalLanguage] = (languageDistribution[originalLanguage] || 0) + 1;
    }

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: {
        totalMessages: { increment: 1 },
        totalWords: { increment: words },
        totalCharacters: { increment: chars },
        textMessages: isTextMessage ? { increment: 1 } : undefined,
        locationCount: isLocationMessage ? { increment: 1 } : undefined,
        ...Object.fromEntries(
          Object.entries(attachmentIncrements).map(([field, count]) => [field, { increment: count }]),
        ),
        participantStats: participantStats as unknown as Prisma.InputJsonValue,
        dailyActivity: prunedDaily as unknown as Prisma.InputJsonValue,
        hourlyDistribution: hourlyDistribution as unknown as Prisma.InputJsonValue,
        languageDistribution: languageDistribution as unknown as Prisma.InputJsonValue,
      },
    });

    this.invalidate(conversationId);
  }

  async onMessageEdited(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    oldContent: string,
    newContent: string,
  ): Promise<void> {
    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    // Pas de ligne, rien à corriger — et surtout PAS de `recompute()` ici.
    // C'est la position d'`onMessageDeleted`, et l'édition a encore moins de
    // raisons de s'en écarter : elle ne crée aucun message, donc l'absence de
    // ligne ne rend rien périmé. La ligne sera bâtie, exacte, à la première
    // lecture (`getStats` recalcule quand elle manque).
    //
    // La différence n'est pas théorique : `recompute()` balaie TOUS les
    // messages vivants de la conversation, et les quatre transports d'édition
    // l'attendent AVANT d'acquitter le client. Éditer un message dans une
    // longue conversation dont personne n'a jamais lu les statistiques aurait
    // bloqué l'accusé de réception derrière un scan complet. Le comptage à
    // l'envoi peut se le permettre — il est fire-and-forget, hors du chemin de
    // l'ACK ; l'ajustement d'édition, non.
    if (!existing) return;

    const oldWords = countWords(oldContent);
    const newWords = countWords(newContent);
    const oldChars = countCharacters(oldContent);
    const newChars = countCharacters(newContent);

    const wordDiff = newWords - oldWords;
    const charDiff = newChars - oldChars;

    const participantStats = (typeof existing.participantStats === 'string'
      ? JSON.parse(existing.participantStats)
      : existing.participantStats) as Record<string, ParticipantStatEntry>;

    const entry = participantStats[senderId];
    if (entry) {
      entry.wordCount = Math.max(0, entry.wordCount + wordDiff);
      entry.characterCount = Math.max(0, entry.characterCount + charDiff);
      participantStats[senderId] = entry;
    }

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: {
        totalWords: { increment: wordDiff },
        totalCharacters: { increment: charDiff },
        participantStats: participantStats as unknown as Prisma.InputJsonValue,
      },
    });

    this.invalidate(conversationId);
  }

  async onMessageDeleted(
    prisma: PrismaClient,
    conversationId: string,
    senderId: string,
    content: string,
    attachmentTypes: string[],
    messageType: string = 'text',
  ): Promise<void> {
    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!existing) return;

    const words = countWords(content);
    const chars = countCharacters(content);
    const isTextMessage = isTextMessageStat(attachmentTypes, messageType);
    const isLocationMessage = isLocationMessageStat(messageType);

    const decrements: Record<string, number> = {};
    for (const t of attachmentTypes) {
      const field = ATTACHMENT_TYPE_FIELDS[t];
      if (field) {
        decrements[field] = (decrements[field] || 0) + 1;
      }
    }

    const participantStats = (typeof existing.participantStats === 'string'
      ? JSON.parse(existing.participantStats)
      : existing.participantStats) as Record<string, ParticipantStatEntry>;

    const entry = participantStats[senderId];
    if (entry) {
      entry.messageCount = Math.max(0, entry.messageCount - 1);
      entry.wordCount = Math.max(0, entry.wordCount - words);
      entry.characterCount = Math.max(0, entry.characterCount - chars);
      for (const t of attachmentTypes) {
        if (t === 'image') entry.imageCount = Math.max(0, entry.imageCount - 1);
        if (t === 'audio') entry.audioCount = Math.max(0, entry.audioCount - 1);
        if (t === 'video') entry.videoCount = Math.max(0, entry.videoCount - 1);
      }
      participantStats[senderId] = entry;
    }

    const updateData: Record<string, unknown> = {
      totalMessages: { decrement: 1 },
      totalWords: { decrement: words },
      totalCharacters: { decrement: chars },
      participantStats: participantStats as unknown as Prisma.InputJsonValue,
    };

    if (isTextMessage) {
      updateData.textMessages = { decrement: 1 };
    }

    if (isLocationMessage) {
      updateData.locationCount = { decrement: 1 };
    }

    for (const [field, count] of Object.entries(decrements)) {
      updateData[field] = { decrement: count };
    }

    await prisma.conversationMessageStats.update({
      where: { conversationId },
      data: updateData,
    });

    this.invalidate(conversationId);
  }

  async getStats(prisma: PrismaClient, conversationId: string): Promise<Record<string, unknown>> {
    const cached = this.cache.get(conversationId);
    if (this.isValid(cached)) {
      return cached.data;
    }

    const row = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!row) {
      const recomputed = await this.recompute(prisma, conversationId);
      return this.shapeResponse(recomputed);
    }

    const shaped = this.shapeResponse(row);
    this.setCache(conversationId, shaped);
    return shaped;
  }

  /**
   * L'agrégat d'un lecteur à PLANCHER (#17076) — la même charge, bornée à sa
   * fenêtre de lecture.
   *
   * Il ne passe NI par la ligne `ConversationMessageStats`, NI par
   * `recompute()`, et les deux refus sont du même ordre : la ligne agrège
   * l'avant-plancher, et l'`upsert` de `recompute` remplacerait la ligne de
   * TOUS par la fenêtre d'UN seul. Le pli est partagé ; l'écriture, non.
   *
   * Ce que ça coûte, et c'est écrit parce que ça se décide : une lecture par
   * requête sur la fenêtre du lecteur, là où un lecteur sans plancher ne paie
   * qu'un `findUnique`. La fenêtre d'un lecteur planchéisé est par construction
   * celle que `GET …/messages` lui sert déjà — on ne lit donc rien de plus que
   * ce qu'il a le droit de lire — et le seau de cache ci-dessus la garde cinq
   * minutes, comme celui de tout le monde.
   */
  async getStatsUnderFloor(
    prisma: PrismaClient,
    conversationId: string,
    floor: Date,
  ): Promise<Record<string, unknown>> {
    const floorKey = floor.toISOString();
    const bucket = this.flooredCache.get(conversationId);
    const cached = bucket?.get(floorKey);
    if (this.isValid(cached)) {
      return cached.data;
    }

    const shaped = await aggregateMessageStatsUnderFloor(prisma, conversationId, floor);

    const target = bucket ?? new Map<string, CacheEntry>();
    target.set(floorKey, { data: shaped, expiresAt: Date.now() + this.ttlMs });
    this.flooredCache.set(conversationId, target);
    return shaped;
  }

  /**
   * Le recalcul autoritatif, mais SEULEMENT pour une conversation dont les
   * compteurs existent déjà.
   *
   * Le balayage des messages vides (`MaintenanceService`) est le quatrième
   * écrivain de `deletedAt`, et le seul en LOT : il ne tient de ses messages
   * que leur id et leur conversation, jamais le contenu ni l'auteur qu'un
   * décrément demande. Recalculer une fois par conversation touchée est à la
   * fois le seul geste possible et le plus juste — c'est aussi ce qui répare
   * la dérive déjà accumulée.
   *
   * La garde d'existence est ce qui empêche le balayage de FABRIQUER des lignes
   * de statistiques pour des conversations dont personne n'a jamais demandé
   * les compteurs : `recompute()` fait un `upsert`, et un balayage nocturne ne
   * doit pas se mettre à peupler une collection à la place des lecteurs.
   */
  async recomputeIfTracked(prisma: PrismaClient, conversationId: string): Promise<void> {
    const existing = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });
    if (!existing) return;
    await this.recompute(prisma, conversationId);
  }

  async recompute(prisma: PrismaClient, conversationId: string): Promise<Record<string, unknown>> {
    const messages = await withOrphanedSenderRepair({ prisma, conversationIds: [conversationId] }, () => prisma.message.findMany({
      where: { conversationId, deletedAt: null },
      select: FOLDABLE_MESSAGE_SELECT,
    }));

    // Le PLI est partagé avec la fenêtre planchéisée (#17076) : c'est lui qui
    // définit ce que chaque compteur veut dire, et la fenêtre de 90 jours de
    // `dailyActivity` en fait partie. Ce chemin-ci est le seul qui ÉCRIT.
    const folded = foldMessageStats(messages as unknown as readonly FoldableMessage[]);

    const columns = {
      totalMessages: folded.totalMessages,
      totalWords: folded.totalWords,
      totalCharacters: folded.totalCharacters,
      textMessages: folded.textMessages,
      imageCount: folded.imageCount,
      audioCount: folded.audioCount,
      videoCount: folded.videoCount,
      fileCount: folded.fileCount,
      locationCount: folded.locationCount,
      participantStats: folded.participantStats as unknown as Prisma.InputJsonValue,
      dailyActivity: folded.dailyActivity as unknown as Prisma.InputJsonValue,
      hourlyDistribution: folded.hourlyDistribution as unknown as Prisma.InputJsonValue,
      languageDistribution: folded.languageDistribution as unknown as Prisma.InputJsonValue,
    };

    const row = await prisma.conversationMessageStats.upsert({
      where: { conversationId },
      create: { conversationId, ...columns },
      update: columns,
    });

    const shaped = this.shapeResponse(row);
    this.setCache(conversationId, shaped);
    return shaped;
  }

  private shapeResponse(row: Record<string, unknown>): Record<string, unknown> {
    return shapeMessageStats(row);
  }

}


/**
 * La clé sous laquelle un message est crédité puis débité dans
 * `participantStats` : l'utilisateur enregistré quand il y en a un, sinon le
 * `Participant` anonyme. C'est la règle de `recompute()` (`msg.sender?.userId
 * || msg.senderId`), nommée pour que les chemins incrémentaux ne puissent plus
 * en écrire une variante — créditer l'utilisateur et débiter son Participant
 * laisserait deux entrées, l'une gonflée, l'autre au plancher.
 */
export function statsAuthorKey(senderId: string, senderUserId?: string | null): string {
  return senderUserId || senderId;
}

export const conversationMessageStatsService = ConversationMessageStatsService.getInstance();
