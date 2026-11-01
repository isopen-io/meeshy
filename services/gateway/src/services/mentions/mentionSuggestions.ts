/**
 * Suggestions d'autocomplete de mention — conversation et post.
 *
 * L'ORDRE (#14052, directive porteur 2026-10-31) : les CONNAISSANCES d'abord
 * (lien ≥ ACQUAINTANCE, du plus proche au plus lointain), puis les personnes du
 * CONTEXTE (auteur, commentateurs et réacteurs d'un post ; membres d'une
 * conversation), puis les CONTACTS de tout cercle (lien sous la connaissance,
 * carnet d'adresses apparié), puis l'annuaire. Une conversation FERMÉE ne
 * propose que ses membres, connaissances en tête. Chaque suggestion dit son
 * `group` ; `badge`, `inConversation` et `isFriend` gardent leur sens d'avant
 * (une personne du contexte, connaissance comprise, est badgée `conversation`).
 *
 * Ce que la liste ne doit JAMAIS devenir (#14057, audit de #14055) : un oracle.
 * Qui a RÉAGI ne sort que pour le lecteur à qui `viewerListAccess` ouvre cette
 * liste en tant qu'auteur (décision porteur 2026-10-09) ; un lien inférieur à
 * l'amitié et le carnet d'adresses passent par la découvrabilité (#8104) ; la
 * garde de lecture est celle du FIL (`resolveConsumptionTarget`).
 *
 * La PORTÉE vient de `mentionableScope` (partagée avec la validation à
 * l'envoi) : la recherche ne propose jamais quelqu'un que l'envoi refuserait,
 * et propose tous ceux qu'il accepterait (#7852). Seul un membre ACTIF reçoit
 * une liste, quelle que soit la portée (#14066).
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
import { mentionableScope, scopeIsClosed, type MentionableScope } from './mentionableScope';
import { PARTICIPATION_VIVANTE } from '../../routes/conversations/utils/access-control';
import { keepDiscoverable } from '../profile-discoverability';
import { getBlockRelatedUserIds } from '../../utils/blocking';
import { comptesLies, niveauxParmi, plusProchesDabord, type CompteLie } from '../friendship';
import { resolveConsumptionTarget } from '../posts/postVisibility';
import { commentThreadOf } from '../posts/commentHome';
import { viewerListAccess } from '../posts/viewerListAccess';
import { relationLevelIfAtLeast, type RelationLevel } from '@meeshy/shared/types/relation';
import type { PersonProfileDecor } from '@meeshy/shared/types/profile-decor';
import { AVATAR_RING_COLUMN, authorProfileDecor } from '../appearance/authorProfileDecor';

const logger = enhancedLogger.child({ module: 'MentionSuggestions' });

/** D'où vient une suggestion — l'ordre de la liste suit l'ordre de cette énumération. */
export type MentionSuggestionGroup = 'known' | 'context' | 'contact' | 'directory';

export interface MentionSuggestion {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
  badge: 'conversation' | 'friend' | 'other';
  inConversation: boolean;
  isFriend: boolean;
  /** Le groupe de la suggestion (#14052) ; absent des réponses mises en cache avant lui. */
  group?: MentionSuggestionGroup;
  /** Le contour d'avatar équipé (#10945) ; absent sans contour. */
  profileDecor?: PersonProfileDecor;
}

export const MAX_SUGGESTIONS = 10;

/**
 * Court et versionné : une clé d'une version antérieure n'est jamais relue par la
 * forme courante (ni les entrées vides de l'annuaire cassé, ni les connaissances
 * servies avant la loi de découvrabilité), et un changement de membres que
 * personne n'invalide ne survit pas plus d'une minute.
 */
const CACHE_TTL_SECONDS = 60;
const NO_BLOCKS: ReadonlySet<string> = new Set();
const CACHE_PREFIX = 'mentions:suggestions:v4';

export const ACCESS_DENIED = 'Conversation non trouvée ou accès refusé';
export const POST_ACCESS_DENIED = 'Post non trouvé ou accès refusé';

const KNOWN_FLOOR: RelationLevel = 'ACQUAINTANCE';
const FRIEND_FLOOR: RelationLevel = 'FRIEND';
const ADDRESS_BOOK_CAP = 500;
/** Les intervenants lus par post : assez pour dix suggestions filtrées, jamais tout un post viral. */
const THREAD_READ_CAP = 200;

const isKnownLevel = (level: RelationLevel | undefined): boolean =>
  level !== undefined && relationLevelIfAtLeast(level, KNOWN_FLOOR) !== null;
const isFriendLevel = (level: RelationLevel | undefined): boolean =>
  level !== undefined && relationLevelIfAtLeast(level, FRIEND_FLOOR) !== null;

const USER_SELECT = {
  id: true,
  username: true,
  firstName: true,
  lastName: true,
  displayName: true,
  avatar: true,
  // #10945 — le contour équipé, résolu en `profileDecor` par `suggestion()`.
  ...AVATAR_RING_COLUMN
} as const;

type SuggestedUser = {
  id: string;
  username: string;
  displayName: string | null;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  equippedAvatarRing?: string | null;
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

type Placement = {
  readonly group: MentionSuggestionGroup;
  readonly level?: RelationLevel;
  readonly inContext: boolean;
};

function badgeOf(placement: Placement): MentionSuggestion['badge'] {
  if (placement.inContext) return 'conversation';
  return isFriendLevel(placement.level) ? 'friend' : 'other';
}

function suggestion(user: SuggestedUser, placement: Placement): MentionSuggestion {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatar: user.avatar,
    badge: badgeOf(placement),
    inConversation: placement.inContext,
    isFriend: isFriendLevel(placement.level),
    group: placement.group,
    ...authorProfileDecor(user)
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

/** Les comptes liés, partagés entre connaissances (≥ ACQUAINTANCE) et contacts (en dessous). */
type Ties = {
  readonly known: readonly CompteLie[];
  readonly below: readonly CompteLie[];
  readonly levelOf: ReadonlyMap<string, RelationLevel>;
};

/** Une connaissance qui est AUSSI du contexte en porte le drapeau et le badge. */
function inContextIf(suggested: MentionSuggestion, contextIds: ReadonlySet<string>): MentionSuggestion {
  return contextIds.has(suggested.id) ? { ...suggested, inConversation: true, badge: 'conversation' } : suggested;
}

function splitTies(ties: readonly CompteLie[]): Ties {
  return {
    known: ties.filter(t => isKnownLevel(t.niveau)),
    below: ties.filter(t => !isKnownLevel(t.niveau)),
    levelOf: new Map(ties.map(t => [t.id, t.niveau]))
  };
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
    // #14066 — quelle que soit la portée, un non-membre ne cite personne : une
    // conversation ouverte n'énumère pas ses membres (ni l'annuaire) à un tiers.
    // L'appartenance est une participation VIVANTE (active ET non bannie). Les
    // deux lectures partent ensemble : « absente » et « non membre » coûtent la
    // même attente et rendent le même refus.
    const [conversation, membership] = await Promise.all([
      this.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, type: true }
      }),
      this.prisma.participant.findFirst({
        where: { conversationId, userId: currentUserId, ...PARTICIPATION_VIVANTE },
        select: { id: true }
      })
    ]);
    const scope = conversation ? mentionableScope(conversation.type) : null;
    if (!scope || !membership) throw new Error(ACCESS_DENIED);
    return scope;
  }

  private async rankedMembers(conversationId: string, currentUserId: string): Promise<SuggestedUser[]> {
    const members = await this.prisma.participant.findMany({
      where: { conversationId, ...PARTICIPATION_VIVANTE, userId: { not: currentUserId } },
      include: { user: { select: USER_SELECT } }
    });
    const activity = await this.loadConversationActivity(conversationId);
    return [...members]
      .sort(byConversationActivity(activity))
      .flatMap(member => (member.user ? [member.user] : []));
  }

  /** Les comptes de `ids`, actifs et non supprimés, DANS L'ORDRE de `ids`. */
  private async usersInOrder(ids: readonly string[]): Promise<SuggestedUser[]> {
    if (ids.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...ids] }, isActive: true, AND: [unsetOrNull('deletedAt')] },
      select: USER_SELECT
    });
    const byId = new Map(users.map(user => [user.id, user]));
    return ids.flatMap(userId => {
      const user = byId.get(userId);
      return user ? [user] : [];
    });
  }

  private async tiesOf(currentUserId: string): Promise<Ties> {
    return splitTies(await comptesLies(this.prisma, currentUserId));
  }

  /** Le carnet d'adresses apparié de l'appelant : les comptes Meeshy de ses contacts. */
  private async addressBookOf(currentUserId: string): Promise<string[]> {
    const contacts = await this.prisma.userContact.findMany({
      where: { ownerId: currentUserId, matchedUserId: { not: null } },
      select: { matchedUserId: true },
      take: ADDRESS_BOOK_CAP
    });
    return contacts.flatMap(contact =>
      contact.matchedUserId && contact.matchedUserId !== currentUserId ? [contact.matchedUserId] : []
    );
  }

  /**
   * Les connaissances, du plus proche au plus lointain. Sous l'amitié, un compte
   * caché (#8104) ne sort pas : `keepDiscoverable` n'exempte que soi et les amis.
   */
  private async knownSuggestions(
    ties: Ties,
    currentUserId: string,
    matches: (user: SuggestedUser) => boolean
  ): Promise<MentionSuggestion[]> {
    const users = await keepDiscoverable(this.prisma, currentUserId, await this.usersInOrder(ties.known.map(t => t.id)));
    return users
      .filter(matches)
      .map(user => suggestion(user, { group: 'known', level: ties.levelOf.get(user.id), inContext: false }));
  }

  /**
   * Les contacts de TOUT cercle : liens sous la connaissance, puis carnet d'adresses
   * apparié. Aucun n'est un ami : tous passent par la découvrabilité (#8104).
   */
  private async contactSuggestions(
    ties: Ties,
    currentUserId: string,
    matches: (user: SuggestedUser) => boolean
  ): Promise<MentionSuggestion[]> {
    const linked = ties.below.map(t => t.id);
    const addressBook = (await this.addressBookOf(currentUserId)).filter(userId => !ties.levelOf.has(userId));
    const users = await this.usersInOrder([...new Set([...linked, ...addressBook])]);
    const discoverable = await keepDiscoverable(this.prisma, currentUserId, users);
    return discoverable
      .filter(matches)
      .map(user => suggestion(user, { group: 'contact', level: ties.levelOf.get(user.id), inContext: false }));
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
    currentUserId: string,
    blocked: ReadonlySet<string>
  ): Promise<MentionSuggestion[]> {
    // L'annuaire est une RECHERCHE : un compte caché (#8104) n'y est pas
    // proposé. Connaissances, contexte et contacts, listés plus haut, ne passent pas par ici.
    const others = await keepDiscoverable(
      this.prisma,
      currentUserId,
      await this.searchDirectory(query, [...current.map(s => s.id), currentUserId, ...blocked], MAX_SUGGESTIONS - current.length)
    );
    return appendUnique(current, others.map(user => suggestion(user, { group: 'directory', inContext: false })));
  }

  /**
   * Conversation FERMÉE (directe, groupe) : la portée n'admet que ses membres
   * (`mentionableScope`, partagée avec la validation à l'envoi) — les connaissances
   * en tête, du plus proche au plus lointain, puis les autres par activité ici.
   */
  private async closedConversation(
    conversationId: string,
    currentUserId: string,
    matches: (user: SuggestedUser) => boolean
  ): Promise<MentionSuggestion[]> {
    const members = (await this.rankedMembers(conversationId, currentUserId)).filter(matches);
    const levels = await niveauxParmi(this.prisma, currentUserId, members.map(m => m.id));
    const knownFirst = new Map(
      [...levels].filter(([, level]) => isKnownLevel(level))
    );
    const byId = new Map(members.map(user => [user.id, user]));
    const ordered = plusProchesDabord(members.map(m => m.id), knownFirst).flatMap(userId => {
      const user = byId.get(userId);
      return user ? [user] : [];
    });
    return appendUnique(
      [],
      ordered.map(user =>
        suggestion(user, {
          group: isKnownLevel(levels.get(user.id)) ? 'known' : 'context',
          level: levels.get(user.id),
          inContext: true
        })
      )
    );
  }

  /** Conversation OUVERTE : connaissances, membres, contacts de tout cercle, annuaire. */
  private async openConversation(
    conversationId: string,
    currentUserId: string,
    query: string,
    blocked: ReadonlySet<string>,
    matches: (user: SuggestedUser) => boolean
  ): Promise<MentionSuggestion[]> {
    const [members, ties] = await Promise.all([
      this.rankedMembers(conversationId, currentUserId),
      this.tiesOf(currentUserId)
    ]);
    const memberIds = new Set(members.map(m => m.id));
    const known = (await this.knownSuggestions(ties, currentUserId, matches)).map(s => inContextIf(s, memberIds));
    const withKnown = appendUnique([], known);
    const withMembers = appendUnique(
      withKnown,
      members
        .filter(matches)
        .map(user => suggestion(user, { group: 'context', level: ties.levelOf.get(user.id), inContext: true }))
    );
    if (withMembers.length >= MAX_SUGGESTIONS) return withMembers;
    const withContacts = appendUnique(withMembers, await this.contactSuggestions(ties, currentUserId, matches));
    return this.appendDirectory(withContacts, query, currentUserId, blocked);
  }

  async forConversation(conversationId: string, currentUserId: string, query: string): Promise<MentionSuggestion[]> {
    const scope = await this.resolveScope(conversationId, currentUserId);

    // #13350 — une conversation OUVERTE propose connaissances, membres, contacts et
    // annuaire : personne en relation de blocage avec l'appelant n'y figure, cache
    // compris (relu à chaque appel, le blocage prend effet sans attendre son expiration).
    const blocked = scope === 'directory' ? await getBlockRelatedUserIds(this.prisma, currentUserId) : NO_BLOCKS;
    const key = this.cacheKey(conversationId, currentUserId, query);
    const cached = await this.readCache(key);
    if (cached) return cached.filter(s => !blocked.has(s.id));

    const matches = (user: SuggestedUser): boolean => !blocked.has(user.id) && queryMatcher(query)(user);
    const suggestions = scopeIsClosed(scope)
      ? await this.closedConversation(conversationId, currentUserId, matches)
      : await this.openConversation(conversationId, currentUserId, query, blocked, matches);

    await this.writeCache(key, suggestions);
    return suggestions;
  }

  /**
   * Les intervenants d'un fil : ses auteurs (la republication, puis l'original),
   * ses commentateurs, puis — seulement quand `withReactors` — ceux qui ont réagi.
   * Tous passent par `usersInOrder` : un compte désactivé ou supprimé ne sort pas.
   */
  private async threadParticipants(
    threadId: string,
    authorIds: readonly string[],
    currentUserId: string,
    withReactors: boolean
  ): Promise<SuggestedUser[]> {
    const [comments, reactions] = await Promise.all([
      this.prisma.postComment.findMany({
        where: { postId: threadId, authorId: { not: currentUserId }, ...unsetOrNull('deletedAt') },
        select: { authorId: true },
        orderBy: { createdAt: 'asc' },
        take: THREAD_READ_CAP
      }),
      withReactors
        ? this.prisma.postReaction.findMany({
            where: { postId: threadId, userId: { not: currentUserId } },
            select: { userId: true },
            orderBy: { createdAt: 'asc' },
            take: THREAD_READ_CAP
          })
        : Promise.resolve([] as Array<{ userId: string }>)
    ]);
    const ordered = [
      ...authorIds,
      ...comments.map(comment => comment.authorId),
      ...reactions.map(reaction => reaction.userId)
    ].filter(userId => userId && userId !== currentUserId);
    return this.usersInOrder([...new Set(ordered)]);
  }

  /**
   * Contexte post (story, réel et mood compris — tous des `Post`) : connaissances,
   * puis intervenants, puis contacts de tout cercle, puis l'annuaire. La garde est
   * celle du FIL (`resolveConsumptionTarget`) : un post — ou l'original d'une
   * republication simple — que l'appelant ne peut pas lire ne livre personne, et un
   * id malformé est un refus. Les réacteurs ne sortent que pour qui en lit la liste
   * en tant qu'auteur (`viewerListAccess`, décision porteur 2026-10-09) — jamais
   * pour un ADMIN par ce chemin, qui n'écrit aucune trace d'audit : le rôle n'y
   * entre donc pas.
   */
  async forPost(
    postId: string,
    currentUserId: string,
    query: string
  ): Promise<MentionSuggestion[]> {
    const target = await resolveConsumptionTarget(this.prisma, postId, currentUserId);
    if (!target) throw new Error(POST_ACCESS_DENIED);

    const thread = target.redirectedFrom ?? target;
    const withReactors =
      viewerListAccess({ authorId: thread.authorId, type: thread.type }, { id: currentUserId, role: null }) ===
      'author';

    const blocked = await getBlockRelatedUserIds(this.prisma, currentUserId);
    const matches = (user: SuggestedUser): boolean => !blocked.has(user.id) && queryMatcher(query)(user);
    const [ties, participants] = await Promise.all([
      this.tiesOf(currentUserId),
      this.threadParticipants(commentThreadOf(target), [thread.authorId, target.authorId], currentUserId, withReactors)
    ]);

    const participantIds = new Set(participants.map(user => user.id));
    const known = (await this.knownSuggestions(ties, currentUserId, matches)).map(s => inContextIf(s, participantIds));
    const withKnown = appendUnique([], known);
    const withContext = appendUnique(
      withKnown,
      participants
        .filter(matches)
        .map(user => suggestion(user, { group: 'context', level: ties.levelOf.get(user.id), inContext: true }))
    );
    if (withContext.length >= MAX_SUGGESTIONS) return withContext;
    const withContacts = appendUnique(withContext, await this.contactSuggestions(ties, currentUserId, matches));
    return this.appendDirectory(withContacts, query, currentUserId, blocked);
  }
}
