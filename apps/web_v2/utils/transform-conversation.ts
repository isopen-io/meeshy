/**
 * Transformers for V2 Messaging
 *
 * Transforms backend Conversation types to frontend V2 ConversationItemData format.
 */

import type { Conversation, Message } from '@meeshy/shared/types';
import type { ConversationItemData, ConversationTag } from '@/components';

export interface TransformConversationOptions {
  typingUserIds?: Set<string>;
  onlineUserIds?: Set<string>;
  currentUserId?: string;
}

/**
 * Format a timestamp to relative time string
 */
function formatRelativeTime(date: Date | string | undefined): string {
  if (!date) return '';

  const now = new Date();
  const messageDate = typeof date === 'string' ? new Date(date) : date;
  const diffMs = now.getTime() - messageDate.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'maintenant';
  if (diffMins < 60) return `${diffMins}min`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}j`;

  // Format as date for older messages
  return messageDate.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
  });
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
  options: TransformConversationOptions = {}
): ConversationItemData {
  const { typingUserIds = new Set(), onlineUserIds = new Set(), currentUserId } = options;

  const isGroup = conversation.type === 'group' || conversation.type === 'public' || conversation.type === 'global';
  const members = conversation.members ?? [];
  const otherMembers = members.filter((m) => m.userId !== currentUserId);

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
    name =
      otherUser?.displayName ||
      otherUser?.username ||
      otherUser?.firstName ||
      'Utilisateur';
    languageCode = otherUser?.systemLanguage || otherUser?.regionalLanguage || 'fr';
    avatar = otherUser?.avatar;
  }

  // Check if online (direct conversations only)
  const isOnline = !isGroup && otherMembers.some((m) => onlineUserIds.has(m.userId));

  // Transform lastMessage
  const lastMessage = conversation.lastMessage;
  const lastMessageData = lastMessage
    ? {
        content: lastMessage.content || '',
        type: getMessageType(lastMessage),
        attachmentCount: lastMessage.attachments?.length,
        timestamp: formatRelativeTime(lastMessage.createdAt),
        senderName: isGroup ? (lastMessage.sender as any)?.displayName : undefined,
      }
    : {
        content: '',
        type: 'text' as const,
        timestamp: formatRelativeTime(conversation.createdAt),
      };

  // Check if someone is typing
  const isTyping = otherMembers.some((m) => typingUserIds.has(m.userId));

  // Check for anonymous participants
  const hasAnonymousParticipants = members.some((m) => (m as any).isAnonymous);

  // Get user preferences if available
  const userPrefs = conversation.userPreferences;

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
    participantCount: isGroup ? conversation.memberCount || members.length : undefined,
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
  options: TransformConversationOptions = {}
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
