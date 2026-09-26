/**
 * LA CARTE DE CONVERSATION (#8099) — composition et lectures.
 *
 * Deux portes (`routes/conversations/card.ts`), une seule forme
 * (`@meeshy/shared/types/conversation-card`). Ce module ne décide pas QUI a
 * droit à la carte : la route le tranche (membre, lien actif) et lui passe le
 * verdict. Il décide ce qui PART — champ par champ, rien d'autre : aucune liste
 * de participants, aucun id d'utilisateur, aucun id du créateur du lien.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { isValidMongoId, generateDefaultConversationTitle } from '@meeshy/shared/utils/conversation-helpers';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import {
  CONVERSATION_CARD_DESCRIPTION_MAX,
  CONVERSATION_CARD_INVITE_MESSAGE_MAX,
  type ConversationCard,
  type ConversationCardInviter,
  type ConversationCardStats
} from '@meeshy/shared/types/conversation-card';

/**
 * Plafond de l'échantillon de participants lu pour estimer les langues parlées
 * (#4165) — partagé avec l'aperçu public `GET /anonymous/link/:identifier`.
 * `memberCount` reste EXACT : c'est un `.count()` séparé.
 */
export const SPOKEN_LANGUAGES_SAMPLE_CAP = 100;

export type LanguageSampleRow = {
  readonly type: string;
  readonly language: string | null;
  readonly user: {
    readonly systemLanguage: string | null;
    readonly regionalLanguage: string | null;
    readonly customDestinationLanguage: string | null;
  } | null;
};

/**
 * Les langues parlées d'un échantillon de participants, canonicalisées
 * (`'en'`, `'EN'`, `'en-US'` comptent pour UNE) et triées. Site UNIQUE, que
 * l'aperçu anonyme et la carte partagent.
 */
export function spokenLanguagesOf(rows: readonly LanguageSampleRow[]): string[] {
  const declared = rows.flatMap((row) =>
    row.type === 'user' && row.user
      ? [row.user.systemLanguage, row.user.regionalLanguage, row.user.customDestinationLanguage]
      : [row.language]
  );
  const languages = declared
    .filter((code): code is string => typeof code === 'string' && code.trim().length > 0)
    .map((code) => normalizeLanguageForDedup(code));
  return Array.from(new Set(languages)).sort();
}

export function truncateCardText(text: string | null | undefined, max: number): string | null {
  const trimmed = text?.trim() ?? '';
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

type OpenableLink = {
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
  readonly maxUses: number | null;
  readonly currentUses: number;
};

/** Actif, non échu, non épuisé — les trois refus de l'aperçu anonyme. */
export function isShareLinkOpen(link: OpenableLink, now: Date): boolean {
  if (!link.isActive) return false;
  if (link.expiresAt && link.expiresAt < now) return false;
  if (link.maxUses && link.currentUses >= link.maxUses) return false;
  return true;
}

const cardConversationSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  avatar: true,
  banner: true
} as const;

const shareLinkCardSelect = {
  linkId: true,
  identifier: true,
  name: true,
  description: true,
  isActive: true,
  expiresAt: true,
  maxUses: true,
  currentUses: true,
  requireAccount: true,
  allowViewHistory: true,
  conversation: { select: cardConversationSelect },
  creator: { select: { displayName: true, username: true, avatar: true, isActive: true } }
} as const;

type CardConversation = {
  readonly id: string;
  readonly title: string | null;
  readonly description: string | null;
  readonly type: string;
  readonly avatar: string | null;
  readonly banner: string | null;
};

export type ShareLinkCardSource = {
  readonly linkId: string;
  readonly identifier: string;
  readonly name: string | null;
  readonly description: string | null;
  readonly isActive: boolean;
  readonly expiresAt: Date | null;
  readonly maxUses: number | null;
  readonly currentUses: number;
  readonly requireAccount: boolean;
  readonly allowViewHistory: boolean;
  readonly conversation: CardConversation;
  readonly creator: {
    readonly displayName: string | null;
    readonly username: string | null;
    readonly avatar: string | null;
    readonly isActive: boolean;
  } | null;
};

/**
 * Le lien par l'une de ses trois adresses : id de base, `linkId` (`mshy_…`) ou
 * `identifier` lisible — même résolution que `findShareLinkByIdentifier`.
 */
export async function loadShareLinkCardSource(
  prisma: PrismaClient,
  identifier: string
): Promise<ShareLinkCardSource | null> {
  const where = isValidMongoId(identifier)
    ? { id: identifier }
    : { OR: [{ linkId: identifier }, { identifier }] };
  return prisma.conversationShareLink.findFirst({ where, select: shareLinkCardSelect });
}

const sampleSelect = {
  type: true,
  language: true,
  userId: true,
  user: {
    select: {
      id: true,
      displayName: true,
      username: true,
      firstName: true,
      lastName: true,
      avatar: true,
      systemLanguage: true,
      regionalLanguage: true,
      customDestinationLanguage: true
    }
  }
} as const;

type SampleRow = LanguageSampleRow & {
  readonly userId: string | null;
  readonly user: (NonNullable<LanguageSampleRow['user']> & {
    readonly id: string;
    readonly displayName: string | null;
    readonly username: string | null;
    readonly firstName: string | null;
    readonly lastName: string | null;
    readonly avatar: string | null;
  }) | null;
};

async function loadParticipantSample(prisma: PrismaClient, conversationId: string): Promise<readonly SampleRow[]> {
  return prisma.participant.findMany({
    where: { conversationId, isActive: true },
    orderBy: { joinedAt: 'asc' },
    take: SPOKEN_LANGUAGES_SAMPLE_CAP,
    select: sampleSelect
  });
}

async function loadStats(params: {
  readonly prisma: PrismaClient;
  readonly conversationId: string;
  readonly withMessageCount: boolean;
}): Promise<{ readonly stats: ConversationCardStats; readonly sample: readonly SampleRow[] }> {
  const { prisma, conversationId, withMessageCount } = params;
  const [memberCount, sample, messageCount] = await Promise.all([
    prisma.participant.count({ where: { conversationId, isActive: true } }),
    loadParticipantSample(prisma, conversationId),
    withMessageCount ? prisma.message.count({ where: { conversationId, deletedAt: null } }) : Promise.resolve(null)
  ]);
  return {
    stats: { memberCount, onlineCount: null, messageCount, languages: spokenLanguagesOf(sample) },
    sample
  };
}

const EMPTY_STATS: ConversationCardStats = { memberCount: 0, onlineCount: null, messageCount: null, languages: [] };

function inviterOf(creator: ShareLinkCardSource['creator']): ConversationCardInviter | null {
  if (!creator || !creator.isActive) return null;
  const displayName = creator.displayName?.trim() || creator.username?.trim() || '';
  if (displayName.length === 0) return null;
  return { displayName, username: creator.username ?? null, avatarUrl: creator.avatar ?? null };
}

/**
 * La carte d'un lien de PARTAGE. `isMember` est le verdict de la route ;
 * l'identifiant de conversation n'est servi qu'à un membre.
 */
export async function composeShareLinkCard(params: {
  readonly prisma: PrismaClient;
  readonly link: ShareLinkCardSource;
  readonly isMember: boolean;
  readonly now: Date;
}): Promise<ConversationCard> {
  const { prisma, link, isMember, now } = params;
  const conversation = link.conversation;
  const open = isShareLinkOpen(link, now);
  const title = conversation.title?.trim() || link.name?.trim() || 'Conversation';
  const base = {
    kind: 'share-link' as const,
    conversationId: isMember ? conversation.id : null,
    title,
    avatarUrl: conversation.avatar ?? null,
    bannerUrl: conversation.banner ?? null,
    conversationType: conversation.type,
    link: { identifier: link.linkId, isActive: open, expiresAt: link.expiresAt?.toISOString() ?? null }
  };

  if (!open) {
    return {
      ...base,
      description: null,
      stats: EMPTY_STATS,
      viewer: { isMember, canJoin: false, requiresAccount: false, canJoinAnonymously: false },
      inviter: null,
      inviteMessage: null
    };
  }

  const { stats } = await loadStats({
    prisma,
    conversationId: conversation.id,
    withMessageCount: isMember || link.allowViewHistory
  });
  return {
    ...base,
    description: truncateCardText(conversation.description, CONVERSATION_CARD_DESCRIPTION_MAX),
    stats,
    viewer: {
      isMember,
      canJoin: !isMember,
      requiresAccount: !isMember && link.requireAccount,
      canJoinAnonymously: !isMember && !link.requireAccount
    },
    inviter: inviterOf(link.creator),
    inviteMessage: truncateCardText(link.description, CONVERSATION_CARD_INVITE_MESSAGE_MAX)
  };
}

/**
 * La carte d'un lien DIRECT — la route ne l'appelle qu'après avoir établi que
 * le lecteur est MEMBRE. Le titre d'une conversation sans titre (un tête-à-tête)
 * se compose des AUTRES membres, comme le détail de conversation.
 */
export async function composeDirectCard(params: {
  readonly prisma: PrismaClient;
  readonly conversationId: string;
  readonly viewerUserId: string | undefined;
}): Promise<ConversationCard | null> {
  const { prisma, conversationId, viewerUserId } = params;
  const conversation: CardConversation | null = await prisma.conversation.findFirst({
    where: { id: conversationId },
    select: cardConversationSelect
  });
  if (!conversation) return null;

  const { stats, sample } = await loadStats({ prisma, conversationId, withMessageCount: true });
  const others = sample
    .map((row) => row.user)
    .filter((user): user is NonNullable<SampleRow['user']> => user !== null && user.id !== viewerUserId);
  const title = conversation.title?.trim() || generateDefaultConversationTitle(
    others.map((user) => ({
      id: user.id,
      displayName: user.displayName ?? undefined,
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined
    })),
    viewerUserId ?? ''
  );
  const peerAvatar = conversation.type === 'direct' && others.length === 1 ? others[0]?.avatar ?? null : null;

  return {
    kind: 'direct',
    conversationId: conversation.id,
    title,
    description: truncateCardText(conversation.description, CONVERSATION_CARD_DESCRIPTION_MAX),
    avatarUrl: conversation.avatar ?? peerAvatar,
    bannerUrl: conversation.banner ?? null,
    conversationType: conversation.type,
    stats,
    viewer: { isMember: true, canJoin: false, requiresAccount: false, canJoinAnonymously: false },
    link: null,
    inviter: null,
    inviteMessage: null
  };
}
