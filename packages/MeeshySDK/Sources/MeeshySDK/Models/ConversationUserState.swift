import Foundation

/// Unified per-user state attached to a `MeeshyConversation`.
///
/// Source of truth for everything the gateway returns under
/// `UserConversationPreferences` plus client-only flags (lock, draft) and
/// the sync metadata used by `ConversationStore` (Phase 4) to resolve
/// optimistic updates against socket broadcasts.
///
/// Wire format compatibility: this struct is **flat-encoded** by
/// `MeeshyConversation` (its fields appear as top-level keys in the
/// conversation JSON). That preserves backward compatibility with
/// `/conversations` responses and existing GRDB cache rows while letting
/// the in-memory representation be a single cohesive value.
///
/// See `docs/superpowers/specs/2026-05-22-conversation-user-state-unification-design.md` §4.1.
public struct ConversationUserState: Codable, Hashable, Sendable {
    // MARK: - Read state

    public var unreadCount: Int
    public var lastReadAt: Date?
    public var lastDeliveredAt: Date?

    // MARK: - Notification preferences

    public var isPinned: Bool
    public var isMuted: Bool
    public var mentionsOnly: Bool

    // MARK: - Visibility & lifecycle

    public var isArchived: Bool
    /// Soft-delete timestamp. `nil` = visible.
    public var deletedForUserAt: Date?
    /// Hide all messages before this point (clear-history feature).
    public var clearHistoryBefore: Date?

    // MARK: - Personal display

    public var customName: String?
    public var reaction: String?
    /// User-defined free-form tags (matches the Prisma `String[]` shape).
    /// `MeeshyConversation.tags` (the existing `[MeeshyConversationTag]`
    /// field) remains a separate display-layer concern until Phase 6/7
    /// reconciles them.
    public var tags: [String]

    // MARK: - Organization

    /// Assigned category id (legacy field name `sectionId` is shimmed on
    /// `MeeshyConversation`).
    public var sectionId: String?
    public var orderInCategory: Int?

    // MARK: - Local-only (per-device, never synced)

    public var isLocked: Bool
    public var hasDraft: Bool
    public var draftPreview: String?

    // MARK: - Sync metadata

    /// Monotonic version emitted by the gateway on every
    /// `UserConversationPreferences` write. Used to gate stale broadcasts
    /// (`incoming.version <= local -> drop`).
    public var version: Int
    public var lastSyncedAt: Date?
    /// Number of outbox entries queued for this conversation. `> 0` means
    /// a write is in flight or waiting for retry; the row shows the
    /// "pending sync" UI affordance.
    public var pendingMutationCount: Int

    // MARK: - Init with defaults

    public init(
        unreadCount: Int = 0,
        lastReadAt: Date? = nil,
        lastDeliveredAt: Date? = nil,
        isPinned: Bool = false,
        isMuted: Bool = false,
        mentionsOnly: Bool = false,
        isArchived: Bool = false,
        deletedForUserAt: Date? = nil,
        clearHistoryBefore: Date? = nil,
        customName: String? = nil,
        reaction: String? = nil,
        tags: [String] = [],
        sectionId: String? = nil,
        orderInCategory: Int? = nil,
        isLocked: Bool = false,
        hasDraft: Bool = false,
        draftPreview: String? = nil,
        version: Int = 0,
        lastSyncedAt: Date? = nil,
        pendingMutationCount: Int = 0
    ) {
        self.unreadCount = unreadCount
        self.lastReadAt = lastReadAt
        self.lastDeliveredAt = lastDeliveredAt
        self.isPinned = isPinned
        self.isMuted = isMuted
        self.mentionsOnly = mentionsOnly
        self.isArchived = isArchived
        self.deletedForUserAt = deletedForUserAt
        self.clearHistoryBefore = clearHistoryBefore
        self.customName = customName
        self.reaction = reaction
        self.tags = tags
        self.sectionId = sectionId
        self.orderInCategory = orderInCategory
        self.isLocked = isLocked
        self.hasDraft = hasDraft
        self.draftPreview = draftPreview
        self.version = version
        self.lastSyncedAt = lastSyncedAt
        self.pendingMutationCount = pendingMutationCount
    }

    public static let defaults = ConversationUserState()

    // MARK: - Convenience

    public var hasUnreadIndicator: Bool { unreadCount > 0 }
    public var hasPendingSync: Bool { pendingMutationCount > 0 }
    public var isVisible: Bool { deletedForUserAt == nil && !isArchived }
}
