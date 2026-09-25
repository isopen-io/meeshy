/**
 * Suggestions d'autocomplete de mention — conversation et post.
 *
 * La PORTÉE vient de `mentionableScope` (partagée avec la validation à
 * l'envoi) : la recherche ne propose jamais quelqu'un que l'envoi refuserait,
 * et propose tous ceux qu'il accepterait (#7852).
 *
 * L'annuaire se lit comme `/users/search` : par jeton (`searchTokens`, indexé),
 * à partir de deux caractères, et `deletedAt` apparié dans ses DEUX états
 * « pas supprimé » (`unsetOrNull`). Le `{ deletedAt: null }` d'avant n'appariait
 * pas un champ ABSENT — celui de tout compte jamais supprimé — et vidait
 * l'annuaire en silence.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import type { CacheStore } from '../CacheStore';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { unsetOrNull } from '../../utils/prisma-unset';
import { jetonRecherche } from '../../utils/search-tokens';
import { mentionableScope, scopeRequiresMembership, type MentionableScope } from './mentionableScope';

const logger = enhancedLogger.child({ module: 'MentionSuggestions' });

export interface MentionSuggestion {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  badge: 'conversation' | 'friend' | 'other';
  inConversation: boolean;
  isFriend: boolean;
}

export const MAX_SUGGESTIONS = 10;

/**
 * Court et versionné : la clé `v2` n'est pas relue par l'ancienne forme (dont
 * les entrées vides de l'annuaire cassé), et un changement de membres que
 * personne n'invalide ne survit pas plus d'une minute.
 */
const CACHE_TTL_SECONDS = 60;
const CACHE_PREFIX = 'mentions:suggestions:v2';

export const ACCESS_DENIED = 'Conversation non trouvée ou accès refusé';

const USER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true
} as const;

type SuggestedUser = {
  id: string;
  username: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
};

/**
 * Le rang d'un membre est son ACTIVITÉ DANS LA CONVERSATION (dernier message
 * écrit ici, `participantStats` de `ConversationMessageStats`), jamais sa
 * présence globale : un ordre qui en dépendrait révélerait la présence d'un
 * co-participant à qui la porte la masque.
 */
const participantActivityStatsSchema = z.record(
  z.string(),
  z.object({ lastMessageAt: z.string().nullable().optional() }).loose()
);

type ConversationActivity = ReadonlyMap<string, number>;

type RankableMember = {
  user: { id: string; username: string; displayName: string | null } | null;
};

function lastMessageEpochByAuthor(rawParticipantStats: unknown): ConversationActivity {
  const parsed = participantActivityStatsSchema.safeParse(
    typeof rawParticipantStats === 'string' ? JSON.parse(rawParticipantStats) : rawParticipantStats
  );
  if (!parsed.success) return new Map();
  return new Map(
    Object.entries(parsed.data)
      .map(([authorKey, stat]) => [authorKey, Date.parse(stat.lastMessageAt ?? '')] as const)
      .filter(([, epoch]) => Number.isFinite(epoch))
  );
}

function memberLabel(member: RankableMember): string {
  return (member.user?.displayName || member.user?.username || '').toLowerCase();
}

function byConversationActivity(activity: ConversationActivity) {
  const lastMessageEpoch = (member: RankableMember): number =>
    member.user ? (activity.get(member.user.id) ?? 0) : 0;
  return <T extends RankableMember>(a: T, b: T): number =>
    lastMessageEpoch(b) - lastMessageEpoch(a) ||
    memberLabel(a).localeCompare(memberLabel(b)) ||
    (a.user?.username ?? '').localeCompare(b.user?.username ?? '');
}

function queryMatcher(query: string) {
  const normalized = query.toLowerCase().trim();
  return (user: SuggestedUser): boolean => {
    if (!normalized) return true;
    const fullName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.toLowerCase();
    return (
      user.username.toLowerCase().includes(normalized) ||
      (user.displayName ?? '').toLowerCase().includes(normalized) ||
      fullName.includes(normalized)
    );
  };
}

function suggestion(
  user: SuggestedUser,
  badge: MentionSuggestion['badge'],
  flags: { inConversation: boolean; isFriend: boolean }
): MentionSuggestion {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    badge,
    ...flags
  };
}

/** Ajoute sans doublon ni dépassement du plafond ; rend la liste NOUVELLE. */
function appendUnique(
  current: readonly MentionSuggestion[],
  candidates: readonly MentionSuggestion[]
): MentionSuggestion[] {
  return candidates.reduce<MentionSuggestion[]>(
    (acc, candidate) =>
      acc.length >= MAX_SUGGESTIONS || acc.some(s => s.id === candidate.id) ? acc : [...acc, candidate],
    [...current]
  );
}

export class MentionSuggestionFinder {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly cache: CacheStore
  ) {}

  private cacheKey(conversationId: string, currentUserId: string, query: string): string {
    return `${CACHE_PREFIX}:${conversationId}:${currentUserId}:${query.toLowerCase().trim()}`;
  }

  private async readCache(key: string): Promise<MentionSuggestion[] | null> {
    try {
      const cached = await this.cache.get(key);
      return cached ? (JSON.parse(cached) as MentionSuggestion[]) : null;
    } catch (error) {
      logger.error('[MentionSuggestions] Error reading cache', error);
      return null;
    }
  }

  /** Une liste VIDE ne se met pas en cache : elle masquerait un membre arrivé entre-temps. */
  private async writeCache(key: string, suggestions: readonly MentionSuggestion[]): Promise<void> {
    if (suggestions.length === 0) return;
    try {
      await this.cache.set(key, JSON.stringify(suggestions), CACHE_TTL_SECONDS);
    } catch (error) {
      logger.error('[MentionSuggestions] Error writing cache', error);
    }
  }

  async invalidateConversation(conversationId: string): Promise<void> {
    try {
      const keys = await this.cache.keys(`${CACHE_PREFIX}:${conversationId}:*`);
      await Promise.all(keys.map(key => this.cache.del(key)));
    } catch (error) {
      logger.error('[MentionSuggestions] Error invalidating cache', error);
    }
  }

  private async loadConversationActivity(conversationId: string): Promise<ConversationActivity> {
    const statsRow = await this.prisma.conversationMessageStats.findUnique({
      where: { conversationId },
      select: { participantStats: true }
    });
    if (!statsRow) return new Map();
    return lastMessageEpochByAuthor(statsRow.participantStats);
  }

  private async resolveScope(conversationId: string, currentUserId: string): Promise<MentionableScope> {
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { id: true, type: true }
    });
    const scope = conversation ? mentionableScope(conversation.type) : null;
    if (!scope) throw new Error(ACCESS_DENIED);
    if (!scopeRequiresMembership(scope)) return scope;

    const membership = await this.prisma.participant.findFirst({
      where: { conversationId, userId: currentUserId, isActive: true },
      select: { id: true }
    });
    if (!membership) throw new Error(ACCESS_DENIED);
    return scope;
  }

  private async rankedMembers(conversationId: string, currentUserId: string): Promise<SuggestedUser[]> {
    const members = await this.prisma.participant.findMany({
      where: { conversationId, isActive: true, userId: { not: currentUserId } },
      include: { user: { select: USER_SELECT } }
    });
    const activity = await this.loadConversationActivity(conversationId);
    return [...members]
      .sort(byConversationActivity(activity))
      .flatMap(member => (member.user ? [member.user] : []));
  }

  private async friendsOf(currentUserId: string): Promise<SuggestedUser[]> {
    const friendships = await this.prisma.friendRequest.findMany({
      where: {
        OR: [
          { senderId: currentUserId, status: 'accepted' },
          { receiverId: currentUserId, status: 'accepted' }
        ]
      },
      select: {
        senderId: true,
        receiverId: true,
        sender: { select: USER_SELECT },
        receiver: { select: USER_SELECT }
      }
    });
    return friendships.flatMap(friendship => {
      const friend = friendship.senderId === currentUserId ? friendship.receiver : friendship.sender;
      return friend && friend.id !== currentUserId ? [friend] : [];
    });
  }

  /** L'annuaire — à partir de deux caractères, comme `/users/search`. */
  private async searchDirectory(query: string, excludedIds: readonly string[], take: number): Promise<SuggestedUser[]> {
    const token = jetonRecherche(query);
    if (!token || take <= 0) return [];
    return this.prisma.user.findMany({
      where: {
        AND: [
          { searchTokens: { has: token } },
          { id: { notIn: [...excludedIds] } },
          { isActive: true },
          unsetOrNull('deletedAt')
        ]
      },
      select: USER_SELECT,
      take,
      orderBy: { username: 'asc' }
    });
  }

  private async appendDirectory(
    current: readonly MentionSuggestion[],
    query: string,
    currentUserId: string
  ): Promise<MentionSuggestion[]> {
    const others = await this.searchDirectory(
      query,
      [...current.map(s => s.id), currentUserId],
      MAX_SUGGESTIONS - current.length
    );
    return appendUnique(
      current,
      others.map(user => suggestion(user, 'other', { inConversation: false, isFriend: false }))
    );
  }

  async forConversation(conversationId: string, currentUserId: string, query: string): Promise<MentionSuggestion[]> {
    const scope = await this.resolveScope(conversationId, currentUserId);

    const key = this.cacheKey(conversationId, currentUserId, query);
    const cached = await this.readCache(key);
    if (cached) return cached;

    const matches = queryMatcher(query);
    const members = (await this.rankedMembers(conversationId, currentUserId)).filter(matches);
    const friends = scope === 'directory' ? await this.friendsOf(currentUserId) : [];
    const friendIds = new Set(friends.map(f => f.id));

    const withMembers = appendUnique(
      [],
      members.map(user => suggestion(user, 'conversation', { inConversation: true, isFriend: friendIds.has(user.id) }))
    );
    const withFriends = appendUnique(
      withMembers,
      friends.filter(matches).map(user => suggestion(user, 'friend', { inConversation: false, isFriend: true }))
    );
    const suggestions =
      scope === 'directory' ? await this.appendDirectory(withFriends, query, currentUserId) : withFriends;

    await this.writeCache(key, suggestions);
    return suggestions;
  }

  /**
   * Contexte post : auteur, puis commentateurs, puis amis, puis l'annuaire —
   * une mention de post n'a pas de portée fermée.
   */
  async forPost(postId: string, currentUserId: string, query: string): Promise<MentionSuggestion[]> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, deletedAt: true, author: { select: USER_SELECT } }
    });
    if (!post || post.deletedAt) {
      throw new Error('Post non trouvé ou accès refusé');
    }

    const matches = queryMatcher(query);
    const author = post.author && post.author.id !== currentUserId ? [post.author] : [];

    const comments = await this.prisma.postComment.findMany({
      where: { postId, authorId: { not: currentUserId }, ...unsetOrNull('deletedAt') },
      select: { authorId: true, author: { select: USER_SELECT } },
      orderBy: { createdAt: 'asc' }
    });
    const commenters = comments.flatMap(comment => (comment.author ? [comment.author] : []));

    const thread = appendUnique(
      [],
      [...author, ...commenters]
        .filter(matches)
        .map(user => suggestion(user, 'conversation', { inConversation: true, isFriend: false }))
    );
    if (thread.length >= MAX_SUGGESTIONS) return thread;

    const friends = await this.friendsOf(currentUserId);
    const withFriends = appendUnique(
      thread,
      friends.filter(matches).map(user => suggestion(user, 'friend', { inConversation: false, isFriend: true }))
    );
    return this.appendDirectory(withFriends, query, currentUserId);
  }
}
