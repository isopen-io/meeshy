# Plan 5: Notifications List, User Stats, Affiliates, Search Corrections, Thread View, Contact Share, Empty States, Final Coherence

## Goal

Deliver the final set of iOS features to complete the Meeshy mobile experience: a full notification center, personal stats dashboard, affiliate management, search improvements, thread view for replies, contact sharing in messages, empty states across all screens, and a coherence audit across all 5 sprint plans.

## Architecture Overview

```
Backend (services/gateway)
  GET  /notifications              -- Already exists (secured version)
  GET  /notifications/unread-count -- Already exists
  PATCH /notifications/:id/read    -- Already exists
  PATCH /notifications/read-all    -- Already exists
  DELETE /notifications/:id        -- Already exists
  GET  /users/:userId/stats        -- Already exists (preferences.ts)
  NEW: GET  /users/me/stats        -- Shorthand for current user's extended stats
  NEW: GET  /users/me/stats/timeline -- Daily activity for 7/30 days
  NEW: GET  /users/me/stats/achievements -- Computed badges
  GET  /affiliate/tokens           -- Already exists
  POST /affiliate/tokens           -- Already exists
  GET  /affiliate/stats            -- Already exists
  DELETE /affiliate/tokens/:id     -- Already exists
  GET  /communities/search         -- Already exists

SDK (packages/MeeshySDK)
  Models:  NotificationModels.swift (NEW), StatsModels.swift (NEW), AffiliateModels.swift (NEW)
  Services: NotificationService.swift (NEW), StatsService.swift (NEW), AffiliateService.swift (NEW)

UI (packages/MeeshyUI + apps/ios)
  MeeshyUI: NotificationRowView.swift, ContactMessageView.swift (NEW primitives)
  apps/ios: NotificationListView, NotificationListViewModel, UserStatsView, StatsTimelineChart,
            AchievementBadgeView, AffiliateView, AffiliateCreateView, AffiliateStatsView,
            ThreadView, DataExportView
  Search:   GlobalSearchViewModel corrections + community tab
  Empty:    EmptyStateView integration in FeedView, NotificationListView
```

## Tech Stack

- **Backend**: Fastify 5 + Prisma + MongoDB + Zod + TypeScript
- **SDK**: Swift 5.9, async/await, Combine, SPM
- **UI**: SwiftUI (iOS 17+), SwiftUI Charts, MeeshyUI design tokens
- **Real-time**: Socket.IO `notification:new` events

---

## Task Group A: Backend -- User Stats Endpoints

### Task A1: GET /users/me/stats -- Personal Aggregated Stats

**File**: `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/users/preferences.ts`

The existing `getUserStats` at `/users/:userId/stats` (line 342) computes messagesSent, messagesReceived, conversationsCount, groupsCount, and lastActivity dynamically from Prisma queries. It also has a `UserStats` Prisma model (schema line 1174) with denormalized counters for messagesSent, messagesReceived, charactersTyped, imageMessagesSent, filesShared, conversationsJoined, communitiesCreated, friendsAdded, friendRequestsSent, translationsUsed, languagesDetected, autoTranslateTimeMinutes, totalOnlineTimeMinutes, sessionCount.

**Step 1**: Add a new endpoint `GET /users/me/stats` that is a shorthand for the current user and returns the richer `UserStats` model plus computed fields.

```typescript
// In preferences.ts, add after getUserStats:

const meStatsResponseSchema = z.object({
  messagesSent: z.number(),
  messagesReceived: z.number(),
  conversationsCount: z.number(),
  groupsCount: z.number(),
  translationsUsed: z.number(),
  languagesDetected: z.number(),
  friendsAdded: z.number(),
  communitiesCreated: z.number(),
  totalOnlineTimeMinutes: z.number(),
  sessionCount: z.number(),
  memberSince: z.string().datetime(),
  lastActivity: z.string().datetime(),
});

export async function getMyStats(fastify: FastifyInstance) {
  fastify.get('/users/me/stats', {
    onRequest: [fastify.authenticate],
    schema: { /* ... with meStatsResponseSchema */ }
  }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).authContext;
    
    // Fetch UserStats model (denormalized) + live counts in parallel
    const [userStats, user, liveConvCount, liveGroupCount, liveMsgSent, liveMsgReceived] = await Promise.all([
      fastify.prisma.userStats.findUnique({ where: { userId } }),
      fastify.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true, lastActiveAt: true } }),
      fastify.prisma.conversationMember.count({ where: { userId, isActive: true, conversation: { type: { not: 'global' } } } }),
      fastify.prisma.conversationMember.count({ where: { userId, isActive: true, conversation: { type: 'group' } } }),
      fastify.prisma.message.count({ where: { senderId: userId, isDeleted: false } }),
      // For received, scope to user's conversations
      (async () => {
        const convIds = (await fastify.prisma.conversationMember.findMany({
          where: { userId, isActive: true },
          select: { conversationId: true }
        })).map(cm => cm.conversationId);
        return fastify.prisma.message.count({
          where: { conversationId: { in: convIds }, senderId: { not: userId }, isDeleted: false }
        });
      })()
    ]);

    return reply.send({
      success: true,
      data: {
        messagesSent: liveMsgSent,
        messagesReceived: liveMsgReceived,
        conversationsCount: liveConvCount,
        groupsCount: liveGroupCount,
        translationsUsed: userStats?.translationsUsed ?? 0,
        languagesDetected: userStats?.languagesDetected ?? 0,
        friendsAdded: userStats?.friendsAdded ?? 0,
        communitiesCreated: userStats?.communitiesCreated ?? 0,
        totalOnlineTimeMinutes: userStats?.totalOnlineTimeMinutes ?? 0,
        sessionCount: userStats?.sessionCount ?? 0,
        memberSince: user?.createdAt.toISOString(),
        lastActivity: user?.lastActiveAt?.toISOString() ?? user?.createdAt.toISOString(),
      }
    });
  });
}
```

**Step 2**: Register in `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/users/index.ts` by importing and calling `await getMyStats(fastify)`.

### Task A2: GET /users/me/stats/timeline -- Daily Activity Over 7/30 Days

**File**: Same preferences.ts

```typescript
export async function getMyStatsTimeline(fastify: FastifyInstance) {
  fastify.get('/users/me/stats/timeline', {
    onRequest: [fastify.authenticate],
    schema: {
      querystring: {
        type: 'object',
        properties: {
          days: { type: 'number', enum: [7, 30], default: 7 }
        }
      }
    }
  }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).authContext;
    const { days = 7 } = request.query as { days?: number };
    const since = new Date(Date.now() - days * 86400000);

    // Group messages by day using raw aggregation
    const messages = await fastify.prisma.message.findMany({
      where: { senderId: userId, isDeleted: false, createdAt: { gte: since } },
      select: { createdAt: true }
    });

    // Build day-by-day map
    const timeline: Record<string, number> = {};
    for (let d = 0; d < days; d++) {
      const date = new Date(Date.now() - d * 86400000);
      const key = date.toISOString().slice(0, 10); // YYYY-MM-DD
      timeline[key] = 0;
    }
    for (const msg of messages) {
      const key = msg.createdAt.toISOString().slice(0, 10);
      if (timeline[key] !== undefined) timeline[key]++;
    }

    const data = Object.entries(timeline)
      .map(([date, count]) => ({ date, messagesSent: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return reply.send({ success: true, data });
  });
}
```

### Task A3: GET /users/me/stats/achievements -- Computed Badges

**File**: Same preferences.ts

Achievement types are computed server-side from the UserStats model and live counts. No additional DB model needed.

```typescript
type AchievementType =
  | 'polyglot'       // 3+ languages detected
  | 'social_butterfly' // 10+ conversations joined
  | 'chatterbox'     // 1000+ messages sent
  | 'early_adopter'  // registered in first 30 days of platform
  | 'community_builder' // created 1+ community
  | 'translator'     // 50+ translations used
  | 'loyal_user'     // 30+ sessions
  | 'night_owl'      // 100+ minutes online
  | 'connector'      // 10+ friends added
  | 'media_maven';   // 50+ image messages sent

export async function getMyAchievements(fastify: FastifyInstance) {
  fastify.get('/users/me/stats/achievements', {
    onRequest: [fastify.authenticate]
  }, async (request, reply) => {
    const { userId } = (request as AuthenticatedRequest).authContext;
    
    const [userStats, user, convCount, msgSent] = await Promise.all([
      fastify.prisma.userStats.findUnique({ where: { userId } }),
      fastify.prisma.user.findUnique({ where: { id: userId }, select: { createdAt: true } }),
      fastify.prisma.conversationMember.count({ where: { userId, isActive: true } }),
      fastify.prisma.message.count({ where: { senderId: userId, isDeleted: false } })
    ]);

    const s = userStats;
    const achievements = [
      { type: 'polyglot', unlocked: (s?.languagesDetected ?? 0) >= 3, progress: Math.min((s?.languagesDetected ?? 0) / 3, 1) },
      { type: 'social_butterfly', unlocked: convCount >= 10, progress: Math.min(convCount / 10, 1) },
      { type: 'chatterbox', unlocked: msgSent >= 1000, progress: Math.min(msgSent / 1000, 1) },
      { type: 'early_adopter', unlocked: user ? (user.createdAt < new Date('2026-04-01')) : false, progress: user ? 1 : 0 },
      { type: 'community_builder', unlocked: (s?.communitiesCreated ?? 0) >= 1, progress: Math.min((s?.communitiesCreated ?? 0) / 1, 1) },
      { type: 'translator', unlocked: (s?.translationsUsed ?? 0) >= 50, progress: Math.min((s?.translationsUsed ?? 0) / 50, 1) },
      { type: 'loyal_user', unlocked: (s?.sessionCount ?? 0) >= 30, progress: Math.min((s?.sessionCount ?? 0) / 30, 1) },
      { type: 'night_owl', unlocked: (s?.totalOnlineTimeMinutes ?? 0) >= 100, progress: Math.min((s?.totalOnlineTimeMinutes ?? 0) / 100, 1) },
      { type: 'connector', unlocked: (s?.friendsAdded ?? 0) >= 10, progress: Math.min((s?.friendsAdded ?? 0) / 10, 1) },
      { type: 'media_maven', unlocked: (s?.imageMessagesSent ?? 0) >= 50, progress: Math.min((s?.imageMessagesSent ?? 0) / 50, 1) },
    ];

    return reply.send({ success: true, data: achievements });
  });
}
```

**Verification**: Run `curl http://localhost:3000/users/me/stats` with auth header. Confirm JSON shape.

---

## Task Group B: Notification List (SDK + iOS)

### Task B1: NotificationModels.swift (MeeshySDK)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift`

The existing file at this path only has device token models (RegisterDeviceTokenRequest, etc.). It must be REPLACED with full notification models. The device token models should be moved or kept alongside.

The shared type `packages/shared/types/notification.ts` defines `NotificationTypeEnum` with 70+ values grouped into categories. The iOS SDK should mirror the most important ones (not all 70+, but a grouped subset).

```swift
import Foundation

// MARK: - Notification Type

public enum MeeshyNotificationType: String, Codable, CaseIterable {
    // Messages
    case newMessage = "new_message"
    case messageReply = "message_reply"
    case messageEdited = "message_edited"
    case messagePinned = "message_pinned"
    case messageForwarded = "message_forwarded"
    
    // Conversations
    case newConversation = "new_conversation"
    case addedToConversation = "added_to_conversation"
    case removedFromConversation = "removed_from_conversation"
    
    // Members
    case memberJoined = "member_joined"
    case memberLeft = "member_left"
    case memberPromoted = "member_promoted"
    
    // Contacts
    case friendRequest = "friend_request"
    case friendAccepted = "friend_accepted"
    case contactBlocked = "contact_blocked"
    
    // Interactions
    case userMentioned = "user_mentioned"
    case messageReaction = "message_reaction"
    
    // Social
    case postLike = "post_like"
    case postComment = "post_comment"
    case postRepost = "post_repost"
    case storyReaction = "story_reaction"
    case commentLike = "comment_like"
    case commentReply = "comment_reply"
    
    // Calls
    case missedCall = "missed_call"
    case callEnded = "call_ended"
    
    // Translation
    case translationReady = "translation_ready"
    case voiceCloneReady = "voice_clone_ready"
    
    // Security
    case securityAlert = "security_alert"
    case loginNewDevice = "login_new_device"
    case passwordChanged = "password_changed"
    
    // Community
    case communityInvite = "community_invite"
    case communityAnnouncement = "community_announcement"
    
    // System
    case system = "system"
    case maintenance = "maintenance"
    case updateAvailable = "update_available"
    
    // Gamification
    case achievementUnlocked = "achievement_unlocked"
    case badgeEarned = "badge_earned"
    
    case unknown
    
    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        let raw = try container.decode(String.self)
        self = MeeshyNotificationType(rawValue: raw) ?? .unknown
    }
    
    // MARK: - Display Properties
    
    public var icon: String {
        switch self {
        case .newMessage, .messageReply, .messageEdited, .messageForwarded: return "bubble.left.fill"
        case .messagePinned: return "pin.fill"
        case .newConversation, .addedToConversation: return "bubble.left.and.bubble.right.fill"
        case .removedFromConversation: return "person.fill.xmark"
        case .memberJoined: return "person.badge.plus"
        case .memberLeft: return "person.badge.minus"
        case .memberPromoted: return "star.fill"
        case .friendRequest: return "person.badge.plus"
        case .friendAccepted: return "person.2.fill"
        case .contactBlocked: return "hand.raised.fill"
        case .userMentioned: return "at"
        case .messageReaction: return "face.smiling.fill"
        case .postLike, .commentLike: return "heart.fill"
        case .postComment, .commentReply: return "text.bubble.fill"
        case .postRepost: return "arrow.2.squarepath"
        case .storyReaction: return "sparkles"
        case .missedCall: return "phone.down.fill"
        case .callEnded: return "phone.fill"
        case .translationReady: return "globe"
        case .voiceCloneReady: return "waveform"
        case .securityAlert, .loginNewDevice: return "shield.fill"
        case .passwordChanged: return "lock.fill"
        case .communityInvite: return "person.3.fill"
        case .communityAnnouncement: return "megaphone.fill"
        case .system, .maintenance: return "gearshape.fill"
        case .updateAvailable: return "arrow.down.app.fill"
        case .achievementUnlocked, .badgeEarned: return "trophy.fill"
        case .unknown: return "bell.fill"
        }
    }
    
    public var color: String {
        switch self {
        case .newMessage, .messageReply, .messageEdited, .messageForwarded, .messagePinned: return "4ECDC4"
        case .newConversation, .addedToConversation, .removedFromConversation: return "3498DB"
        case .memberJoined, .memberLeft, .memberPromoted: return "2ECC71"
        case .friendRequest, .friendAccepted: return "9B59B6"
        case .contactBlocked: return "FF6B6B"
        case .userMentioned: return "F8B500"
        case .messageReaction, .storyReaction: return "FF2E63"
        case .postLike, .commentLike: return "FF6B6B"
        case .postComment, .postRepost, .commentReply: return "45B7D1"
        case .missedCall, .callEnded: return "E74C3C"
        case .translationReady, .voiceCloneReady: return "08D9D6"
        case .securityAlert, .loginNewDevice, .passwordChanged: return "E91E63"
        case .communityInvite, .communityAnnouncement: return "A855F7"
        case .system, .maintenance, .updateAvailable: return "95A5A6"
        case .achievementUnlocked, .badgeEarned: return "F8B500"
        case .unknown: return "95A5A6"
        }
    }
    
    public var category: NotificationCategory {
        switch self {
        case .newMessage, .messageReply, .messageEdited, .messagePinned, .messageForwarded: return .messages
        case .newConversation, .addedToConversation, .removedFromConversation: return .conversations
        case .memberJoined, .memberLeft, .memberPromoted: return .members
        case .friendRequest, .friendAccepted, .contactBlocked: return .contacts
        case .userMentioned, .messageReaction: return .interactions
        case .postLike, .postComment, .postRepost, .storyReaction, .commentLike, .commentReply: return .social
        case .missedCall, .callEnded: return .calls
        case .translationReady, .voiceCloneReady: return .translation
        case .securityAlert, .loginNewDevice, .passwordChanged: return .security
        case .communityInvite, .communityAnnouncement: return .community
        case .system, .maintenance, .updateAvailable: return .system
        case .achievementUnlocked, .badgeEarned: return .gamification
        case .unknown: return .system
        }
    }
}

public enum NotificationCategory: String, CaseIterable {
    case messages, conversations, members, contacts, interactions
    case social, calls, translation, security, community, system, gamification
}

// MARK: - Notification Priority

public enum MeeshyNotificationPriority: String, Codable {
    case low, normal, high, urgent
}

// MARK: - Notification Actor

public struct NotificationActor: Codable {
    public let id: String
    public let username: String
    public let displayName: String?
    public let avatar: String?
}

// MARK: - Notification Context

public struct NotificationContext: Codable {
    public let conversationId: String?
    public let conversationTitle: String?
    public let conversationType: String?
    public let messageId: String?
    public let callSessionId: String?
    public let friendRequestId: String?
    public let postId: String?
    public let commentId: String?
}

// MARK: - Notification Metadata

public struct NotificationMetadata: Codable {
    public let action: String?
    public let messagePreview: String?
    public let reactionEmoji: String?
    public let callType: String?
    public let memberCount: Int?
    public let commentPreview: String?
    public let postId: String?
    public let emoji: String?
    
    // Attachments sub-object
    public let attachments: AttachmentInfo?
    
    public struct AttachmentInfo: Codable {
        public let count: Int?
        public let firstType: String?
        public let firstFilename: String?
    }
}

// MARK: - Notification Delivery

public struct NotificationDelivery: Codable {
    public let emailSent: Bool
    public let pushSent: Bool
    
    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        self.emailSent = (try? container.decode(Bool.self, forKey: .emailSent)) ?? false
        self.pushSent = (try? container.decode(Bool.self, forKey: .pushSent)) ?? false
    }
    
    enum CodingKeys: String, CodingKey {
        case emailSent, pushSent
    }
}

// MARK: - Notification (Main Model)

public struct MeeshyNotification: Identifiable, Codable {
    public let id: String
    public let userId: String
    public let type: MeeshyNotificationType
    public let priority: MeeshyNotificationPriority
    public let content: String
    public let actor: NotificationActor?
    public let context: NotificationContext?
    public let metadata: NotificationMetadata?
    public let delivery: NotificationDelivery?
    public let isRead: Bool
    public let readAt: Date?
    public let expiresAt: Date?
    public let createdAt: Date
    
    // Flattened from API response for convenience
    public var messageId: String? { context?.messageId }
    public var conversationId: String? { context?.conversationId }
}

// MARK: - Notification List Response

public struct NotificationListResponse: Decodable {
    public let success: Bool
    public let data: [MeeshyNotification]
    public let pagination: OffsetPagination?
    public let unreadCount: Int?
}

// MARK: - Unread Count Response

public struct UnreadCountResponse: Decodable {
    public let success: Bool
    public let count: Int
}

// MARK: - Mark Read Response

public struct MarkReadResponse: Decodable {
    public let success: Bool
    public let data: MarkReadData?
    
    public struct MarkReadData: Decodable {
        public let message: String?
        public let count: Int?
    }
}

// Keep existing device token models below...
// (RegisterDeviceTokenRequest, UnregisterDeviceTokenRequest, etc.)
```

### Task B2: NotificationService.swift (MeeshySDK)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/NotificationService.swift`

Follows the singleton pattern used by `UserService.swift`, `ConversationService.swift`, `AccountService.swift`.

```swift
import Foundation

public final class NotificationService {
    public static let shared = NotificationService()
    private init() {}
    private var api: APIClient { APIClient.shared }
    
    // MARK: - List
    
    public func list(
        offset: Int = 0,
        limit: Int = 20,
        unreadOnly: Bool = false,
        type: String? = nil
    ) async throws -> NotificationListResponse {
        var queryItems = [
            URLQueryItem(name: "offset", value: "\(offset)"),
            URLQueryItem(name: "limit", value: "\(limit)"),
        ]
        if unreadOnly {
            queryItems.append(URLQueryItem(name: "unread", value: "true"))
        }
        if let type, type != "all" {
            queryItems.append(URLQueryItem(name: "type", value: type))
        }
        return try await api.request(
            endpoint: "/notifications",
            queryItems: queryItems
        )
    }
    
    // MARK: - Unread Count
    
    public func unreadCount() async throws -> Int {
        let response: UnreadCountResponse = try await api.request(
            endpoint: "/notifications/unread-count"
        )
        return response.count
    }
    
    // MARK: - Mark Read
    
    public func markRead(id: String) async throws {
        struct Empty: Encodable {}
        let _: MarkReadResponse = try await api.patch(
            endpoint: "/notifications/\(id)/read",
            body: Empty()
        )
    }
    
    // MARK: - Mark All Read
    
    public func markAllRead() async throws -> Int {
        struct Empty: Encodable {}
        let response: MarkReadResponse = try await api.patch(
            endpoint: "/notifications/read-all",
            body: Empty()
        )
        return response.data?.count ?? 0
    }
    
    // MARK: - Delete
    
    public func delete(id: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            endpoint: "/notifications/\(id)"
        )
    }
}
```

### Task B3: NotificationListViewModel.swift (apps/ios)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/NotificationListViewModel.swift`

```swift
import Foundation
import Combine
import MeeshySDK
import MeeshyUI

@MainActor
class NotificationListViewModel: ObservableObject {
    
    @Published var notifications: [MeeshyNotification] = []
    @Published var unreadCount: Int = 0
    @Published var isLoading = false
    @Published var isLoadingMore = false
    @Published var hasMore = true
    @Published var errorMessage: String?
    
    private let service = NotificationService.shared
    private var currentOffset = 0
    private let pageSize = 20
    private var cancellables = Set<AnyCancellable>()
    
    init() {
        setupSocketListener()
    }
    
    // MARK: - Fetch
    
    func fetchNotifications() async {
        isLoading = true
        errorMessage = nil
        currentOffset = 0
        
        do {
            let response = try await service.list(offset: 0, limit: pageSize)
            notifications = response.data
            unreadCount = response.unreadCount ?? 0
            hasMore = response.pagination?.hasMore ?? false
            currentOffset = pageSize
        } catch {
            errorMessage = "Impossible de charger les notifications"
        }
        
        isLoading = false
    }
    
    func loadMore() async {
        guard hasMore, !isLoadingMore else { return }
        isLoadingMore = true
        
        do {
            let response = try await service.list(offset: currentOffset, limit: pageSize)
            notifications.append(contentsOf: response.data)
            hasMore = response.pagination?.hasMore ?? false
            currentOffset += pageSize
        } catch { }
        
        isLoadingMore = false
    }
    
    // MARK: - Actions
    
    func markAsRead(_ notification: MeeshyNotification) async {
        guard !notification.isRead else { return }
        do {
            try await service.markRead(id: notification.id)
            if let idx = notifications.firstIndex(where: { $0.id == notification.id }) {
                // Cannot mutate let struct -- rebuild
                var updated = notifications
                // Mark as read locally (optimistic)
                // Since MeeshyNotification is a struct with let isRead, we need a mutable copy approach
                // For simplicity, re-fetch or use a wrapper
            }
            unreadCount = max(0, unreadCount - 1)
        } catch { }
    }
    
    func markAllAsRead() async {
        do {
            let count = try await service.markAllRead()
            unreadCount = 0
            await fetchNotifications() // Refresh to update isRead flags
        } catch { }
    }
    
    func deleteNotification(_ notification: MeeshyNotification) async {
        do {
            try await service.delete(id: notification.id)
            notifications.removeAll { $0.id == notification.id }
            if !notification.isRead {
                unreadCount = max(0, unreadCount - 1)
            }
        } catch { }
    }
    
    // MARK: - Grouping
    
    var groupedNotifications: [(String, [MeeshyNotification])] {
        let calendar = Calendar.current
        let today = calendar.startOfDay(for: Date())
        let weekAgo = calendar.date(byAdding: .day, value: -7, to: today)!
        
        var todayGroup: [MeeshyNotification] = []
        var weekGroup: [MeeshyNotification] = []
        var olderGroup: [MeeshyNotification] = []
        
        for notif in notifications {
            if calendar.isDateInToday(notif.createdAt) {
                todayGroup.append(notif)
            } else if notif.createdAt >= weekAgo {
                weekGroup.append(notif)
            } else {
                olderGroup.append(notif)
            }
        }
        
        var result: [(String, [MeeshyNotification])] = []
        if !todayGroup.isEmpty { result.append(("Aujourd'hui", todayGroup)) }
        if !weekGroup.isEmpty { result.append(("Cette semaine", weekGroup)) }
        if !olderGroup.isEmpty { result.append(("Plus ancien", olderGroup)) }
        return result
    }
    
    // MARK: - Socket.IO Real-time
    
    private func setupSocketListener() {
        MessageSocketManager.shared.socket?.on("notification:new") { [weak self] data, _ in
            guard let self, let dict = data.first as? [String: Any] else { return }
            Task { @MainActor [weak self] in
                guard let self else { return }
                self.unreadCount += 1
                await self.fetchNotifications()
            }
        }
    }
}
```

### Task B4: NotificationListView.swift (apps/ios)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/NotificationListView.swift`

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct NotificationListView: View {
    @StateObject private var viewModel = NotificationListViewModel()
    @EnvironmentObject private var router: Router
    @ObservedObject private var theme = ThemeManager.shared
    @Environment(\.dismiss) private var dismiss
    
    private let accentColor = "08D9D6"
    
    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            
            VStack(spacing: 0) {
                header
                content
            }
        }
        .task { await viewModel.fetchNotifications() }
    }
    
    // MARK: - Header
    
    private var header: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: accentColor))
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("Retour")
            
            Spacer()
            
            Text("Notifications")
                .font(.system(size: 17, weight: .bold))
                .foregroundColor(theme.textPrimary)
            
            Spacer()
            
            if viewModel.unreadCount > 0 {
                Button {
                    Task { await viewModel.markAllAsRead() }
                } label: {
                    Text("Tout lire")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Color(hex: accentColor))
                }
                .frame(minWidth: 44, minHeight: 44)
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }
    
    // MARK: - Content
    
    @ViewBuilder
    private var content: some View {
        if viewModel.isLoading && viewModel.notifications.isEmpty {
            SkeletonView(lines: 8)
                .padding()
        } else if viewModel.notifications.isEmpty {
            EmptyStateView(
                icon: "bell.slash",
                title: "Aucune notification",
                subtitle: "Vos notifications apparaitront ici"
            )
            .frame(maxHeight: .infinity)
        } else {
            ScrollView(showsIndicators: false) {
                LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
                    ForEach(viewModel.groupedNotifications, id: \.0) { section in
                        Section {
                            ForEach(section.1) { notification in
                                NotificationRowView(notification: notification, accentColor: accentColor)
                                    .onTapGesture {
                                        Task { await viewModel.markAsRead(notification) }
                                        handleNotificationTap(notification)
                                    }
                                    .swipeActions(edge: .trailing) {
                                        Button(role: .destructive) {
                                            Task { await viewModel.deleteNotification(notification) }
                                        } label: {
                                            Label("Supprimer", systemImage: "trash")
                                        }
                                    }
                                    .onAppear {
                                        if notification.id == viewModel.notifications.last?.id {
                                            Task { await viewModel.loadMore() }
                                        }
                                    }
                            }
                        } header: {
                            sectionHeader(title: section.0)
                        }
                    }
                }
                .padding(.horizontal, 16)
            }
            .refreshable { await viewModel.fetchNotifications() }
        }
    }
    
    private func sectionHeader(title: String) -> some View {
        Text(title)
            .font(.system(size: MeeshyFont.footnoteSize, weight: .semibold))
            .foregroundColor(theme.textMuted)
            .textCase(.uppercase)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 8)
            .background(theme.backgroundGradient)
    }
    
    private func handleNotificationTap(_ notification: MeeshyNotification) {
        // Navigate based on notification context
        // Implementation depends on Router and context
        HapticFeedback.light()
    }
}
```

### Task B5: NotificationRowView.swift (MeeshyUI or apps/ios)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/NotificationRowView.swift`

The row renders contextually based on notification type: actor avatar, icon, action text, preview, timestamp.

```swift
import SwiftUI
import MeeshySDK
import MeeshyUI

struct NotificationRowView: View {
    let notification: MeeshyNotification
    let accentColor: String
    
    @ObservedObject private var theme = ThemeManager.shared
    
    var body: some View {
        HStack(spacing: 12) {
            // Left: Avatar or Icon
            ZStack(alignment: .bottomTrailing) {
                if let actor = notification.actor {
                    MeeshyAvatar(
                        name: actor.displayName ?? actor.username,
                        mode: .custom(42),
                        accentColor: DynamicColorGenerator.colorForName(actor.username),
                        avatarURL: actor.avatar
                    )
                } else {
                    Circle()
                        .fill(Color(hex: notification.type.color).opacity(0.15))
                        .frame(width: 42, height: 42)
                        .overlay(
                            Image(systemName: notification.type.icon)
                                .font(.system(size: 18, weight: .medium))
                                .foregroundColor(Color(hex: notification.type.color))
                        )
                }
                
                // Type badge overlay
                if notification.actor != nil {
                    Circle()
                        .fill(Color(hex: notification.type.color))
                        .frame(width: 18, height: 18)
                        .overlay(
                            Image(systemName: notification.type.icon)
                                .font(.system(size: 9, weight: .bold))
                                .foregroundColor(.white)
                        )
                        .offset(x: 2, y: 2)
                }
            }
            
            // Center: Text content
            VStack(alignment: .leading, spacing: 3) {
                Text(actionText)
                    .font(.system(size: MeeshyFont.subheadSize, weight: notification.isRead ? .regular : .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(2)
                
                if !notification.content.isEmpty {
                    Text(notification.content)
                        .font(.system(size: MeeshyFont.footnoteSize))
                        .foregroundColor(theme.textMuted)
                        .lineLimit(1)
                }
                
                Text(relativeTime(notification.createdAt))
                    .font(.system(size: MeeshyFont.captionSize))
                    .foregroundColor(theme.textMuted)
            }
            
            Spacer()
            
            // Right: Unread indicator
            if !notification.isRead {
                Circle()
                    .fill(Color(hex: accentColor))
                    .frame(width: 8, height: 8)
            }
        }
        .padding(.vertical, 10)
        .padding(.horizontal, 4)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(notification.isRead ? Color.clear : Color(hex: accentColor).opacity(0.04))
        )
        .contentShape(Rectangle())
    }
    
    // MARK: - Action Text (built from type + actor, like i18n)
    
    private var actionText: String {
        let actor = notification.actor?.displayName ?? notification.actor?.username ?? "Quelqu'un"
        switch notification.type {
        case .newMessage: return "\(actor) vous a envoye un message"
        case .messageReply: return "\(actor) a repondu a votre message"
        case .messageReaction: 
            let emoji = notification.metadata?.reactionEmoji ?? notification.metadata?.emoji ?? ""
            return "\(actor) a reagi \(emoji) a votre message"
        case .friendRequest: return "\(actor) vous a envoye une demande d'ami"
        case .friendAccepted: return "\(actor) a accepte votre demande"
        case .userMentioned: return "\(actor) vous a mentionne"
        case .missedCall: 
            let callType = notification.metadata?.callType == "video" ? "video" : "audio"
            return "Appel \(callType) manque de \(actor)"
        case .memberJoined: return "\(actor) a rejoint la conversation"
        case .memberLeft: return "\(actor) a quitte la conversation"
        case .postLike: return "\(actor) a aime votre publication"
        case .postComment: return "\(actor) a commente votre publication"
        case .postRepost: return "\(actor) a repartage votre publication"
        case .commentReply: return "\(actor) a repondu a votre commentaire"
        case .commentLike: return "\(actor) a aime votre commentaire"
        case .storyReaction: return "\(actor) a reagi a votre story"
        case .addedToConversation: return "\(actor) vous a ajoute a une conversation"
        case .communityInvite: return "\(actor) vous a invite dans une communaute"
        case .securityAlert: return "Alerte de securite"
        case .loginNewDevice: return "Connexion depuis un nouvel appareil"
        case .system: return "Notification systeme"
        case .achievementUnlocked: return "Succes debloque !"
        case .translationReady: return "Traduction terminee"
        default: return notification.content.isEmpty ? "Nouvelle notification" : notification.content
        }
    }
    
    private func relativeTime(_ date: Date) -> String {
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "A l'instant" }
        if interval < 3600 { return "Il y a \(Int(interval / 60))min" }
        if interval < 86400 { return "Il y a \(Int(interval / 3600))h" }
        if interval < 604800 { return "Il y a \(Int(interval / 86400))j" }
        let formatter = DateFormatter()
        formatter.dateFormat = "dd/MM"
        return formatter.string(from: date)
    }
}
```

---

## Task Group C: User Stats (SDK + iOS)

### Task C1: StatsModels.swift (MeeshySDK)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/StatsModels.swift`

```swift
import Foundation

// MARK: - User Stats

public struct UserStatsResponse: Decodable {
    public let success: Bool
    public let data: UserStatsData
}

public struct UserStatsData: Decodable {
    public let messagesSent: Int
    public let messagesReceived: Int
    public let conversationsCount: Int
    public let groupsCount: Int
    public let translationsUsed: Int
    public let languagesDetected: Int
    public let friendsAdded: Int
    public let communitiesCreated: Int
    public let totalOnlineTimeMinutes: Int
    public let sessionCount: Int
    public let memberSince: Date
    public let lastActivity: Date
}

// MARK: - Timeline

public struct StatsTimelineResponse: Decodable {
    public let success: Bool
    public let data: [TimelineEntry]
}

public struct TimelineEntry: Decodable, Identifiable {
    public let date: String
    public let messagesSent: Int
    
    public var id: String { date }
    
    public var parsedDate: Date? {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.date(from: date)
    }
}

// MARK: - Achievements

public struct AchievementsResponse: Decodable {
    public let success: Bool
    public let data: [Achievement]
}

public struct Achievement: Decodable, Identifiable {
    public let type: String
    public let unlocked: Bool
    public let progress: Double
    
    public var id: String { type }
    
    public var displayName: String {
        switch type {
        case "polyglot": return "Polyglotte"
        case "social_butterfly": return "Papillon social"
        case "chatterbox": return "Moulin a paroles"
        case "early_adopter": return "Early Adopter"
        case "community_builder": return "Batisseur"
        case "translator": return "Traducteur"
        case "loyal_user": return "Fidele"
        case "night_owl": return "Noctambule"
        case "connector": return "Connecteur"
        case "media_maven": return "Photographe"
        default: return type.capitalized
        }
    }
    
    public var icon: String {
        switch type {
        case "polyglot": return "globe"
        case "social_butterfly": return "bubble.left.and.bubble.right.fill"
        case "chatterbox": return "text.bubble.fill"
        case "early_adopter": return "star.fill"
        case "community_builder": return "person.3.fill"
        case "translator": return "translate"
        case "loyal_user": return "heart.fill"
        case "night_owl": return "moon.fill"
        case "connector": return "person.2.fill"
        case "media_maven": return "camera.fill"
        default: return "trophy.fill"
        }
    }
    
    public var color: String {
        switch type {
        case "polyglot": return "08D9D6"
        case "social_butterfly": return "9B59B6"
        case "chatterbox": return "4ECDC4"
        case "early_adopter": return "F8B500"
        case "community_builder": return "2ECC71"
        case "translator": return "3498DB"
        case "loyal_user": return "FF2E63"
        case "night_owl": return "A855F7"
        case "connector": return "FF6B6B"
        case "media_maven": return "E91E63"
        default: return "95A5A6"
        }
    }
}
```

### Task C2: StatsService.swift (MeeshySDK)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/StatsService.swift`

```swift
import Foundation

public final class StatsService {
    public static let shared = StatsService()
    private init() {}
    private var api: APIClient { APIClient.shared }
    
    public func fetchStats() async throws -> UserStatsData {
        let response: UserStatsResponse = try await api.request(endpoint: "/users/me/stats")
        return response.data
    }
    
    public func fetchTimeline(days: Int = 7) async throws -> [TimelineEntry] {
        let response: StatsTimelineResponse = try await api.request(
            endpoint: "/users/me/stats/timeline",
            queryItems: [URLQueryItem(name: "days", value: "\(days)")]
        )
        return response.data
    }
    
    public func fetchAchievements() async throws -> [Achievement] {
        let response: AchievementsResponse = try await api.request(
            endpoint: "/users/me/stats/achievements"
        )
        return response.data
    }
}
```

### Task C3: UserStatsView.swift (apps/ios)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/UserStatsView.swift`

Uses SwiftUI Charts for the timeline bar chart. Sections: Account, Messages, Conversations, Translations, Achievements.

### Task C4: StatsTimelineChart.swift (apps/ios)

Uses `import Charts` (SwiftUI Charts framework, iOS 16+).

```swift
import SwiftUI
import Charts
import MeeshySDK

struct StatsTimelineChart: View {
    let entries: [TimelineEntry]
    let accentColor: String
    
    var body: some View {
        Chart(entries) { entry in
            BarMark(
                x: .value("Date", entry.date.suffix(5)),
                y: .value("Messages", entry.messagesSent)
            )
            .foregroundStyle(Color(hex: accentColor).gradient)
            .cornerRadius(4)
        }
        .chartYAxis {
            AxisMarks(position: .leading)
        }
        .frame(height: 180)
    }
}
```

### Task C5: AchievementBadgeView.swift (apps/ios)

Renders a badge with icon, title, progress ring, and unlock animation.

---

## Task Group D: Affiliates iOS (SDK + Views)

### Task D1: AffiliateModels.swift (MeeshySDK)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/AffiliateModels.swift`

Maps to the Prisma models `AffiliateToken` (schema line 1273) and `AffiliateRelation` (line 1290), and the API responses from `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/affiliate.ts`.

```swift
import Foundation

public struct AffiliateToken: Identifiable, Decodable {
    public let id: String
    public let token: String
    public let name: String
    public let affiliateLink: String?
    public let maxUses: Int?
    public let currentUses: Int
    public let isActive: Bool
    public let expiresAt: Date?
    public let createdAt: Date
    public let _count: AffiliateCount?
    
    public struct AffiliateCount: Decodable {
        public let affiliations: Int
    }
    
    public var referralCount: Int { _count?.affiliations ?? 0 }
    public var isExpired: Bool {
        guard let expiresAt else { return false }
        return Date() > expiresAt
    }
    public var isAtLimit: Bool {
        guard let maxUses else { return false }
        return currentUses >= maxUses
    }
}

public struct AffiliateTokenListResponse: Decodable {
    public let success: Bool
    public let data: [AffiliateToken]
    public let pagination: OffsetPagination?
}

public struct CreateAffiliateTokenRequest: Encodable {
    public let name: String
    public let maxUses: Int?
    public let expiresAt: String?
    
    public init(name: String, maxUses: Int? = nil, expiresAt: Date? = nil) {
        self.name = name
        self.maxUses = maxUses
        self.expiresAt = expiresAt?.ISO8601Format()
    }
}

public struct CreateAffiliateTokenResponse: Decodable {
    public let id: String
    public let token: String
    public let name: String
    public let affiliateLink: String
    public let maxUses: Int?
    public let currentUses: Int
    public let expiresAt: Date?
    public let createdAt: Date
}

public struct AffiliateStatsData: Decodable {
    public let totalTokens: Int?
    public let totalReferrals: Int?
    public let completedReferrals: Int?
    public let pendingReferrals: Int?
    // The backend may return additional fields
}

public struct AffiliateStatsResponse: Decodable {
    public let success: Bool
    public let data: AffiliateStatsData
}
```

### Task D2: AffiliateService.swift (MeeshySDK)

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/AffiliateService.swift`

```swift
import Foundation

public final class AffiliateService {
    public static let shared = AffiliateService()
    private init() {}
    private var api: APIClient { APIClient.shared }
    
    public func listTokens(offset: Int = 0, limit: Int = 50) async throws -> AffiliateTokenListResponse {
        return try await api.request(
            endpoint: "/affiliate/tokens",
            queryItems: [
                URLQueryItem(name: "offset", value: "\(offset)"),
                URLQueryItem(name: "limit", value: "\(limit)")
            ]
        )
    }
    
    public func createToken(name: String, maxUses: Int? = nil, expiresAt: Date? = nil) async throws -> CreateAffiliateTokenResponse {
        let body = CreateAffiliateTokenRequest(name: name, maxUses: maxUses, expiresAt: expiresAt)
        let response: APIResponse<CreateAffiliateTokenResponse> = try await api.post(
            endpoint: "/affiliate/tokens", body: body
        )
        return response.data
    }
    
    public func deleteToken(id: String) async throws {
        let _: APIResponse<[String: Bool]> = try await api.delete(
            endpoint: "/affiliate/tokens/\(id)"
        )
    }
    
    public func getStats(tokenId: String? = nil) async throws -> AffiliateStatsData {
        var queryItems: [URLQueryItem] = []
        if let tokenId {
            queryItems.append(URLQueryItem(name: "tokenId", value: tokenId))
        }
        let response: AffiliateStatsResponse = try await api.request(
            endpoint: "/affiliate/stats",
            queryItems: queryItems.isEmpty ? nil : queryItems
        )
        return response.data
    }
}
```

### Task D3-D5: AffiliateView, AffiliateCreateView, AffiliateStatsView

All created in `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/`. Integrate from SettingsView as a new section. The existing SettingsView at line 65 already has `showDataExport` -- add `@State private var showAffiliates = false` and a new section.

---

## Task Group E: Search, Thread, Contact, Empty States

### Task E1: GlobalSearchViewModel Audit + Community Tab

**File**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift`

Current state: The `SearchTab` enum has `.messages`, `.conversations`, `.users` (3 tabs). Missing: `.communities`.

**Fixes needed**:
1. Add `.communities` case to `SearchTab` enum with icon `"person.3.fill"` and localized name "Communautes"
2. Add `@Published var communityResults: [GlobalSearchCommunityResult] = []`
3. Add `searchCommunities(query:)` method calling `GET /communities/search?q=...`
4. The existing conversation search endpoint is correct: `GET /conversations/search?q=...` (verified from `search.ts`)
5. The existing user search uses `UserService.shared.searchUsers(query:)` which calls `GET /users/search?q=...` (verified)
6. Message search chains conversations then per-conversation message search -- this is correct but slow. Consider optimization if needed.

```swift
// Add to SearchTab enum:
case communities = "Communautes"

// Add to GlobalSearchViewModel:
@Published var communityResults: [GlobalSearchCommunityResult] = []

struct GlobalSearchCommunityResult: Identifiable {
    let id: String
    let name: String
    let identifier: String
    let description: String?
    let avatar: String?
    let memberCount: Int
    let conversationCount: Int
}

// New API model for community search response:
struct APICommunitySearchResult: Decodable {
    let id: String
    let name: String
    let identifier: String
    let description: String?
    let avatar: String?
    let memberCount: Int
    let conversationCount: Int
}

private func searchCommunities(query: String) async -> [GlobalSearchCommunityResult] {
    do {
        let response: OffsetPaginatedAPIResponse<[APICommunitySearchResult]> = try await APIClient.shared.request(
            endpoint: "/communities/search",
            queryItems: [URLQueryItem(name: "q", value: query)]
        )
        return response.data.map { c in
            GlobalSearchCommunityResult(
                id: c.id, name: c.name, identifier: c.identifier,
                description: c.description, avatar: c.avatar,
                memberCount: c.memberCount, conversationCount: c.conversationCount
            )
        }
    } catch { return [] }
}
```

Update `performSearch` to include `async let communitiesTask = searchCommunities(query: query)`.

### Task E2: ThreadView.swift

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/ThreadView.swift`

The reply count pill is already implemented in `ConversationView+MessageRow.swift` at line 762 (`replyCountPill`). Currently it scrolls to the first reply. We need a dedicated ThreadView that shows the parent message and all its replies in a sheet.

Trigger: When user taps the reply count pill, instead of just scrolling, present ThreadView as a sheet.

**Modifications needed in ConversationView+MessageRow.swift** (line 766-768):
```swift
// Change from:
if let firstReply = viewModel.messages.first(where: { $0.replyToId == parentMessageId }) {
    scrollToMessageId = firstReply.id
}
// To:
threadParentMessage = viewModel.messages.first(where: { $0.id == parentMessageId })
```

Add `@State var threadParentMessage: Message? = nil` to ConversationView and present ThreadView as sheet.

ThreadView itself:
```swift
struct ThreadView: View {
    let parentMessage: Message
    let allMessages: [Message]
    let accentColor: String
    // ... renders parent at top, then all replies below
    
    var replies: [Message] {
        allMessages.filter { $0.replyToId == parentMessage.id }
            .sorted { $0.createdAt < $1.createdAt }
    }
}
```

### Task E3: ContactMessageView.swift

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/ContactMessageView.swift`

The `SharedContact` struct already exists in CoreModels.swift (line 663). It has `id`, `fullName`, `phoneNumbers`, `emails`.

The `MeeshyMessage.MessageType` enum (CoreModels.swift line 294) has `case text, image, file, audio, video, location` but NO `contact` case. Need to add `case contact` to the enum in MeeshySDK.

Then in `ThemedMessageBubble.swift`, add a case to render contact messages:
```swift
// When messageType == .contact, decode content as SharedContact JSON
if message.messageType == .contact, let contactData = message.content.data(using: .utf8),
   let contact = try? JSONDecoder().decode(SharedContact.self, from: contactData) {
    ContactMessageView(contact: contact, accentColor: contactColor)
}
```

ContactMessageView renders: avatar circle with initials, full name, phone number(s), "Add to Contacts" button using `CNContactStore`.

### Task E4: Empty States

**Existing EmptyStateView** is at `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmptyStateView.swift` -- already a reusable component with icon, title, subtitle, optional action button.

**Screens needing empty states**:

1. **FeedView** (`/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/FeedView.swift`): Currently uses sample data. When actual feed is empty, show `EmptyStateView(icon: "text.bubble", title: "Rien a voir ici", subtitle: "Suivez des personnes pour voir leur contenu")`.

2. **NotificationListView**: Already handled in Task B4 above.

3. **CommunityListView**: No file exists yet (`Glob` returned empty for `*Community*.swift` in Views). If it's part of a tab or section, create the empty state in the parent view that hosts communities. If communities are embedded in the conversation list or a separate tab, add:
```swift
EmptyStateView(
    icon: "person.3",
    title: "Aucune communaute",
    subtitle: "Rejoignez ou creez une communaute pour commencer",
    actionTitle: "Decouvrir",
    action: { /* navigate to community search */ }
)
```

### Task E5: DataExportView

The SettingsView already has `@State private var showDataExport = false` and `.sheet(isPresented: $showDataExport) { DataExportView() }`. The `DataExportView` must be created or already exists. Check if it exists:

From the SettingsView code, it references `DataExportView()` directly. If it does not exist, create a simple GDPR data export request view:

**File to CREATE**: `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/DataExportView.swift`

---

## Task Group F: Final Coherence Check

### Vertical Consistency (per feature)
- [ ] Notification: Gateway endpoints -> SDK NotificationModels -> SDK NotificationService -> ViewModel -> View -> Socket.IO real-time
- [ ] Stats: Gateway /users/me/stats endpoints -> SDK StatsModels -> SDK StatsService -> UserStatsView
- [ ] Affiliate: Gateway /affiliate/* -> SDK AffiliateModels -> SDK AffiliateService -> AffiliateView
- [ ] Search: Gateway /conversations/search, /communities/search, /users/search -> GlobalSearchViewModel with 4 tabs
- [ ] Thread: Message.replies in schema -> replyToId in MeeshyMessage -> ThreadView
- [ ] Contact: SharedContact in CoreModels -> MessageType.contact -> ContactMessageView

### Horizontal Consistency (cross-cutting)
- [ ] All new SDK services follow singleton pattern: `static let shared`, private init, `var api: APIClient { APIClient.shared }`
- [ ] All new SDK models are `Decodable` with proper `CodingKeys` where needed
- [ ] All new views use MeeshyUI design tokens: `MeeshySpacing`, `MeeshyFont`, `MeeshyColors`, `MeeshyAnimation`
- [ ] All new views use `ThemeManager.shared` for `textPrimary`, `textMuted`, `backgroundGradient`
- [ ] All new views have accessibility labels on interactive elements
- [ ] All `@Published` properties minimize count per CLAUDE.md guidance
- [ ] All closures capturing `self` use `[weak self]`
- [ ] All Socket.IO event names use `entity:action-word` format (hyphens, not underscores)
- [ ] API response format: `{ success: boolean, data: T, pagination?: { total, offset, limit, hasMore } }`
- [ ] No `any` types in shared TypeScript; `unknown` with validation
- [ ] Empty states use `EmptyStateView` primitive consistently

### Integration Points Between Plans 1-5
- [ ] Plan 1 (Auth, Conversations, Feed) -> NotificationListView accessible from main navigation
- [ ] Plan 2 (Profiles, Communities) -> AffiliateView accessible from SettingsView
- [ ] Plan 3 (Push, Block, Onboarding) -> Push notifications feed into NotificationListView
- [ ] Plan 4 (Socket.IO, Offline, Threads, Pagination) -> ThreadView built on thread/reply infrastructure
- [ ] Plan 5 (This plan) -> Final polish layer on all the above

---

## Implementation Order

1. **A1-A3**: Backend stats endpoints (foundation for iOS)
2. **B1-B2**: SDK notification models + service
3. **B3-B5**: iOS notification list (view + viewmodel + row)
4. **C1-C2**: SDK stats models + service
5. **C3-C5**: iOS stats views
6. **D1-D2**: SDK affiliate models + service
7. **D3-D5**: iOS affiliate views
8. **E1**: Search corrections + community tab
9. **E2**: ThreadView
10. **E3**: ContactMessageView
11. **E4**: Empty states across all screens
12. **E5**: DataExportView
13. **F**: Final coherence audit

Each task group ends with a build verification via `./apps/ios/meeshy.sh build` and a commit.

---

### Critical Files for Implementation
- `/Users/smpceo/Documents/v2_meeshy/services/gateway/src/routes/users/preferences.ts` - Add /users/me/stats, /users/me/stats/timeline, /users/me/stats/achievements endpoints
- `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationModels.swift` - Replace with full MeeshyNotification, MeeshyNotificationType (36 cases), NotificationActor, NotificationContext, NotificationMetadata models
- `/Users/smpceo/Documents/v2_meeshy/packages/MeeshySDK/Sources/MeeshySDK/Services/UserService.swift` - Reference pattern for all new singleton SDK services (NotificationService, StatsService, AffiliateService)
- `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/ViewModels/GlobalSearchViewModel.swift` - Add .communities tab, APICommunitySearchResult, searchCommunities method
- `/Users/smpceo/Documents/v2_meeshy/apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift` - Modify replyCountPill to present ThreadView sheet instead of scroll, add ContactMessageView rendering for .contact messageType
