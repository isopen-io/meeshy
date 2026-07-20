import type {
  Conversation,
  SocketIOUser as User,
} from '@meeshy/shared/types';
import type { Participant } from '@meeshy/shared/types/participant';
import type { UserRoleEnum } from '@meeshy/shared/types';
import type { PresenceSource } from '../conversation-item/ParticipantPresenceIndicator';

export interface ConversationHeaderProps {
  conversation: Conversation;
  currentUser: User;
  conversationParticipants: Participant[];
  typingUsers: Array<{ userId: string; username: string; conversationId: string; timestamp: number }>;
  isMobile: boolean;
  onBackToList: () => void;
  onParticipantRemoved: (userId: string) => void;
  onParticipantAdded: (userId: string) => void;
  onLinkCreated: (link: unknown) => void;
  onStartCall?: (type?: 'audio' | 'video') => void;
  onOpenGallery?: () => void;
  onOpenSearch?: () => void;
  t: (key: string, fallback?: string) => string;
  showBackButton?: boolean;
  otherUnreadCount?: number;
}

export interface HeaderPreferences {
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  customName?: string;
  tags: string[];
  categoryName?: string;
  isLoading: boolean;
}

export interface HeaderActions {
  onTogglePin: () => Promise<void>;
  onToggleMute: () => Promise<void>;
  onToggleArchive: () => Promise<void>;
  onShareConversation: () => Promise<void>;
  onImageUpload: (file: File) => Promise<void>;
}

export interface ParticipantInfo {
  name: string;
  avatar: string;
  avatarUrl?: string;
  otherUserId?: string;
  presenceFallback?: PresenceSource | null;
  isAnonymous: boolean;
  role: UserRoleEnum;
}

export interface EncryptionInfo {
  icon: unknown;
  color: string;
  bgColor: string;
  label: string;
}
