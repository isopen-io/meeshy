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

// Conversation preferences
export {
  useConversationPreferencesQuery,
  useCategoriesQuery,
  usePreferencesMap,
  useTogglePinMutation,
  useToggleMuteMutation,
  useToggleArchiveMutation,
  useSetReactionMutation,
} from './use-conversation-preferences-query';

// Reactions
export { useReactionsQuery } from './use-reactions-query';

// Notifications manager (drop-in replacement)
export { useNotificationsManagerRQ } from './use-notifications-manager-rq';

// User preferences (typed wrappers around usePreferences)
export {
  useNotificationPrefs,
  usePrivacyPrefs,
  useAudioPrefs,
  useVideoPrefs,
  useMessagePrefs,
  useDocumentPrefs,
  useApplicationPrefs,
} from './use-preferences-queries';

// Community queries
export {
  useCommunitiesQuery,
  useCommunityQuery,
  useCommunitySearchQuery,
  useCommunityConversationsQuery,
  useCommunityMembersQuery,
  useCheckIdentifierQuery,
  useCreateCommunityMutation,
  useUpdateCommunityMutation,
  useDeleteCommunityMutation,
  useJoinCommunityMutation,
  useLeaveCommunityMutation,
  useAddMemberMutation,
  useRemoveMemberMutation,
  useUpdateMemberRoleMutation,
} from './use-communities-query';

// Community preferences queries
export {
  useCommunityPreferencesQuery,
  useCommunityPreferencesListQuery,
  useUpdateCommunityPreferencesMutation,
  useDeleteCommunityPreferencesMutation,
  useReorderCommunitiesMutation,
} from './use-community-preferences-query';
