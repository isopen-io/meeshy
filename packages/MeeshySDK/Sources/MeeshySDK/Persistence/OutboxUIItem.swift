import Foundation

/// UI-facing snapshot of an outbox row. Used by `SyncPill` to display
/// queued items without leaking GRDB row internals or domain payload
/// decoding cost into the view layer. One `OutboxUIItem` per
/// `OutboxRecord` row, regardless of attachment count.
public struct OutboxUIItem: Sendable, Equatable, Identifiable {
    public let id: String
    public let kind: Kind
    public let titlePreview: String?
    public let iconKind: IconKind
    public let attachmentCount: Int
    public let source: Source
    public let status: OutboxStatus
    public let createdAt: Date

    public init(
        id: String,
        kind: Kind,
        titlePreview: String?,
        iconKind: IconKind,
        attachmentCount: Int,
        source: Source,
        status: OutboxStatus,
        createdAt: Date
    ) {
        self.id = id
        self.kind = kind
        self.titlePreview = titlePreview
        self.iconKind = iconKind
        self.attachmentCount = attachmentCount
        self.source = source
        self.status = status
        self.createdAt = createdAt
    }

    public enum Kind: Sendable, Equatable {
        case message
        case reaction
        case edit
        case delete
        case story
        case postComment
        case postReaction
        case other(String)
    }

    public enum IconKind: Sendable, Equatable {
        case text
        case audio
        case image
        case video
        case file
        case reaction
        case sticker
        case none
    }

    public enum Source: Sendable, Equatable {
        case conversation(id: String)
        case post(id: String)
        case story(id: String)
        case unknown
    }
}
