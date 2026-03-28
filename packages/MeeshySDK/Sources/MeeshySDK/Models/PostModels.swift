import Foundation

// MARK: - API Post Models

public struct APIAuthor: Decodable, Sendable {
    public let id: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?

    public var name: String { displayName ?? username ?? "Anonymous" }
}

public struct APIPostMedia: Decodable, Sendable {
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

public struct APIRepostOf: Decodable, Sendable {
    public let id: String
    public let content: String?
    public let author: APIAuthor
    public let media: [APIPostMedia]?
    public let createdAt: Date
    public let likeCount: Int?
    public let commentCount: Int?
    public let isQuote: Bool?
}

public struct APIPostComment: Decodable, Sendable {
    public let id: String
    public let content: String
    public let originalLanguage: String?
    public let translations: [String: APIPostTranslationEntry]?
    public let likeCount: Int?
    public let replyCount: Int?
    public let createdAt: Date
    public let author: APIAuthor
}

public struct APIPostTranslationEntry: Decodable, Sendable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?
    public let createdAt: String?
}

public struct APIPost: Decodable, Sendable {
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
    public let isLikedByMe: Bool?
}

public struct APIPostViewer: Decodable, Sendable {
    public let id: String
    public let userId: String
    public let viewedAt: Date?
    public let duration: Int?
    public let user: APIAuthor?
}

public struct PostViewersResponse: Decodable, Sendable {
    public let items: [APIPostViewer]
    public let pagination: PostViewersPagination
}

public struct PostViewersPagination: Decodable, Sendable {
    public let total: Int
    public let offset: Int
    public let limit: Int
    public let hasMore: Bool
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
    public func toFeedPost(userLanguage: String? = nil, preferredLanguages: [String] = []) -> FeedPost {
        let langs = preferredLanguages.isEmpty ? (userLanguage.map { [$0] } ?? []) : preferredLanguages

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
            let commentTranslatedContent: String? = Self.resolveTranslation(
                translations: c.translations, originalLanguage: c.originalLanguage, preferredLanguages: langs
            )
            return FeedComment(id: c.id, author: c.author.name, authorId: c.author.id,
                        authorAvatarURL: c.author.avatar,
                        content: c.content,
                        timestamp: c.createdAt, likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                        originalLanguage: c.originalLanguage, translatedContent: commentTranslatedContent)
        }

        var repost: RepostContent?
        if let r = repostOf {
            repost = RepostContent(id: r.id, author: r.author.name, authorId: r.author.id,
                                   authorAvatarURL: r.author.avatar,
                                   content: r.content ?? "",
                                   timestamp: r.createdAt, likes: r.likeCount ?? 0,
                                   isQuote: r.isQuote ?? false)
        }

        let postTranslations: [String: PostTranslation]? = translations?.mapValues { entry in
            PostTranslation(text: entry.text, translationModel: entry.translationModel, confidenceScore: entry.confidenceScore)
        }
        let postTranslatedContent: String? = Self.resolveTranslation(
            translations: translations, originalLanguage: originalLanguage, preferredLanguages: langs
        )

        var feedPost = FeedPost(id: id, author: author.name, authorId: author.id,
                        authorAvatarURL: author.avatar,
                        type: type, content: content ?? "",
                        timestamp: createdAt, likes: likeCount ?? 0,
                        comments: feedComments, commentCount: commentCount ?? feedComments.count,
                        repost: repost, repostAuthor: repostOf != nil ? author.name : nil,
                        isQuote: isQuote ?? false,
                        media: feedMedia,
                        originalLanguage: originalLanguage, translations: postTranslations, translatedContent: postTranslatedContent)
        feedPost.isLiked = isLikedByMe ?? false
        return feedPost
    }

    /// Prisme Linguistique resolution: walk preferred languages in order.
    /// If original is already in a preferred language, return nil (no translation needed).
    private static func resolveTranslation(
        translations: [String: APIPostTranslationEntry]?,
        originalLanguage: String?,
        preferredLanguages: [String]
    ) -> String? {
        guard let translations, !translations.isEmpty else { return nil }
        let origLower = originalLanguage?.lowercased()
        for lang in preferredLanguages {
            let langLower = lang.lowercased()
            if let orig = origLower, orig == langLower { return nil }
            if let match = translations.first(where: { $0.key.lowercased() == langLower }) {
                return match.value.text
            }
        }
        return nil
    }
}
