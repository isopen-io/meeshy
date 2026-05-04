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

    // Pre-computed layout (CTFramesetter)
    public var cachedBubbleWidth: Double?
    public var cachedBubbleHeight: Double?
    public var cachedLastLineWidth: Double?
    public var cachedLineCount: Int?
    public var cachedTimestampInline: Bool?
    public var layoutVersion: Int
    public var layoutMaxWidth: Double?

    // Change tracking
    public var changeVersion: Int64
}

// (O1) Equatable via changeVersion — O(1) per record, no blob comparison
extension MessageRecord: Equatable {
    public static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.localId == rhs.localId && lhs.changeVersion == rhs.changeVersion
    }
}
