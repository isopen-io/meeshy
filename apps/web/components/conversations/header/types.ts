import type {
  Conversation,
  SocketIOUser as User,
  ThreadMember
} from '@meeshy/shared/types';
import type { UserRoleEnum } from '@meeshy/shared/types';
import type { UserStatus } from '@/lib/user-status';

export interface ConversationHeaderProps {
  conversation: Conversation;
  currentUser: User;
  conversationParticipants: ThreadMember[];
  typingUsers: Array<{ userId: string; username: string; conversationId: string; timestamp: number }>;
  isMobile: boolean;
  onBackToList: () => void;
  onParticipantRemoved: (userId: string) => void;
  onParticipantAdded: (userId: string) => void;
  onLinkCreated: (link: any) => void;
  onStartCall?: () => void;
  onOpenGallery?: () => void;
  t: (key: string) => string;
  showBackButton?: boolean;
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
  status: UserStatus;
  isAnonymous: boolean;
  role: UserRoleEnum;
}

export interface EncryptionInfo {
  icon: any;
  color: string;
  bgColor: string;
  label: string;
}
