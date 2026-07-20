import Foundation
import GRDB

public struct MessageRecord: Codable, FetchableRecord, PersistableRecord, Sendable {
    public static let databaseTableName = "messages"

    // Identity
    public var localId: String
    public var serverId: String?
    public var conversationId: String
    public var senderId: String

    // Content
    public var content: String?
    public var originalLanguage: String
    public var messageType: String
    public var messageSource: String
    public var contentType: String

    // State machine
    public var state: MessageState
    public var retryCount: Int
    public var lastError: String?

    // Encryption
    public var isEncrypted: Bool
    public var encryptionMode: String?
    public var encryptedPayload: Data?

    // Reply / Forward
    public var replyToId: String?
    public var storyReplyToId: String?
    public var forwardedFromId: String?
    public var forwardedFromConversationId: String?
    public var replyToJson: Data?
    public var forwardedFromJson: Data?

    // Ephemeral / Effects
    public var expiresAt: Date?
    public var effectFlags: UInt32
    public var maxViewOnceCount: Int?
    public var viewOnceCount: Int

    // Edit / Delete
    public var isEdited: Bool
    public var editedAt: Date?
    public var deletedAt: Date?

    // Pin
    public var pinnedAt: Date?
    public var pinnedBy: String?

    // Sender metadata (denormalized for offline display)
    public var senderName: String?
    public var senderUsername: String?
    public var senderColor: String?
    public var senderAvatarURL: String?

    // Delivery tracking
    public var deliveredCount: Int
    public var readCount: Int
    public var deliveredToAllAt: Date?
    public var readByAllAt: Date?
    /// Server's authoritative active-recipient denominator (participants
    /// excluding the sender), persisted so the all-or-nothing indicator survives
    /// a cache reload with the real count instead of the client `memberCount`.
    /// `0` = the server did not provide it; the display then falls back.
    public var recipientCount: Int

    // Timestamps
    public var createdAt: Date
    public var sentAt: Date?
    public var deliveredAt: Date?
    public var readAt: Date?
    public var updatedAt: Date

    // Attachments + Reactions (JSON blobs)
    public var attachmentsJson: Data?
    public var reactionsJson: Data?
    public var reactionCount: Int
    public var currentUserReactionsJson: Data?
    public var mentionedUsersJson: Data?

    // Structured call-summary metadata (JSON blob) for system call messages.
    public var callSummaryJson: Data?

    // Pre-computed layout (CTFramesetter)
    public var cachedBubbleWidth: Double?
    public var cachedBubbleHeight: Double?
    public var cachedLastLineWidth: Double?
    public var cachedLineCount: Int?
    public var cachedTimestampInline: Bool?
    public var layoutVersion: Int
    public var layoutMaxWidth: Double?

    // Pre-computed display string for the bubble timestamp (avoids DateFormatter in body)
    public var cachedTimeString: String?

    // Change tracking
    public var changeVersion: Int64

    // MARK: - Public memberwise init (required for cross-module usage)

    public init(
        localId: String, serverId: String?,
        conversationId: String, senderId: String,
        content: String?, originalLanguage: String,
        messageType: String, messageSource: String, contentType: String,
        state: MessageState, retryCount: Int, lastError: String?,
        isEncrypted: Bool, encryptionMode: String?, encryptedPayload: Data?,
        replyToId: String?, storyReplyToId: String?,
        forwardedFromId: String?, forwardedFromConversationId: String?,
        replyToJson: Data?, forwardedFromJson: Data?,
        expiresAt: Date?, effectFlags: UInt32,
        maxViewOnceCount: Int?, viewOnceCount: Int,
        isEdited: Bool, editedAt: Date?, deletedAt: Date?,
        pinnedAt: Date?, pinnedBy: String?,
        senderName: String?, senderUsername: String?,
        senderColor: String?, senderAvatarURL: String?,
        deliveredCount: Int, readCount: Int,
        deliveredToAllAt: Date?, readByAllAt: Date?,
        createdAt: Date, sentAt: Date?,
        deliveredAt: Date?, readAt: Date?, updatedAt: Date,
        attachmentsJson: Data?, reactionsJson: Data?,
        reactionCount: Int, currentUserReactionsJson: Data?,
        mentionedUsersJson: Data?,
        cachedBubbleWidth: Double?, cachedBubbleHeight: Double?,
        cachedLastLineWidth: Double?, cachedLineCount: Int?,
        cachedTimestampInline: Bool?,
        layoutVersion: Int, layoutMaxWidth: Double?,
        cachedTimeString: String? = nil,
        changeVersion: Int64,
        callSummaryJson: Data? = nil,
        recipientCount: Int = 0
    ) {
        self.localId = localId
        self.serverId = serverId
        self.conversationId = conversationId
        self.senderId = senderId
        self.content = content
        self.originalLanguage = originalLanguage
        self.messageType = messageType
        self.messageSource = messageSource
        self.contentType = contentType
        self.state = state
        self.retryCount = retryCount
        self.lastError = lastError
        self.isEncrypted = isEncrypted
        self.encryptionMode = encryptionMode
        self.encryptedPayload = encryptedPayload
        self.replyToId = replyToId
        self.storyReplyToId = storyReplyToId
        self.forwardedFromId = forwardedFromId
        self.forwardedFromConversationId = forwardedFromConversationId
        self.replyToJson = replyToJson
        self.forwardedFromJson = forwardedFromJson
        self.expiresAt = expiresAt
        self.effectFlags = effectFlags
        self.maxViewOnceCount = maxViewOnceCount
        self.viewOnceCount = viewOnceCount
        self.isEdited = isEdited
        self.editedAt = editedAt
        self.deletedAt = deletedAt
        self.pinnedAt = pinnedAt
        self.pinnedBy = pinnedBy
        self.senderName = senderName
        self.senderUsername = senderUsername
        self.senderColor = senderColor
        self.senderAvatarURL = senderAvatarURL
        self.deliveredCount = deliveredCount
        self.readCount = readCount
        self.deliveredToAllAt = deliveredToAllAt
        self.readByAllAt = readByAllAt
        self.createdAt = createdAt
        self.sentAt = sentAt
        self.deliveredAt = deliveredAt
        self.readAt = readAt
        self.updatedAt = updatedAt
        self.attachmentsJson = attachmentsJson
        self.reactionsJson = reactionsJson
        self.reactionCount = reactionCount
        self.currentUserReactionsJson = currentUserReactionsJson
        self.mentionedUsersJson = mentionedUsersJson
        self.cachedBubbleWidth = cachedBubbleWidth
        self.cachedBubbleHeight = cachedBubbleHeight
        self.cachedLastLineWidth = cachedLastLineWidth
        self.cachedLineCount = cachedLineCount
        self.cachedTimestampInline = cachedTimestampInline
        self.layoutVersion = layoutVersion
        self.layoutMaxWidth = layoutMaxWidth
        self.cachedTimeString = cachedTimeString
        self.changeVersion = changeVersion
        self.callSummaryJson = callSummaryJson
        self.recipientCount = recipientCount
    }

    // MARK: - Timestamp pre-compute helper

    public static func computeTimeString(for date: Date) -> String {
        TimeStringCache.shared.format(date)
    }
}

// Thread-safe singleton formatter — avoids per-call DateFormatter allocations.
// DateFormatter.string(from:) is not thread-safe; NSLock guards concurrent callers.
public final class TimeStringCache: @unchecked Sendable {
    public static let shared = TimeStringCache()

    private let lock = NSLock()
    private let formatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "HH:mm"
        f.locale = Locale.current
        return f
    }()

    public func format(_ date: Date) -> String {
        lock.lock()
        defer { lock.unlock() }
        return formatter.string(from: date)
    }
}

// (O1) Equatable via changeVersion — O(1) per record, no blob comparison
extension MessageRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.localId == rhs.localId && lhs.changeVersion == rhs.changeVersion
    }
}
