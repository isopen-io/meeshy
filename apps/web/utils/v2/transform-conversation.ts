/**
 * Transformers for V2 Messaging
 *
 * Transforms backend Conversation types to frontend V2 ConversationItemData format.
 */

import type { Conversation, Message } from '@meeshy/shared/types';
import { classifyRelativeTime } from '@meeshy/shared/utils/relative-time';
import { getUserDisplayNameOrNull } from '@/utils/user-display-name';
import type { ConversationItemData, ConversationTag } from '@/components/v2';

export type TranslateFn = (key: string, params?: Record<string, unknown>) => string;

export interface TransformConversationOptions {
  typingUserIds?: Set<string>;
  onlineUserIds?: Set<string>;
  currentUserId?: string;
  t: TranslateFn;
  locale: string;
}

/**
 * Format a timestamp to relative time string
 * (i18n keys under `conversations.timeCompact`, aligned with iOS `time.short.*`)
 */
function formatRelativeTime(
  date: Date | string | undefined,
  t: TranslateFn,
  locale: string
): string {
  if (!date) return '';

  const messageDate = typeof date === 'string' ? new Date(date) : date;
  const bucket = classifyRelativeTime(messageDate.getTime(), Date.now());

  switch (bucket.unit) {
    case 'now':
      return t('timeCompact.now');
    case 'minutes':
      return t('timeCompact.minutes', { count: bucket.value });
    case 'hours':
      return t('timeCompact.hours', { count: bucket.value });
    case 'days':
      return t('timeCompact.days', { count: bucket.value });
    case 'beyond':
      // Format as date for older messages
      return messageDate.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
      });
  }
}

/**
 * Determine the message type based on content and attachments
 */
function getMessageType(
  message: Message
): 'text' | 'photo' | 'file' | 'voice' {
  if (message.attachments?.length) {
    const firstAttachment = message.attachments[0];
    const mimeType = firstAttachment.mimeType || '';

    if (mimeType.startsWith('image/')) return 'photo';
    if (mimeType.startsWith('audio/')) return 'voice';
    return 'file';
  }

  return 'text';
}

/**
 * Transform backend tags to frontend ConversationTag format
 */
function transformTags(tags?: readonly { id: string; name: string; color?: string }[]): ConversationTag[] {
  if (!tags) return [];
  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: tag.color || '#6B7280',
  }));
}

/**
 * Transform a backend Conversation to frontend ConversationItemData format
 */
export function transformToConversationItem(
  conversation: Conversation,
  options: TransformConversationOptions
): ConversationItemData {
  const { typingUserIds = new Set(), onlineUserIds = new Set(), currentUserId, t, locale } = options;

  const isGroup = conversation.type === 'group' || conversation.type === 'public' || conversation.type === 'global';
  const participants = conversation.participants ?? [];
  const otherMembers = participants.filter((m) => m.userId !== currentUserId);

  // Determine name and language
  let name: string;
  let languageCode: string;
  let avatar: string | undefined;

  if (isGroup) {
    name = conversation.title || 'Groupe';
    languageCode = 'multi';
    avatar = conversation.image || conversation.avatar;
  } else {
    const otherMember = otherMembers[0];
    const otherUser = otherMember?.user as any;
    // Canonical name resolution (displayName > firstName+lastName > username)
    // via the SSOT `getUserDisplayName`. The prior inline chain preferred
    // `username` over the real name and never used `lastName`, showing cryptic
    // handles for users without a custom displayName. Participant-level
    // fallbacks (member displayName/nickname, conversation title) are preserved.
    name =
      getUserDisplayNameOrNull(otherUser) ||
      otherMember?.displayName ||
      (otherMember as any)?.nickname ||
      conversation.title ||
      'Utilisateur';
    languageCode = otherUser?.systemLanguage || otherUser?.regionalLanguage || 'fr';
    avatar = otherUser?.avatar || otherMember?.avatar;
  }

  // Check if online (direct conversations only)
  const isOnline = !isGroup && otherMembers.some((m) => m.userId && onlineUserIds.has(m.userId));

  // Transform lastMessage
  const lastMessage = conversation.lastMessage;
  const lastMessageData = lastMessage
    ? {
        content: lastMessage.content || '',
        type: getMessageType(lastMessage),
        attachmentCount: lastMessage.attachments?.length,
        timestamp: formatRelativeTime(lastMessage.createdAt, t, locale),
        senderName: isGroup
          ? (getUserDisplayNameOrNull(lastMessage.sender as any) ?? undefined)
          : undefined,
      }
    : {
        content: '',
        type: 'text' as const,
        timestamp: formatRelativeTime(conversation.createdAt, t, locale),
      };

  // Check if someone is typing
  const isTyping = otherMembers.some((m) => m.userId && typingUserIds.has(m.userId));

  // Check for anonymous participants
  const hasAnonymousParticipants = participants.some((m) => m.type === 'anonymous');

  // Get user preferences if available
  const userPrefs = conversation.userPreferences as {
    isPinned?: boolean;
    isImportant?: boolean;
    isMuted?: boolean;
    categoryId?: string;
    draft?: string;
  } | undefined;

  return {
    id: conversation.id,
    name,
    avatar,
    languageCode,
    isOnline,
    isPinned: userPrefs?.isPinned ?? false,
    isImportant: userPrefs?.isImportant ?? false,
    isMuted: userPrefs?.isMuted ?? false,
    isGroup,
    participantCount: isGroup ? conversation.memberCount || participants.length : undefined,
    hasAnonymousParticipants: isGroup ? hasAnonymousParticipants : undefined,
    tags: transformTags((conversation as any).tags),
    categoryId: userPrefs?.categoryId,
    unreadCount: conversation.unreadCount ?? 0,
    lastMessage: lastMessageData,
    draft: userPrefs?.draft,
    isTyping,
  };
}

/**
 * Transform multiple conversations at once
 */
export function transformConversations(
  conversations: Conversation[],
  options: TransformConversationOptions
): ConversationItemData[] {
  return conversations.map((conv) => transformToConversationItem(conv, options));
}

/**
 * Group conversations by category
 */
export interface GroupedConversations {
  pinned: ConversationItemData[];
  categorized: Map<string, ConversationItemData[]>;
  uncategorized: ConversationItemData[];
}

export function groupConversationsByCategory(
  conversations: ConversationItemData[]
): GroupedConversations {
  const pinned: ConversationItemData[] = [];
  const categorized = new Map<string, ConversationItemData[]>();
  const uncategorized: ConversationItemData[] = [];

  conversations.forEach((conv) => {
    if (conv.isPinned) {
      pinned.push(conv);
    } else if (conv.categoryId) {
      const existing = categorized.get(conv.categoryId) || [];
      categorized.set(conv.categoryId, [...existing, conv]);
    } else {
      uncategorized.push(conv);
    }
  });

  return { pinned, categorized, uncategorized };
}
