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
    statusDetails: (messageId: string) =>
      [...queryKeys.messages.all, 'status-details', messageId] as const,
  },

  users: {
    all: ['users'] as const,
    current: () => [...queryKeys.users.all, 'current'] as const,
    details: () => [...queryKeys.users.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.users.details(), id] as const,
    profile: (userId: string) => [...queryKeys.users.detail(userId), 'profile'] as const,
    settings: () => [...queryKeys.users.current(), 'settings'] as const,
  },

  preferences: {
    all: ['user-preferences'] as const,
    category: (category: string) => [...queryKeys.preferences.all, category] as const,
    conversations: () => [...queryKeys.preferences.all, 'conversations'] as const,
    conversation: (conversationId: string) =>
      [...queryKeys.preferences.conversations(), conversationId] as const,
    categories: () => [...queryKeys.preferences.all, 'categories'] as const,
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
    list: (filters?: { search?: string }) =>
      [...queryKeys.communities.lists(), filters] as const,
    search: (query: string) =>
      [...queryKeys.communities.all, 'search', query] as const,
    detail: (id: string) => [...queryKeys.communities.all, id] as const,
    members: (communityId: string) =>
      [...queryKeys.communities.detail(communityId), 'members'] as const,
    conversations: (communityId: string) =>
      [...queryKeys.communities.detail(communityId), 'conversations'] as const,
    identifierCheck: (identifier: string) =>
      [...queryKeys.communities.all, 'identifier-check', identifier] as const,
    preferences: {
      all: [...['communities'], 'preferences'] as const,
      detail: (communityId: string) =>
        ['communities', 'preferences', communityId] as const,
      list: () => ['communities', 'preferences', 'list'] as const,
    },
  },

  friendRequests: {
    all: ['friendRequests'] as const,
    received: () => [...queryKeys.friendRequests.all, 'received'] as const,
    sent: () => [...queryKeys.friendRequests.all, 'sent'] as const,
  },

  blockedUsers: {
    all: ['blockedUsers'] as const,
    list: () => [...queryKeys.blockedUsers.all, 'list'] as const,
  },

  stories: {
    all: ['stories'] as const,
    feed: () => [...queryKeys.stories.all, 'feed'] as const,
    viewers: (storyId: string) => [...queryKeys.stories.all, 'viewers', storyId] as const,
  },

  posts: {
    all: ['posts'] as const,
    lists: () => [...queryKeys.posts.all, 'list'] as const,
    feed: (filters?: { type?: string }) =>
      [...queryKeys.posts.lists(), 'feed', filters] as const,
    infinite: (type?: string) =>
      [...queryKeys.posts.lists(), 'infinite', type] as const,
    details: () => [...queryKeys.posts.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.posts.details(), id] as const,
    comments: (postId: string) =>
      [...queryKeys.posts.detail(postId), 'comments'] as const,
    commentsInfinite: (postId: string) =>
      [...queryKeys.posts.comments(postId), 'infinite'] as const,
    commentReplies: (postId: string, commentId: string) =>
      [...queryKeys.posts.comments(postId), 'replies', commentId] as const,
    bookmarks: () => [...queryKeys.posts.lists(), 'bookmarks'] as const,
    userPosts: (userId: string) =>
      [...queryKeys.posts.lists(), 'user', userId] as const,
    communityPosts: (communityId: string) =>
      [...queryKeys.posts.lists(), 'community', communityId] as const,
    stories: () => [...queryKeys.posts.lists(), 'stories'] as const,
    statuses: () => [...queryKeys.posts.lists(), 'statuses'] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
