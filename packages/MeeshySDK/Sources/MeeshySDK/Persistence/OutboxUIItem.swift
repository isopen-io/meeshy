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

// MARK: - Mapping from OutboxRecord

extension OutboxUIItem {

    /// Maximum number of characters surfaced in `titlePreview` before truncation.
    /// Beyond this budget the preview is cut at this length and a Unicode
    /// horizontal ellipsis (`…`) is appended, yielding a string of
    /// `previewMaxCharacters + 1` characters.
    private static let previewMaxCharacters = 60

    /// Builds a UI-facing snapshot from a persisted `OutboxRecord`. Decoding
    /// failures are non-fatal: the returned item falls back to sensible
    /// defaults (no preview, generic icon) so a single corrupted payload does
    /// not hide the entire queue from the pill UI.
    public static func from(record: OutboxRecord) -> OutboxUIItem {
        switch record.kind {
        case .sendMessage:
            return mapSendMessage(record: record)
        case .editMessage:
            return mapEditMessage(record: record)
        case .deleteMessage:
            return mapDeleteMessage(record: record)
        case .sendReaction:
            return mapSendReaction(record: record)
        case .publishStory, .repostStory:
            return mapStory(record: record)
        case .createComment, .deleteComment:
            return mapComment(record: record)
        case .toggleLikePost, .toggleLikeComment:
            return mapPostReaction(record: record)
        case .createPost:
            return mapCreatePost(record: record)
        case .markAsRead,
             .markStoryViewed,
             .sendFriendRequest,
             .respondFriendRequest,
             .blockUser,
             .unblockUser,
             .createConversation,
             .updateConversation,
             .updateProfile,
             .updateSettings:
            return mapOther(record: record)
        }
    }

    private static func mapSendMessage(record: OutboxRecord) -> OutboxUIItem {
        let decoded = decodeOfflineQueueItem(record.payload)
        let content = decoded?.content ?? ""
        let attachments = decoded?.attachmentIds ?? []
        let kinds = decoded?.attachmentKinds ?? []
        let audioPath = decoded?.localAudioPath
        let audioPaths = decoded?.localAudioPaths ?? []

        // Detect audio: legacy scalar path, new multi-track paths array, or
        // attachmentKinds explicitly marking this row as audio (covers both).
        let isAudio = audioPath != nil
            || !audioPaths.isEmpty
            || kinds.contains(AttachmentKind.audio.rawValue)

        let icon: IconKind
        let preview: String
        if !content.isEmpty {
            icon = .text
            preview = truncatePreview(content)
        } else if isAudio {
            icon = .audio
            preview = "🎙 Note vocale"
        } else if !attachments.isEmpty {
            let (resolvedIcon, resolvedPreview) = attachmentDisplayHints(kinds: kinds)
            icon = resolvedIcon
            preview = resolvedPreview
        } else {
            icon = .text
            preview = "(message)"
        }

        return OutboxUIItem(
            id: record.id,
            kind: .message,
            titlePreview: preview,
            iconKind: icon,
            attachmentCount: attachments.count,
            source: .conversation(id: record.conversationId),
            status: record.status,
            createdAt: record.createdAt
        )
    }

    /// Pick a single `IconKind` + French preview literal for an attachment-only
    /// message based on the first non-`.other` `AttachmentKind`. Legacy
    /// payloads without `attachmentKinds` (or unknown raw values) fall back
    /// to `.image` / `"📷 Image"` per spec §4.2.
    private static func attachmentDisplayHints(kinds: [String]) -> (IconKind, String) {
        let primary = kinds
            .compactMap(AttachmentKind.init(rawValue:))
            .first { $0 != .other }
        switch primary {
        case .video:        return (.video, "🎞 Vidéo")
        case .audio:        return (.audio, "🎙 Note vocale")
        case .pdf,
             .document,
             .spreadsheet,
             .presentation,
             .archive,
             .code,
             .text:         return (.file, "📎 Fichier")
        case .image,
             .other,
             nil:           return (.image, "📷 Image")
        }
    }

    private static func mapEditMessage(record: OutboxRecord) -> OutboxUIItem {
        let payload = try? JSONDecoder().decode(OfflineEditPayload.self, from: record.payload)
        let preview = payload.map { truncatePreview($0.content) }
        return OutboxUIItem(
            id: record.id,
            kind: .edit,
            titlePreview: preview,
            iconKind: .text,
            attachmentCount: 0,
            source: .conversation(id: record.conversationId),
            status: record.status,
            createdAt: record.createdAt
        )
    }

    private static func mapDeleteMessage(record: OutboxRecord) -> OutboxUIItem {
        return OutboxUIItem(
            id: record.id,
            kind: .delete,
            titlePreview: "Suppression…",
            iconKind: .text,
            attachmentCount: 0,
            source: .conversation(id: record.conversationId),
            status: record.status,
            createdAt: record.createdAt
        )
    }

    private static func mapSendReaction(record: OutboxRecord) -> OutboxUIItem {
        let emoji: String?
        if let payload = try? JSONDecoder().decode(ReactionOutboxPayload.self, from: record.payload) {
            emoji = payload.emoji
        } else if let object = try? JSONSerialization.jsonObject(with: record.payload) as? [String: Any] {
            emoji = object["emoji"] as? String
        } else {
            emoji = nil
        }
        return OutboxUIItem(
            id: record.id,
            kind: .reaction,
            titlePreview: emoji,
            iconKind: .reaction,
            attachmentCount: 0,
            source: .conversation(id: record.conversationId),
            status: record.status,
            createdAt: record.createdAt
        )
    }

    private static func mapStory(record: OutboxRecord) -> OutboxUIItem {
        let storyId = extractStoryId(from: record.payload)
        let source: Source = storyId.map { .story(id: $0) } ?? .unknown
        return OutboxUIItem(
            id: record.id,
            kind: .story,
            titlePreview: nil,
            iconKind: .image,
            attachmentCount: 0,
            source: source,
            status: record.status,
            createdAt: record.createdAt
        )
    }

    private static func mapComment(record: OutboxRecord) -> OutboxUIItem {
        let object = (try? JSONSerialization.jsonObject(with: record.payload)) as? [String: Any]
        let postId = object?["postId"] as? String
        let source: Source = postId.map { .post(id: $0) } ?? .unknown
        let content = object?["content"] as? String
        let hasAudio = (object?["localAudioPath"] as? String) != nil

        let icon: IconKind
        let preview: String?
        if record.kind == .deleteComment {
            icon = .none
            preview = nil
        } else if hasAudio {
            icon = .audio
            preview = (content?.isEmpty == false) ? truncatePreview(content!) : "🎙 Note vocale"
        } else {
            icon = .text
            preview = content.flatMap { $0.isEmpty ? nil : truncatePreview($0) }
        }

        return OutboxUIItem(
            id: record.id,
            kind: .postComment,
            titlePreview: preview,
            iconKind: icon,
            attachmentCount: 0,
            source: source,
            status: record.status,
            createdAt: record.createdAt
        )
    }

    private static func mapPostReaction(record: OutboxRecord) -> OutboxUIItem {
        let object = (try? JSONSerialization.jsonObject(with: record.payload)) as? [String: Any]
        let postId = object?["postId"] as? String
        let source: Source = postId.map { .post(id: $0) } ?? .unknown
        let emoji = object?["emoji"] as? String
        return OutboxUIItem(
            id: record.id,
            kind: .postReaction,
            titlePreview: emoji ?? "👍",
            iconKind: .reaction,
            attachmentCount: 0,
            source: source,
            status: record.status,
            createdAt: record.createdAt
        )
    }

    /// A queued post/reel/status create (`.createPost`). Decodes `CreatePostPayload`
    /// to distinguish a REEL / STATUS from a plain POST (so the pill reads
    /// "Publication de réel" / "Publication de statut" vs "Publication de post")
    /// and to derive an accurate media icon + content preview. Falls back to a
    /// plain post on decode failure.
    private static func mapCreatePost(record: OutboxRecord) -> OutboxUIItem {
        let payload = try? JSONDecoder().decode(CreatePostPayload.self, from: record.payload)
        let type = (payload?.type ?? "POST").uppercased()
        let mediaPaths = payload?.localMediaPaths ?? []

        let icon: IconKind
        if let first = mediaPaths.first {
            switch AttachmentKind(mimeType: MimeTypeResolver.mimeType(forExtension: (first as NSString).pathExtension)) {
            case .video: icon = .video
            case .audio: icon = .audio
            default:     icon = .image
            }
        } else {
            icon = .text
        }

        // A status carries a mood emoji rather than a text preview when its body
        // is empty, so the pill still says something meaningful.
        let content = payload?.content ?? ""
        let preview: String?
        if !content.isEmpty {
            preview = truncatePreview(content)
        } else if type == "STATUS", let emoji = payload?.moodEmoji, !emoji.isEmpty {
            preview = emoji
        } else {
            preview = nil
        }

        let rawKind: String
        switch type {
        case "REEL":   rawKind = "createReel"
        case "STATUS": rawKind = "createStatus"
        default:       rawKind = "createPost"
        }

        return OutboxUIItem(
            id: record.id,
            kind: .other(rawKind),
            titlePreview: preview,
            iconKind: icon,
            attachmentCount: mediaPaths.count,
            source: .unknown,
            status: record.status,
            createdAt: record.createdAt
        )
    }

    private static func mapOther(record: OutboxRecord) -> OutboxUIItem {
        return OutboxUIItem(
            id: record.id,
            kind: .other(record.kind.rawValue),
            titlePreview: nil,
            iconKind: .none,
            attachmentCount: 0,
            source: .unknown,
            status: record.status,
            createdAt: record.createdAt
        )
    }

    private static func decodeOfflineQueueItem(_ data: Data) -> OfflineQueueItem? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try? decoder.decode(OfflineQueueItem.self, from: data)
    }

    private static func extractStoryId(from payload: Data) -> String? {
        guard let object = try? JSONSerialization.jsonObject(with: payload) as? [String: Any] else {
            return nil
        }
        if let id = object["originalStoryId"] as? String { return id }
        if let id = object["storyId"] as? String { return id }
        if let id = object["offlineQueueItemId"] as? String { return id }
        return nil
    }

    private static func truncatePreview(_ text: String) -> String {
        if text.count <= previewMaxCharacters {
            return text
        }
        let head = text.prefix(previewMaxCharacters)
        return "\(head)…"
    }
}
