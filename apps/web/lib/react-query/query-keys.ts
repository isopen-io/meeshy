export const queryKeys = {
  conversations: {
    all: ['conversations'] as const,
    // Pas de forme PLATE ici, volontairement. `['conversations','list']` a
    // existé, avec une dizaine d'écrivains et zéro lecteur : les deux préfixes
    // étant disjoints de `infinite()`, chaque écriture était un no-op silencieux
    // et le code se lisait comme si deux caches étaient tenus en phase. La
    // sidebar lit `infinite()`, et c'est le seul cache de liste.
    infinite: () => [...queryKeys.conversations.all, 'infinite'] as const,
    details: () => [...queryKeys.conversations.all, 'detail'] as const,
    detail: (id: string) => [...queryKeys.conversations.details(), id] as const,
    participants: (conversationId: string, filters?: { onlineOnly?: boolean; role?: string; search?: string }) =>
      [...queryKeys.conversations.detail(conversationId), 'participants', filters] as const,
    participantProfile: (conversationId: string, participantId: string) =>
      [...queryKeys.conversations.detail(conversationId), 'participant-profile', participantId] as const,
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
    list: (filters?: Record<string, unknown>) =>
      [...queryKeys.notifications.lists(), filters] as const,
    unreadCount: () => [...queryKeys.notifications.all, 'unreadCount'] as const,
    counts: () => [...queryKeys.notifications.all, 'counts'] as const,
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
    accepted: () => [...queryKeys.friendRequests.all, 'accepted'] as const,
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
    reelsFeed: (seed?: string) =>
      [...queryKeys.posts.lists(), 'reels', seed ?? 'foryou'] as const,
    hashtagsTrending: (limit?: number) =>
      [...queryKeys.posts.all, 'hashtags-trending', limit] as const,
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

  calls: {
    all: ['calls'] as const,
    active: (conversationId: string) =>
      [...queryKeys.calls.all, 'active', conversationId] as const,
  },
} as const;

export type QueryKeys = typeof queryKeys;
