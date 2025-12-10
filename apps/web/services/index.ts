// Export des services principaux
export { apiService, ApiService, ApiServiceError } from './api.service';
export { groupsService, GroupsService } from './groups.service';
export { conversationsService, ConversationsService } from './conversations.service';
export { notificationsService } from './notifications.service';
export { usersService } from './users.service';
export { messagesService } from './messages.service';
export { mentionsService } from './mentions.service';
export { dashboardService } from './dashboard.service';

// Export des types
export type { ApiResponse, ApiError, ApiConfig } from './api.service';
export type { ParticipantsFilters } from './conversations.service';
export type {
  CreateGroupDto,
  UpdateGroupDto,
  InviteMemberDto,
  GroupFilters,
  GroupsResponse,
} from './groups.service';
export type { Notification, NotificationPreferences } from './notifications.service';
export type { UserStats, UpdateUserDto } from './users.service';
export type { Message, CreateMessageDto, UpdateMessageDto } from './messages.service';
export type { MentionSuggestionsParams, MentionSuggestionsResponse, MentionItem, UserMention } from './mentions.service';
export type { DashboardStats, DashboardData, DashboardGroup, ShareLink } from './dashboard.service';

// Service de traduction unifié
export { translationService, default as TranslationService } from './translation.service';
export type { TranslationResult, TranslationRequest, TranslationError } from './translation.service';

// Service mock pour les tests

