import Foundation

// MARK: - API Post Models

public struct APIAuthor: Decodable {
    public let id: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?
    public let avatarUrl: String?

    public var name: String { displayName ?? username ?? "Anonymous" }
}

public struct APIPostMedia: Decodable {
    public let id: String
    public let fileName: String?
    public let originalName: String?
    public let mimeType: String?
    public let fileSize: Int?
    public let fileUrl: String?
    public let width: Int?
    public let height: Int?
    public let thumbnailUrl: String?
    public let duration: Int?
    public let order: Int?
    public let caption: String?
    public let alt: String?
    public let transcription: APIAttachmentTranscription?
    public let translations: [String: APIAttachmentTranslation]?

    public var mediaType: FeedMediaType {
        guard let mime = mimeType else { return .image }
        if mime.hasPrefix("video/") { return .video }
        if mime.hasPrefix("audio/") { return .audio }
        if mime.hasPrefix("application/") { return .document }
        return .image
    }
}

public struct APIRepostOf: Decodable {
    public let id: String
    public let content: String?
    public let author: APIAuthor
    public let media: [APIPostMedia]?
    public let createdAt: Date
    public let likeCount: Int?
    public let commentCount: Int?
}

public struct APIPostComment: Decodable {
    public let id: String
    public let content: String
    public let originalLanguage: String?
    public let likeCount: Int?
    public let replyCount: Int?
    public let createdAt: Date
    public let author: APIAuthor
}

public struct APIPostTranslationEntry: Decodable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?
    public let createdAt: String?

    enum CodingKeys: String, CodingKey {
        case text
        case translationModel = "translation_model"
        case confidenceScore  = "confidence_score"
        case createdAt        = "created_at"
    }
}

public struct APIPost: Decodable {
    public let id: String
    public let type: String?
    public let visibility: String?
    public let content: String?
    public let originalLanguage: String?
    public let createdAt: Date
    public let updatedAt: Date?
    public let expiresAt: Date?
    public let author: APIAuthor
    public let likeCount: Int?
    public let commentCount: Int?
    public let repostCount: Int?
    public let viewCount: Int?
    public let bookmarkCount: Int?
    public let shareCount: Int?
    public let reactionSummary: [String: Int]?
    public let isPinned: Bool?
    public let isEdited: Bool?
    public let media: [APIPostMedia]?
    public let comments: [APIPostComment]?
    public let repostOf: APIRepostOf?
    public let isQuote: Bool?
    public let moodEmoji: String?
    public let audioUrl: String?
    public let audioDuration: Int?
    public let storyEffects: StoryEffects?
    public let translations: [String: APIPostTranslationEntry]?
}

// MARK: - Conversion helpers

private func thumbnailColorForMime(_ mimeType: String?) -> String {
    guard let mime = mimeType else { return "4ECDC4" }
    if mime.hasPrefix("video/") { return "FF6B6B" }
    if mime.hasPrefix("audio/") { return "9B59B6" }
    if mime.hasPrefix("application/") { return "F8B500" }
    return "4ECDC4"
}

private func formatFileSize(_ bytes: Int) -> String {
    if bytes < 1024 { return "\(bytes) B" }
    if bytes < 1048576 { return String(format: "%.1f KB", Double(bytes) / 1024) }
    return String(format: "%.1f MB", Double(bytes) / 1048576)
}

extension APIPost {
    public func toFeedPost() -> FeedPost {
        let feedMedia: [FeedMedia] = (media ?? []).map { m in
            let transcription: MessageTranscription? = m.transcription.map { t in
                let segments: [MessageTranscriptionSegment] = (t.segments ?? []).map { seg in
                    MessageTranscriptionSegment(
                        text: seg.text,
                        startTime: seg.startTime,
                        endTime: seg.endTime,
                        speakerId: seg.speakerId
                    )
                }
                return MessageTranscription(
                    attachmentId: m.id,
                    text: t.resolvedText,
                    language: t.language ?? "und",
                    confidence: t.confidence,
                    durationMs: t.durationMs,
                    segments: segments,
                    speakerCount: t.speakerCount
                )
            }
            return FeedMedia(
                id: m.id, type: m.mediaType, url: m.fileUrl,
                thumbnailColor: thumbnailColorForMime(m.mimeType),
                width: m.width, height: m.height,
                duration: m.duration.map { $0 / 1000 },
                fileName: m.originalName ?? m.fileName,
                fileSize: m.fileSize.map { formatFileSize($0) },
                transcription: transcription
            )
        }

        let feedComments: [FeedComment] = (comments ?? []).map { c in
            FeedComment(id: c.id, author: c.author.name, authorId: c.author.id,
                        authorAvatarURL: c.author.avatar ?? c.author.avatarUrl,
                        content: c.content,
                        timestamp: c.createdAt, likes: c.likeCount ?? 0, replies: c.replyCount ?? 0)
        }

        var repost: RepostContent?
        if let r = repostOf {
            repost = RepostContent(id: r.id, author: r.author.name, authorId: r.author.id,
                                   authorAvatarURL: r.author.avatar ?? r.author.avatarUrl,
                                   content: r.content ?? "",
                                   timestamp: r.createdAt, likes: r.likeCount ?? 0)
        }

        return FeedPost(id: id, author: author.name, authorId: author.id,
                        authorAvatarURL: author.avatar ?? author.avatarUrl,
                        content: content ?? "",
                        timestamp: createdAt, likes: likeCount ?? 0,
                        comments: feedComments, commentCount: commentCount ?? feedComments.count,
                        repost: repost, repostAuthor: repostOf != nil ? author.name : nil,
                        media: feedMedia)
    }
}
