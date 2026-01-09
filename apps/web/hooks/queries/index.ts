// Conversation queries
export {
  useConversationsQuery,
  useConversationsWithPagination,
  useConversationQuery,
  useInfiniteConversationsQuery,
  useCreateConversationMutation,
  useDeleteConversationMutation,
} from './use-conversations-query';

// Conversation pagination wrapper (drop-in replacement)
export { useConversationsPaginationRQ } from './use-conversations-pagination-rq';

// Message queries
export {
  useMessagesQuery,
  useInfiniteMessagesQuery,
  useMessagesQueryHelpers,
} from './use-messages-query';

// Message wrapper (drop-in replacement for useConversationMessages)
export { useConversationMessagesRQ } from './use-conversation-messages-rq';

// User queries
export {
  useCurrentUserQuery,
  useUserProfileQuery,
  useUserStatsQuery,
  useDashboardStatsQuery,
  useSearchUsersQuery,
  useUpdateUserProfileMutation,
} from './use-users-query';

// Notification queries
export {
  useNotificationsQuery,
  useInfiniteNotificationsQuery,
  useUnreadNotificationCountQuery,
  useNotificationCountsQuery,
  useMarkNotificationAsReadMutation,
  useMarkAllNotificationsAsReadMutation,
  useDeleteNotificationMutation,
  useDeleteAllReadNotificationsMutation,
} from './use-notifications-query';

// Message mutations
export {
  useSendMessageMutation,
  useEditMessageMutation,
  useDeleteMessageMutation,
  useMarkAsReadMutation,
} from './use-send-message-mutation';

// Socket cache sync
export {
  useSocketCacheSync,
  useInvalidateOnReconnect,
} from './use-socket-cache-sync';

// Reactions
export { useReactionsQuery } from './use-reactions-query';

// Notifications manager (drop-in replacement)
export { useNotificationsManagerRQ } from './use-notifications-manager-rq';
