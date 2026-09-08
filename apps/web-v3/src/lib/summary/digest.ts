import {
  EMPTY_MEDIA_TALLY,
  makeAwaitingItem,
  type AwaitingItem,
  type ConversationEpisode,
  type DeterministicConversationDigest,
  type DigestInputMessage,
  type DigestParticipant,
  type LanguageTally,
  type MediaTally,
  type SenderTally,
} from './types';

/**
 * LE DIGEST DÉTERMINISTE — miroir de `DeterministicDigestBuilder.swift`
 * (#5695, étape 5). 100 % des comptes viennent des messages RÉELLEMENT
 * chargés — jamais extrapolés. `isComplete` est un PASS-THROUGH du
 * paramètre `windowCoversUnread` fourni par l'appelant : ce fichier ne
 * DÉCIDE PAS si la fenêtre couvre le non-lu, il transmet honnêtement ce que
 * l'appelant sait déjà.
 */

export type BuildDigestInput = {
  readonly messages: readonly DigestInputMessage[];
  readonly participants: readonly DigestParticipant[];
  readonly viewerId: string;
  readonly episodes: readonly ConversationEpisode[];
  readonly windowCoversUnread: boolean;
};

export function buildDigest(input: BuildDigestInput): DeterministicConversationDigest {
  if (input.messages.length === 0) {
    return {
      messageCount: 0,
      participantCount: 0,
      start: null,
      end: null,
      topSenders: [],
      languages: [],
      media: EMPTY_MEDIA_TALLY,
      awaitingYou: [],
      episodes: input.episodes,
      isComplete: input.windowCoversUnread,
    };
  }

  const sorted = [...input.messages].sort((a, b) => a.createdAt - b.createdAt);
  // Les messages système n'ont pas d'« expéditeur » au sens conversationnel.
  const real = sorted.filter((m) => !m.isSystem);

  const knownIds = new Set(input.participants.map((p) => p.id));
  const activeSenderIds = new Set(real.map((m) => m.senderId));
  const countedParticipantIds =
    knownIds.size === 0 ? activeSenderIds : new Set([...knownIds].filter((id) => activeSenderIds.has(id)));

  const messagesById = new Map(sorted.map((m) => [m.id, m] as const));

  return {
    messageCount: real.length,
    participantCount: countedParticipantIds.size,
    start: (sorted[0] as DigestInputMessage).createdAt,
    end: (sorted[sorted.length - 1] as DigestInputMessage).createdAt,
    topSenders: buildTopSenders(real),
    languages: buildLanguages(real),
    media: buildMedia(real),
    awaitingYou: buildAwaitingYou(real, messagesById, input.viewerId),
    episodes: input.episodes,
    isComplete: input.windowCoversUnread,
  };
}

// MARK: - Auteurs les plus actifs — compte décroissant, puis userId croissant

function buildTopSenders(real: readonly DigestInputMessage[]): readonly SenderTally[] {
  const counts = new Map<string, number>();
  const lastAt = new Map<string, number>();
  for (const message of real) {
    counts.set(message.senderId, (counts.get(message.senderId) ?? 0) + 1);
    const existing = lastAt.get(message.senderId);
    if (existing === undefined || message.createdAt > existing) {
      lastAt.set(message.senderId, message.createdAt);
    }
  }
  return [...counts.entries()]
    .map(([userId, messageCount]) => ({ userId, messageCount, lastAt: lastAt.get(userId) ?? Number.NEGATIVE_INFINITY }))
    .sort((a, b) => (a.messageCount !== b.messageCount ? b.messageCount - a.messageCount : a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

// MARK: - Langues

function buildLanguages(real: readonly DigestInputMessage[]): readonly LanguageTally[] {
  const counts = new Map<string, number>();
  for (const message of real) {
    const code = message.languageCode;
    if (code === null || code === '') continue;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([code, messageCount]) => ({ code, messageCount }))
    .sort((a, b) => (a.messageCount !== b.messageCount ? b.messageCount - a.messageCount : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

// MARK: - Médias — six seaux réels, jamais un comptage inventé

function buildMedia(real: readonly DigestInputMessage[]): MediaTally {
  let images = 0;
  let videos = 0;
  let audios = 0;
  let files = 0;
  let locations = 0;
  let links = 0;
  for (const message of real) {
    for (const kind of message.attachmentKinds) {
      if (kind === 'image') images += 1;
      else if (kind === 'video') videos += 1;
      else if (kind === 'audio') audios += 1;
      else if (kind === 'file') files += 1;
      else if (kind === 'location') locations += 1;
    }
    links += message.linkCount;
  }
  return { images, videos, audios, files, locations, links };
}

// MARK: - « Ils t'attendent »

/**
 * Une mention/question est « sans réponse » si AUCUN message du lecteur
 * n'existe APRÈS elle dans la fenêtre fournie. Une réponse directe est
 * STRUCTURELLE (`replyToId` pointe vers un message DU lecteur) — zéro
 * heuristique.
 */
export function buildAwaitingYou(
  real: readonly DigestInputMessage[],
  messagesById: ReadonlyMap<string, DigestInputMessage>,
  viewerId: string,
): readonly AwaitingItem[] {
  const viewerMessageTimes = real.filter((m) => m.senderId === viewerId).map((m) => m.createdAt);
  const viewerLastMessageAt = viewerMessageTimes.length === 0 ? Number.NEGATIVE_INFINITY : Math.max(...viewerMessageTimes);

  const items: AwaitingItem[] = [];
  for (const message of real) {
    if (message.senderId === viewerId) continue;
    const isUnanswered = message.createdAt > viewerLastMessageAt;

    if (message.mentionsViewer && isUnanswered) {
      const item = makeAwaitingItem({
        id: `mention_${message.id}`,
        kind: 'mention',
        fromUserId: message.senderId,
        evidenceMessageIds: [message.id],
        at: message.createdAt,
      });
      if (item !== null) items.push(item);
    }

    if (message.replyToId !== null) {
      const parent = messagesById.get(message.replyToId);
      if (parent !== undefined && parent.senderId === viewerId) {
        const item = makeAwaitingItem({
          id: `reply_${message.id}`,
          kind: 'directReply',
          fromUserId: message.senderId,
          evidenceMessageIds: [message.id],
          at: message.createdAt,
        });
        if (item !== null) items.push(item);
      }
    }

    if (message.content.trim().endsWith('?') && isUnanswered) {
      const item = makeAwaitingItem({
        id: `question_${message.id}`,
        kind: 'unansweredQuestion',
        fromUserId: message.senderId,
        evidenceMessageIds: [message.id],
        at: message.createdAt,
      });
      if (item !== null) items.push(item);
    }
  }
  return items.sort((a, b) => a.at - b.at);
}
