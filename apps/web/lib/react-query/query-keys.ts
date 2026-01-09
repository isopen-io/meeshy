export const queryKeys = {
  conversations: {
    all: ['conversations'] as const,
    lists: () => [...queryKeys.conversations.all, 'list'] as const,
    list: (filters?: { type?: string; search?: string }) =>
      [...queryKeys.conversations.lists(), filters] as const,
    infinite: () => [...queryKeys.conversations.all, 'infinite'] as const,
    details: () => [...queryKeys.conversations.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.conversations.details(), id] as const,
    participants: (conversationId: string, filters?: { onlineOnly?: boolean; role?: string; search?: string }) =>
      [...queryKeys.conversations.detail(conversationId), 'participants', filters] as const,
  },

  messages: {
    all: ['messages'] as const,
    lists: () => [...queryKeys.messages.all, 'list'] as const,
    list: (conversationId: string) =>
      [...queryKeys.messages.lists(), conversationId] as const,
    infinite: (conversationId: string) =>
      [...queryKeys.messages.list(conversationId), 'infinite'] as const,
    detail: (conversationId: string, messageId: string) =>
      [...queryKeys.messages.list(conversationId), messageId] as const,
  },

  users: {
    all: ['users'] as const,
    current: () => [...queryKeys.users.all, 'current'] as const,
    details: () => [...queryKeys.users.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.users.details(), id] as const,
    profile: (userId: string) => [...queryKeys.users.detail(userId), 'profile'] as const,
    settings: () => [...queryKeys.users.current(), 'settings'] as const,
  },

  notifications: {
    all: ['notifications'] as const,
    lists: () => [...queryKeys.notifications.all, 'list'] as const,
    list: (filters?: { unreadOnly?: boolean }) =>
      [...queryKeys.notifications.lists(), filters] as const,
    unreadCount: () => [...queryKeys.notifications.all, 'unreadCount'] as const,
  },

  attachments: {
    all: ['attachments'] as const,
    detail: (id: string) => [...queryKeys.attachments.all, id] as const,
    upload: () => [...queryKeys.attachments.all, 'upload'] as const,
  },

  communities: {
    all: ['communities'] as const,
    lists: () => [...queryKeys.communities.all, 'list'] as const,
    detail: (id: string) => [...queryKeys.communities.all, id] as const,
    members: (communityId: string) =>
      [...queryKeys.communities.detail(communityId), 'members'] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
