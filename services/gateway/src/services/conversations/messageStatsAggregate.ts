/**
 * **CE QU'UN COMPTEUR VEUT DIRE** — le pli d'une liste de messages en
 * compteurs, et la projection servie — extraits de
 * `ConversationMessageStatsService.recompute` (#17076) pour qu'une SECONDE
 * fenêtre d'agrégation existe sans dupliquer la définition de chaque champ.
 *
 * ─── Pourquoi une seconde fenêtre ───────────────────────────────────────────
 *
 * La ligne `ConversationMessageStats` agrège TOUTE la vie de la conversation,
 * et `GET …/stats` la servait à quiconque franchit `canAccessConversation` —
 * dont un inscrit entré par un lien `allowViewHistory: false`, à qui le fil, la
 * recherche, les fils de réponses et les traductions partagées refusent tous
 * l'avant-plancher. L'agrégat lui disait pourtant quand la conversation a
 * commencé, qui a écrit combien, et le volume de chaque journée.
 *
 * **Aucun champ de cette charge n'est sûr sous plancher** : `totalMessages`
 * compte l'avant, `dailyActivity` le date, `participantStats` l'attribue, les
 * deux distributions l'agrègent. Un agrégat « plafonné » n'était donc pas une
 * option — le lecteur connaît sa propre fenêtre par construction, et déduirait
 * l'avant par soustraction.
 *
 * ─── Le pli est PUR, et c'est ce qui le rend partageable ────────────────────
 *
 * `recompute()` mêlait le pli à son `upsert`. Un appelant qui n'a pas le droit
 * d'écrire — une lecture planchéisée — ne pouvait donc pas le réutiliser sans
 * emporter l'écriture, et **écrire la ligne autoritative depuis une fenêtre
 * PARTIELLE l'aurait corrompue pour tout le monde.** Le pli est ici, sans
 * `prisma`, sans cache, sans horloge autre que celle des messages qu'on lui
 * donne.
 */


export interface ParticipantStatEntry {
  messageCount: number;
  wordCount: number;
  characterCount: number;
  imageCount: number;
  audioCount: number;
  videoCount: number;
  firstMessageAt: string | null;
  lastMessageAt: string | null;
}

/**
 * Les champs que le pli LIT, et donc le `select` que ses deux appelants
 * doivent demander. Tenir la forme de la requête à côté du pli est ce qui
 * empêche une fenêtre de charger moins que l'autre — un `select` trop étroit ne
 * fait tomber aucun témoin de comptage, il rend des zéros.
 */
export const FOLDABLE_MESSAGE_SELECT = {
  content: true,
  senderId: true,
  createdAt: true,
  originalLanguage: true,
  messageType: true,
  sender: { select: { userId: true } },
  attachments: { select: { mimeType: true } },
} as const;

export type FoldableMessage = {
  readonly content: string;
  readonly senderId: string;
  readonly createdAt: Date;
  readonly originalLanguage?: string | null;
  readonly messageType?: string | null;
  readonly sender?: { readonly userId?: string | null } | null;
  readonly attachments: ReadonlyArray<{ readonly mimeType: string }>;
};

/** La forme des colonnes de `ConversationMessageStats`, telle que le pli la produit. */
export type FoldedMessageStats = {
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

export function countWords(content: string): number {
  if (!content || !content.trim()) return 0;
  return content.trim().split(/\s+/).length;
}

export function countCharacters(content: string): number {
  return content ? content.length : 0;
}

/**
 * La table MIME → compteur, et la SEULE. `foldMessageStats` — l'autorité,
 * puisque c'est elle qui reconstruit les compteurs depuis les messages —
 * l'applique ; les chemins incrémentaux en portaient chacun leur copie inline,
 * et une copie qui dérive fait diverger le compteur incrémental de son propre
 * recalcul.
 */
export function resolveAttachmentType(mimeType: string): string {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  return 'file';
}

/** La fenêtre de `dailyActivity` conservée : 90 jours, sur les DEUX chemins. */
export function pruneDailyActivity(daily: Record<string, number>): Record<string, number> {
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

/**
 * Le pli. `dailyActivity` sort DÉJÀ élagué à 90 jours — c'est ce que
 * `recompute()` persiste, et une fenêtre planchéisée qui ne l'élaguerait pas
 * servirait une forme plus LARGE que celle de la ligne autoritative.
 */
export function foldMessageStats(messages: readonly FoldableMessage[]): FoldedMessageStats {
  let totalMessages = 0;
  let totalWords = 0;
  let totalCharacters = 0;
  let textMessages = 0;
  let imageCount = 0;
  let audioCount = 0;
  let videoCount = 0;
  let fileCount = 0;
  let locationCount = 0;

  const participantStats: Record<string, ParticipantStatEntry> = {};
  const dailyActivity: Record<string, number> = {};
  const hourlyDistribution: Record<string, number> = {};
  const languageDistribution: Record<string, number> = {};

  for (const msg of messages) {
    totalMessages += 1;
    const words = countWords(msg.content);
    const chars = countCharacters(msg.content);
    totalWords += words;
    totalCharacters += chars;

    const userId = msg.sender?.userId || msg.senderId;

    if (!participantStats[userId]) {
      participantStats[userId] = {
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
    const entry = participantStats[userId];
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
      textMessages += 1;
    }

    for (const att of msg.attachments) {
      const resolved = resolveAttachmentType(att.mimeType);
      if (resolved === 'image') { imageCount += 1; entry.imageCount += 1; }
      else if (resolved === 'audio') { audioCount += 1; entry.audioCount += 1; }
      else if (resolved === 'video') { videoCount += 1; entry.videoCount += 1; }
      else if (resolved === 'file') { fileCount += 1; }
    }

    if (msgType === 'location') {
      locationCount += 1;
    }

    const day = msg.createdAt.toISOString().slice(0, 10);
    dailyActivity[day] = (dailyActivity[day] || 0) + 1;

    const hour = String(msg.createdAt.getUTCHours());
    hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;

    if (msg.originalLanguage) {
      languageDistribution[msg.originalLanguage] = (languageDistribution[msg.originalLanguage] || 0) + 1;
    }
  }

  return {
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
    dailyActivity: pruneDailyActivity(dailyActivity),
    hourlyDistribution,
    languageDistribution,
  };
}

/**
 * La projection SERVIE — la ligne de base et un pli en mémoire y entrent tous
 * les deux, ce qui est le point : les deux fenêtres ne peuvent pas servir deux
 * formes. Les cartes stockées en base arrivent parfois en CHAÎNE JSON (c'est le
 * cas d'un connecteur qui sérialise les colonnes `Json`), un pli jamais.
 */
export function shapeMessageStats(row: Record<string, unknown>): Record<string, unknown> {
  const parse = (value: unknown): unknown => (typeof value === 'string' ? JSON.parse(value) : value);

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
    participantStats: parse(row.participantStats),
    dailyActivity: parse(row.dailyActivity),
    hourlyDistribution: parse(row.hourlyDistribution),
    languageDistribution: parse(row.languageDistribution),
    updatedAt: row.updatedAt,
  };
}

/**
 * Combien de messages une fenêtre planchéisée matérialise à la fois.
 *
 * **La borne n'est pas cosmétique, et la justification qu'elle remplace était
 * FAUSSE.** Ce module a d'abord adossé son coût à `GET …/messages` — « la
 * fenêtre d'un lecteur planchéisé est celle que la liste lui sert déjà ». C'est
 * vrai du DROIT et faux du COÛT : la liste est PAGINÉE
 * (`MESSAGES_LIST_PAGINATION.maxLimit = 50`), elle ne matérialise jamais la
 * fenêtre. Un lecteur entré il y a deux ans dans un salon à fort trafic aurait
 * fait charger, en un seul appel, le `content` et les pièces jointes de tout ce
 * qui a été écrit depuis — OOM ou pause GC sur le processus qui sert tout le
 * temps réel.
 *
 * Le pli est une RÉDUCTION : il n'a besoin que d'une page à la fois. Le total de
 * travail en base ne change pas (c'est le prix d'un agrégat par fenêtre), la
 * mémoire du processus, oui.
 *
 * La LECTURE, elle, vit chez `ConversationMessageStatsService` : ce module-ci
 * ne connaît ni `prisma`, ni cache, ni horloge autre que celle des messages
 * qu'on lui donne, et c'est ce qui le rend partageable par les deux fenêtres.
 */
export const FLOORED_FOLD_PAGE = 500;

/**
 * Le recollement des pages. Il existe parce que le pli est une RÉDUCTION, donc
 * associatif — et chaque champ dit comment il se recolle, ce qui est le seul
 * endroit où une erreur serait SILENCIEUSE : un compteur mal recollé rend un
 * nombre plausible.
 *
 * `dailyActivity` est ré-élagué APRÈS le recollement, pas avant : élaguer
 * chaque page puis sommer donne le même résultat, mais l'ordre inverse serait
 * faux si la fenêtre de 90 jours se déplaçait entre deux pages.
 */
export function mergeFoldedStats(pages: readonly FoldedMessageStats[]): FoldedMessageStats {
  // Une fenêtre VIDE (un lecteur arrivé après le dernier message) est le cas
  // nominal d'un plancher récent, pas un cas d'erreur : elle rend les compteurs
  // à zéro, et la boucle de pages ne lui donne AUCUNE page.
  if (pages.length === 0) return foldMessageStats([]);
  if (pages.length === 1) return { ...pages[0], dailyActivity: pruneDailyActivity(pages[0].dailyActivity) };

  const sumInto = (target: Record<string, number>, source: Record<string, number>): void => {
    for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value;
  };

  const merged: FoldedMessageStats = {
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

  for (const page of pages) {
    merged.totalMessages += page.totalMessages;
    merged.totalWords += page.totalWords;
    merged.totalCharacters += page.totalCharacters;
    merged.textMessages += page.textMessages;
    merged.imageCount += page.imageCount;
    merged.audioCount += page.audioCount;
    merged.videoCount += page.videoCount;
    merged.fileCount += page.fileCount;
    merged.locationCount += page.locationCount;
    sumInto(merged.dailyActivity, page.dailyActivity);
    sumInto(merged.hourlyDistribution, page.hourlyDistribution);
    sumInto(merged.languageDistribution, page.languageDistribution);

    for (const [userId, entry] of Object.entries(page.participantStats)) {
      const target = merged.participantStats[userId];
      if (!target) {
        merged.participantStats[userId] = { ...entry };
        continue;
      }
      target.messageCount += entry.messageCount;
      target.wordCount += entry.wordCount;
      target.characterCount += entry.characterCount;
      target.imageCount += entry.imageCount;
      target.audioCount += entry.audioCount;
      target.videoCount += entry.videoCount;
      // Les deux extrêmes se recollent par comparaison, jamais par
      // remplacement : les pages sont ordonnées par `id`, et un ObjectId n'est
      // monotone qu'à la seconde — deux messages de la même seconde peuvent
      // donc traverser la frontière de page dans l'ordre inverse de leur date.
      if (!target.firstMessageAt || (entry.firstMessageAt && entry.firstMessageAt < target.firstMessageAt)) {
        target.firstMessageAt = entry.firstMessageAt;
      }
      if (!target.lastMessageAt || (entry.lastMessageAt && entry.lastMessageAt > target.lastMessageAt)) {
        target.lastMessageAt = entry.lastMessageAt;
      }
    }
  }

  return { ...merged, dailyActivity: pruneDailyActivity(merged.dailyActivity) };
}
