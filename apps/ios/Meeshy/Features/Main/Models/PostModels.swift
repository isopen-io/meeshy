import Foundation

// MARK: - API Post Models (Decodable from Gateway)

struct APIAuthor: Decodable {
    let id: String
    let username: String?
    let displayName: String?
    let avatar: String?
    let avatarUrl: String?

    var name: String {
        displayName ?? username ?? "Anonymous"
    }
}

struct APIPostMedia: Decodable {
    let id: String
    let fileName: String?
    let originalName: String?
    let mimeType: String?
    let fileSize: Int?
    let fileUrl: String?
    let width: Int?
    let height: Int?
    let thumbnailUrl: String?
    let duration: Int?
    let order: Int?
    let caption: String?
    let alt: String?

    var mediaType: FeedMediaType {
        guard let mime = mimeType else { return .image }
        if mime.hasPrefix("video/") { return .video }
        if mime.hasPrefix("audio/") { return .audio }
        if mime.hasPrefix("application/") { return .document }
        return .image
    }
}

struct APIRepostOf: Decodable {
    let id: String
    let content: String?
    let author: APIAuthor
    let media: [APIPostMedia]?
    let createdAt: Date
    let likeCount: Int?
    let commentCount: Int?
}

struct APIPostComment: Decodable {
    let id: String
    let content: String
    let originalLanguage: String?
    let likeCount: Int?
    let replyCount: Int?
    let createdAt: Date
    let author: APIAuthor
}

struct APIPost: Decodable {
    let id: String
    let type: String?
    let visibility: String?
    let content: String?
    let originalLanguage: String?
    let createdAt: Date
    let updatedAt: Date?

    // Author
    let author: APIAuthor

    // Counters
    let likeCount: Int?
    let commentCount: Int?
    let repostCount: Int?
    let viewCount: Int?
    let bookmarkCount: Int?
    let shareCount: Int?

    // Reactions
    let reactionSummary: [String: Int]?

    // Flags
    let isPinned: Bool?
    let isEdited: Bool?

    // Media
    let media: [APIPostMedia]?

    // Comments (top 3)
    let comments: [APIPostComment]?

    // Repost
    let repostOf: APIRepostOf?
    let isQuote: Bool?

    // Status-specific
    let moodEmoji: String?
    let audioUrl: String?
    let audioDuration: Int?
}

// MARK: - Conversion to FeedPost (UI model)

extension APIPost {
    func toFeedPost() -> FeedPost {
        let feedMedia: [FeedMedia] = (media ?? []).map { m in
            FeedMedia(
                id: m.id,
                type: m.mediaType,
                url: m.fileUrl,
                thumbnailColor: thumbnailColorForMime(m.mimeType),
                width: m.width,
                height: m.height,
                duration: m.duration.map { $0 / 1000 }, // ms -> seconds
                fileName: m.originalName ?? m.fileName,
                fileSize: m.fileSize.map { formatFileSize($0) }
            )
        }

        let feedComments: [FeedComment] = (comments ?? []).map { c in
            FeedComment(
                id: c.id,
                author: c.author.name,
                content: c.content,
                timestamp: c.createdAt,
                likes: c.likeCount ?? 0,
                replies: c.replyCount ?? 0
            )
        }

        var repost: RepostContent?
        if let r = repostOf {
            repost = RepostContent(
                id: r.id,
                author: r.author.name,
                content: r.content ?? "",
                timestamp: r.createdAt,
                likes: r.likeCount ?? 0
            )
        }

        return FeedPost(
            id: id,
            author: author.name,
            content: content ?? "",
            timestamp: createdAt,
            likes: likeCount ?? 0,
            comments: feedComments,
            commentCount: commentCount ?? feedComments.count,
            repost: repost,
            repostAuthor: repostOf != nil ? author.name : nil,
            media: feedMedia
        )
    }
}

// MARK: - Helpers

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
