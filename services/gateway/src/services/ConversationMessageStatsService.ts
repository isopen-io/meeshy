import { Prisma, PrismaClient } from '@meeshy/shared/prisma/client';
import { withOrphanedSenderRepair } from './messaging/withOrphanedSenderRepair';
import { applyPersonalHistoryHiding, NO_PERSONAL_HIDING, type PersonalHistoryHiding } from './personalHistoryFilter';

interface ParticipantStatEntry {
  messageCount: number;
  wordCount: number;
  characterCount: number;
  imageCount: number;
  audioCount: number;
  videoCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

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

function countWords(content: string): number {
  if (!content || !content.trim()) return 0;
  return content.trim().split(/\s+/).length;
}

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

function countCharacters(content: string): number {
  return content ? content.length : 0;
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentHour(): string {
  return String(new Date().getUTCHours());
}

function pruneDailyActivity(daily: Record<string, number>): Record<string, number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 90);
  const cutoffKey = cutoff.toISOString().slice(0, 10);

  const pruned: Record<string, number> = {};
  for (const [key, value] of Object.entries(daily)) {
    if (key >= cutoffKey) {
      pruned[key] = value;
    }
  }
  return pruned;
}

/** Ce qu'une passe d'agrégation produit — la forme des colonnes de la ligne. */
type AggregatedCounters = {
  totalMessages: number;
  totalWords: number;
  totalCharacters: number;
  textMessages: number;
  imageCount: number;
  audioCount: number;
  videoCount: number;
  fileCount: number;
  locationCount: number;
  participantStats: Record<string, ParticipantStatEntry>;
  dailyActivity: Record<string, number>;
  hourlyDistribution: Record<string, number>;
  languageDistribution: Record<string, number>;
};

/** Ce qu'il faut d'un message pour l'agréger. */
type AggregableMessage = {
  content: string | null;
  senderId: string;
  createdAt: Date;
  originalLanguage: string | null;
  messageType: string | null;
  sender: { userId: string | null } | null;
  attachments: ReadonlyArray<{ mimeType: string }>;
};

/**
 * La boucle d'agrégation, et la SEULE (#17076).
 *
 * Elle était inline dans `recompute()`, le seul chemin qui agrégeait. Il y en a
 * deux depuis que la lecture d'un participant BORNÉ par son plancher
 * d'historique ne peut plus passer par la ligne partagée : la recopier aurait
 * fait diverger la vue d'un lecteur borné de celle de tout le monde — sur les
 * mêmes messages, par deux boucles jumelles.
 *
 * Pure : la FENÊTRE est choisie par l'appelant (son `where`), jamais ici. C'est
 * ce qui rend les deux chemins comparables message par message.
 */
function aggregateMessages(messages: readonly AggregableMessage[]): AggregatedCounters {
  const counters: AggregatedCounters = {
    totalMessages: 0,
    totalWords: 0,
    totalCharacters: 0,
    textMessages: 0,
    imageCount: 0,
    audioCount: 0,
    videoCount: 0,
    fileCount: 0,
    locationCount: 0,
    participantStats: {},
    dailyActivity: {},
    hourlyDistribution: {},
    languageDistribution: {},
  };

  for (const msg of messages) {
    counters.totalMessages += 1;
    const words = countWords(msg.content ?? '');
    const chars = countCharacters(msg.content ?? '');
    counters.totalWords += words;
    counters.totalCharacters += chars;

    const userId = msg.sender?.userId || msg.senderId;

    if (!counters.participantStats[userId]) {
      counters.participantStats[userId] = {
        messageCount: 0,
        wordCount: 0,
        characterCount: 0,
        imageCount: 0,
        audioCount: 0,
        videoCount: 0,
        firstMessageAt: null,
        lastMessageAt: null,
      };
    }
    const entry = counters.participantStats[userId];
    entry.messageCount += 1;
    entry.wordCount += words;
    entry.characterCount += chars;

    const msgTime = msg.createdAt.toISOString();
    if (!entry.firstMessageAt || msgTime < entry.firstMessageAt) {
      entry.firstMessageAt = msgTime;
    }
    if (!entry.lastMessageAt || msgTime > entry.lastMessageAt) {
      entry.lastMessageAt = msgTime;
    }

    const msgType = msg.messageType || 'text';
    if (msgType === 'text' && msg.attachments.length === 0) {
      counters.textMessages += 1;
    }

    for (const att of msg.attachments) {
      const resolved = resolveAttachmentType(att.mimeType);
      if (resolved === 'image') { counters.imageCount += 1; entry.imageCount += 1; }
      else if (resolved === 'audio') { counters.audioCount += 1; entry.audioCount += 1; }
      else if (resolved === 'video') { counters.videoCount += 1; entry.videoCount += 1; }
      else if (resolved === 'file') { counters.fileCount += 1; }
    }

    if (msgType === 'location') {
      counters.locationCount += 1;
    }

    const day = msg.createdAt.toISOString().slice(0, 10);
    counters.dailyActivity[day] = (counters.dailyActivity[day] || 0) + 1;

    const hour = String(msg.createdAt.getUTCHours());
    counters.hourlyDistribution[hour] = (counters.hourlyDistribution[hour] || 0) + 1;

    if (msg.originalLanguage) {
      counters.languageDistribution[msg.originalLanguage] =
        (counters.languageDistribution[msg.originalLanguage] || 0) + 1;
    }
  }

  return counters;
}

/** Les colonnes que `aggregateMessages` a besoin de lire. */
const AGGREGABLE_MESSAGE_SELECT = {
  content: true,
  senderId: true,
  createdAt: true,
  originalLanguage: true,
  messageType: true,
  sender: { select: { userId: true } },
  attachments: { select: { mimeType: true } },
} as const;

export class ConversationMessageStatsService {
  private static instance: ConversationMessageStatsService | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 5 * 60 * 1000;

  private constructor() {}

  static getInstance(): ConversationMessageStatsService {
    if (!this.instance) {
      this.instance = new ConversationMessageStatsService();
    }
    return this.instance;
  }

  /**
   * Tous les seaux de cette conversation, BORNÉS COMPRIS (#17076).
   *
   * La clé nue ne suffit plus : un lecteur borné par son plancher d'historique a
   * son propre seau (`conversationId#<instant>`), et ne pas le vider laisserait
   * un message neuf rafraîchir le seau partagé pendant que les bornés servent un
   * compte périmé jusqu'au bout du TTL.
   */
  invalidate(conversationId: string): void {
    this.cache.delete(conversationId);
    const prefix = `${conversationId}#`;
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  /**
   * Le seau d'un lecteur. Deux lecteurs de MÊME plancher le partagent ; un
   * lecteur borné ne lit JAMAIS dans celui d'un lecteur qui ne l'est pas — ce
   * serait la fuite de #17076 par le cache, qu'aucune garde de route ne verrait.
   */
  private cacheKey(
    conversationId: string,
    historyFloor: Date | null,
    hiding: PersonalHistoryHiding = NO_PERSONAL_HIDING
  ): string {
    if (!historyFloor) return conversationId;
    // Le masquage PERSONNEL entre dans la clé : deux lecteurs de même plancher
    // mais de masquages différents ne voient pas le même compte, et partager leur
    // seau servirait à l'un ce que l'autre a effacé pour lui — la même fuite par
    // le cache, d'un cran plus fin.
    const mask = hiding.clearHistoryBefore
      ? `${hiding.clearHistoryBefore.getTime()}`
      : '0';
    const hidden = hiding.hiddenMessageIds.length > 0
      ? `:${[...hiding.hiddenMessageIds].sort().join(',')}`
      : '';
    return `${conversationId}#${historyFloor.getTime()}@${mask}${hidden}`;
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

  /**
   * Les statistiques TELLES QUE CE LECTEUR a le droit de les voir (#17076).
   *
   * Sans plancher — le cas nominal : la ligne pré-agrégée partagée, inchangée.
   *
   * Avec plancher, la ligne partagée est inutilisable : elle décrit TOUTE la vie
   * de la conversation, et ses champs sont NOMMÉS (`participantStats` porte le
   * profil), DATÉS (`firstMessageAt`, `dailyActivity`) et ATTRIBUÉS. Un inscrit
   * entré par un lien `allowViewHistory: false` y lisait quand la conversation a
   * commencé, qui a écrit combien, et le volume de chaque journée passée — soit
   * exactement l'historique que le fil, la recherche, les fils de réponses et les
   * traductions partagées lui refusent message par message.
   *
   * **Recalculé, jamais PLAFONNÉ.** Servir l'agrégat complet avec un total borné
   * laisserait déduire le reste par soustraction ; décider champ par champ
   * laisserait `firstMessageAt` de quelqu'un d'autre vouloir dire quelque chose.
   * Agréger sur la fenêtre répond pour TOUS les champs d'un coup : sous plancher,
   * `firstMessageAt` est le premier message VISIBLE, ce qui ne nomme rien
   * d'antérieur.
   *
   * Le coût est borné par le plancher lui-même — un lecteur borné lit MOINS que
   * ce que `recompute()` lit pour tout le monde — et son seau de cache est le
   * sien (`cacheKey`), partagé avec les lecteurs de même plancher.
   *
   * Et la passe bornée ne PERSISTE rien : un `upsert` écraserait les compteurs de
   * tout le monde avec la vue partielle d'un seul lecteur, changeant la fuite en
   * corruption.
   */
  async getStats(
    prisma: PrismaClient,
    conversationId: string,
    options?: {
      readonly historyFloor?: Date | null;
      /**
       * Le masquage PERSONNEL du lecteur, qui n'a de sens que sur la passe
       * BORNÉE — voir `aggregateFloored`. La ligne partagée ne le reçoit jamais.
       */
      readonly hiding?: PersonalHistoryHiding;
    }
  ): Promise<Record<string, unknown>> {
    const historyFloor = options?.historyFloor ?? null;
    const key = this.cacheKey(conversationId, historyFloor, options?.hiding ?? NO_PERSONAL_HIDING);

    const cached = this.cache.get(key);
    if (this.isValid(cached)) {
      return cached.data;
    }

    if (historyFloor) {
      const shaped = await this.aggregateFloored(
        prisma,
        conversationId,
        historyFloor,
        options?.hiding ?? NO_PERSONAL_HIDING
      );
      this.setCache(key, shaped);
      return shaped;
    }

    const row = await prisma.conversationMessageStats.findUnique({
      where: { conversationId },
    });

    if (!row) {
      const recomputed = await this.recompute(prisma, conversationId);
      return this.shapeResponse(recomputed);
    }

    const shaped = this.shapeResponse(row);
    this.setCache(key, shaped);
    return shaped;
  }

  /**
   * L'agrégation d'un lecteur BORNÉ — même boucle que `recompute()`
   * (`aggregateMessages`), autre fenêtre, et AUCUNE écriture.
   *
   * `updatedAt` est l'instant du CALCUL, et c'est la seule valeur vraie : cette
   * vue n'a pas de ligne, donc pas d'horodatage de ligne à servir.
   */
  private async aggregateFloored(
    prisma: PrismaClient,
    conversationId: string,
    historyFloor: Date,
    hiding: PersonalHistoryHiding
  ): Promise<Record<string, unknown>> {
    // Le masquage PERSONNEL s'applique ICI et nulle part ailleurs dans ce
    // service, et l'asymétrie est la raison même du lot.
    //
    // `recompute()` écrit la ligne PARTAGÉE : y appliquer un masquage personnel
    // poserait la vue d'un lecteur dans le compteur de tous. Son exemption est
    // juste, et elle le dit — « une valeur stockée une fois et lue par tout le
    // monde ». Cette passe-ci n'est ni stockée ni partagée : elle est calculée
    // POUR UN LECTEUR, sur sa fenêtre, et jetée dans son seau. L'exemption ne la
    // couvre donc pas, et un compte qui ne correspond pas au fil que ce lecteur
    // peut dérouler serait un compte faux pour lui.
    //
    // `applyPersonalHistoryHiding` sait fusionner son plancher avec le nôtre
    // (`mergeCreatedAtLowerBound`) : les deux bornes se composent, la plus haute
    // gagne.
    const messages = await withOrphanedSenderRepair({ prisma, conversationIds: [conversationId] }, () =>
      prisma.message.findMany({
        where: applyPersonalHistoryHiding(
          { conversationId, deletedAt: null, createdAt: { gte: historyFloor } },
          hiding
        ),
        select: AGGREGABLE_MESSAGE_SELECT,
      })
    );

    const counters = aggregateMessages(messages as unknown as AggregableMessage[]);

    return this.shapeResponse({
      conversationId,
      ...counters,
      dailyActivity: pruneDailyActivity(counters.dailyActivity),
      updatedAt: new Date(),
    });
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
      select: AGGREGABLE_MESSAGE_SELECT,
    }));

    // La MÊME boucle que la passe bornée d'un lecteur sous plancher (#17076) :
    // deux exemplaires feraient diverger la vue d'un lecteur borné de celle de
    // tout le monde, sur les mêmes messages.
    const {
      totalMessages,
      totalWords,
      totalCharacters,
      textMessages,
      imageCount,
      audioCount,
      videoCount,
      fileCount,
      locationCount,
      participantStats,
      dailyActivity,
      hourlyDistribution,
      languageDistribution,
    } = aggregateMessages(messages as unknown as AggregableMessage[]);

    const prunedDaily = pruneDailyActivity(dailyActivity);

    const row = await prisma.conversationMessageStats.upsert({
      where: { conversationId },
      create: {
        conversationId,
        totalMessages,
        totalWords,
        totalCharacters,
        textMessages,
        imageCount,
        audioCount,
        videoCount,
        fileCount,
        locationCount,
        participantStats: participantStats as unknown as Prisma.InputJsonValue,
        dailyActivity: prunedDaily as unknown as Prisma.InputJsonValue,
        hourlyDistribution: hourlyDistribution as unknown as Prisma.InputJsonValue,
        languageDistribution: languageDistribution as unknown as Prisma.InputJsonValue,
      },
      update: {
        totalMessages,
        totalWords,
        totalCharacters,
        textMessages,
        imageCount,
        audioCount,
        videoCount,
        fileCount,
        locationCount,
        participantStats: participantStats as unknown as Prisma.InputJsonValue,
        dailyActivity: prunedDaily as unknown as Prisma.InputJsonValue,
        hourlyDistribution: hourlyDistribution as unknown as Prisma.InputJsonValue,
        languageDistribution: languageDistribution as unknown as Prisma.InputJsonValue,
      },
    });

    const shaped = this.shapeResponse(row);
    this.setCache(conversationId, shaped);
    return shaped;
  }

  private shapeResponse(row: Record<string, unknown>): Record<string, unknown> {
    return {
      conversationId: row.conversationId,
      totalMessages: row.totalMessages,
      totalWords: row.totalWords,
      totalCharacters: row.totalCharacters,
      contentTypes: {
        text: row.textMessages,
        image: row.imageCount,
        audio: row.audioCount,
        video: row.videoCount,
        file: row.fileCount,
        location: row.locationCount,
      },
      participantStats: typeof row.participantStats === 'string'
        ? JSON.parse(row.participantStats as string)
        : row.participantStats,
      dailyActivity: typeof row.dailyActivity === 'string'
        ? JSON.parse(row.dailyActivity as string)
        : row.dailyActivity,
      hourlyDistribution: typeof row.hourlyDistribution === 'string'
        ? JSON.parse(row.hourlyDistribution as string)
        : row.hourlyDistribution,
      languageDistribution: typeof row.languageDistribution === 'string'
        ? JSON.parse(row.languageDistribution as string)
        : row.languageDistribution,
      updatedAt: row.updatedAt,
    };
  }
}

/**
 * La table MIME → compteur, et la SEULE. `recompute()` — l'autorité, puisque
 * c'est elle qui reconstruit la ligne depuis les messages — l'applique déjà ;
 * les chemins incrémentaux en portaient chacun leur copie inline (handler
 * socket, route de suppression), et une copie qui dérive fait diverger le
 * compteur incrémental de son propre recalcul.
 *
 * Exportée pour que les deux unités partagées d'effets (`messagePostSaveEffects`,
 * `messageRemovalEffects`) traduisent les MIME avec cette table-ci et pas une
 * jumelle.
 */
export function resolveAttachmentType(mimeType: string): string {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
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
