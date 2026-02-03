// Export des services principaux
export { apiService, ApiService, ApiServiceError } from './api.service';
export { groupsService, GroupsService } from './groups.service';
export { conversationsService, ConversationsService } from './conversations.service';
export { usersService } from './users.service';
export { messagesService } from './messages.service';
export { mentionsService } from './mentions.service';
export { dashboardService } from './dashboard.service';

// Notifications
export { NotificationService } from './notification.service';

// Export des types - API Response types now come from shared
export type { ApiResponse, ApiError, ApiConfig, PaginationMeta } from '@meeshy/shared/types';
export type { ParticipantsFilters } from './conversations.service';
export type {
  CreateGroupDto,
  UpdateGroupDto,
  InviteMemberDto,
  GroupFilters,
  GroupsResponse,
} from './groups.service';

// Notification types from @/types/notification
export type {
  Notification,
  NotificationType,
  NotificationPriority,
  NotificationFilters,
  NotificationCounts,
  NotificationPreferences,
  NotificationPaginatedResponse,
  NotificationStats,
} from '@/types/notification';

export type { UserStats, UpdateUserDto } from './users.service';
export type { Message, CreateMessageDto, UpdateMessageDto } from './messages.service';
export type { MentionSuggestionsParams, MentionSuggestionsResponse, MentionItem, UserMention } from './mentions.service';
export type { DashboardStats, DashboardData, DashboardGroup, ShareLink } from './dashboard.service';

// Service de traduction unifié
export { translationService, default as TranslationService } from './translation.service';
export type { TranslationResult, TranslationRequest, TranslationError } from './translation.service';

