import Foundation

// MARK: - API Post Models

public struct APIAuthor: Codable, Sendable {
    public let id: String
    public let username: String?
    public let displayName: String?
    public let avatar: String?

    /// Présence auteur — servie UNIQUEMENT par le chemin stories du gateway
    /// (`storyAuthorSelect` : feed complet + projection tray) pour que
    /// l'interstitiel d'identité du viewer résolve la présence AU moment du
    /// switch de groupe. `nil` sur tous les autres payloads (posts, comments,
    /// viewers) et sur les caches antérieurs — décodage rétro-compatible.
    public let isOnline: Bool?
    public let lastActiveAt: Date?

    public var name: String { displayName ?? username ?? "Anonymous" }

    public init(id: String, username: String?, displayName: String?, avatar: String?,
                isOnline: Bool? = nil, lastActiveAt: Date? = nil) {
        self.id = id
        self.username = username
        self.displayName = displayName
        self.avatar = avatar
        self.isOnline = isOnline
        self.lastActiveAt = lastActiveAt
    }
}

public struct APIPostMedia: Codable, Sendable {
    public let id: String
    public let fileName: String?
    public let originalName: String?
    public let mimeType: String?
    public let fileSize: Int?
    public let fileUrl: String?
    public let width: Int?
    public let height: Int?
    public let thumbnailUrl: String?
    public let thumbHash: String?
    public let duration: Int?
    public let order: Int?
    public let caption: String?
    public let alt: String?

    // Prisme Linguistique foundation (R1 — gateway now selects these on
    // every PostMedia response). `language` is the media's base ISO 639-1
    // code; `variantOf` is the FK to the source media when this row is an
    // auto-generated variant (e.g. a TTS clone in another language).
    // Pre-R7 these fields existed on the wire but iOS dropped them
    // silently because the model didn't declare them — blocking any
    // language-aware fallback resolution on the iOS side.
    public let language: String?
    public let variantOf: String?

    public let transcription: APIAttachmentTranscription?
    public let translations: [String: APIAttachmentTranslation]?

    public var mediaType: FeedMediaType {
        // Single source of truth for the mime → family dispatch.
        // See `AttachmentKind` in MeeshySDK/Models.
        // Missing/empty mime falls back to `.image` — feed posts are
        // image-by-default and the gallery renderer needs SOMETHING to
        // present rather than refusing to display the row.
        guard let mime = mimeType, !mime.isEmpty else { return .image }
        switch AttachmentKind(mimeType: mime) {
        case .video:        return .video
        case .audio:        return .audio
        case .image:        return .image
        case .pdf, .spreadsheet, .document, .presentation,
             .archive, .code, .text, .other:
            return .document
        }
    }
}

public struct APIRepostOf: Codable, Sendable {
    public let id: String
    public let type: String?
    public let content: String?
    public let originalLanguage: String?
    public let translations: [String: APIPostTranslationEntry]?
    public let storyEffects: StoryEffects?
    public let audioUrl: String?
    public let moodEmoji: String?
    public let originalRepostOfId: String?
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
    public let parentId: String?
    public let translations: [String: APIPostTranslationEntry]?
    public let likeCount: Int?
    public let replyCount: Int?
    public let effectFlags: Int?
    public let createdAt: Date
    public let author: APIAuthor
    public let currentUserReactions: [String]?
    /// Média unique attaché au commentaire (image/vidéo/audio). Réutilise le modèle
    /// `APIPostMedia` (mêmes champs Prisme : transcription/translations). Un commentaire
    /// ne porte qu'un seul média ; le tableau reste pour parité avec les posts.
    public let media: [APIPostMedia]?
}

public struct APIPostTranslationEntry: Codable, Sendable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?
    public let createdAt: String?
}

public struct APIPost: Sendable {
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
    // Compteurs d'engagement optionnels (server-augmented). Défaut memberwise
    // `= nil` : permet la construction runtime/test sans les fournir explicitement.
    // Décodage INCHANGÉ — `Decodable` synthétisé lit ces clés via `decodeIfPresent`
    // (le défaut ne sert qu'à l'init memberwise, pas au décodage).
    public var postOpenCount: Int? = nil
    public var qualifiedViewCount: Int? = nil
    public var playCount: Int? = nil
    public var impressionCount: Int? = nil
    public let bookmarkCount: Int?
    public let shareCount: Int?
    public let reactionSummary: [String: Int]?
    public let isPinned: Bool?
    public let isEdited: Bool?
    public let media: [APIPostMedia]?
    public let comments: [APIPostComment]?
    public let repostOf: APIRepostOf?
    public let originalRepostOfId: String?
    public let isQuote: Bool?
    public let moodEmoji: String?
    public let audioUrl: String?
    public let audioDuration: Int?
    public let storyEffects: StoryEffects?
    public let translations: [String: APIPostTranslationEntry]?
    public let isLikedByMe: Bool?
    public let isBookmarkedByMe: Bool?
    public let isRepostedByMe: Bool?
    public let isViewedByMe: Bool?
    public let currentUserReactions: [String]?
    public let mentionedUsers: [MentionedUser]?
    public let viaUsername: String?
    /// Outbound-link tracking mappings minted by the gateway. Parsed from the
    /// top-level `trackingLinks` (socket `post:created` / `story:created` /
    /// `comment:added`) OR from `metadata.trackingLinks` (REST / feed). `nil`
    /// when the payload predates the feature — renderer falls back to raw URLs.
    public var trackingLinks: [TrackedLink]? = nil

    /// `[rawURL: token]` lookup derived from `trackingLinks`. Empty when none.
    public var trackedLinkMap: [String: String] { (trackingLinks ?? []).trackedLinkMap }
}

extension APIPost: Decodable {
    private enum CodingKeys: String, CodingKey {
        case id, type, visibility, content, originalLanguage, createdAt, updatedAt, expiresAt
        case author, likeCount, commentCount, repostCount, viewCount
        case postOpenCount, qualifiedViewCount, playCount, impressionCount
        case bookmarkCount, shareCount, reactionSummary, isPinned, isEdited
        case media, comments, repostOf, originalRepostOfId, isQuote, moodEmoji
        case audioUrl, audioDuration, storyEffects, translations
        case isLikedByMe, isBookmarkedByMe, isRepostedByMe, isViewedByMe
        case currentUserReactions, mentionedUsers, viaUsername
        case trackingLinks, metadata
    }

    /// Minimal `metadata` envelope to recover `trackingLinks` on REST/feed
    /// payloads (socket payloads hoist it top-level). Decoded tolerantly.
    private struct PostMetadataEnvelope: Decodable {
        let trackingLinks: [TrackedLink]?
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        visibility = try c.decodeIfPresent(String.self, forKey: .visibility)
        content = try c.decodeIfPresent(String.self, forKey: .content)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        createdAt = try c.decode(Date.self, forKey: .createdAt)
        updatedAt = try c.decodeIfPresent(Date.self, forKey: .updatedAt)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        author = try c.decode(APIAuthor.self, forKey: .author)
        likeCount = try c.decodeIfPresent(Int.self, forKey: .likeCount)
        commentCount = try c.decodeIfPresent(Int.self, forKey: .commentCount)
        repostCount = try c.decodeIfPresent(Int.self, forKey: .repostCount)
        viewCount = try c.decodeIfPresent(Int.self, forKey: .viewCount)
        postOpenCount = try c.decodeIfPresent(Int.self, forKey: .postOpenCount)
        qualifiedViewCount = try c.decodeIfPresent(Int.self, forKey: .qualifiedViewCount)
        playCount = try c.decodeIfPresent(Int.self, forKey: .playCount)
        impressionCount = try c.decodeIfPresent(Int.self, forKey: .impressionCount)
        bookmarkCount = try c.decodeIfPresent(Int.self, forKey: .bookmarkCount)
        shareCount = try c.decodeIfPresent(Int.self, forKey: .shareCount)
        reactionSummary = try c.decodeIfPresent([String: Int].self, forKey: .reactionSummary)
        isPinned = try c.decodeIfPresent(Bool.self, forKey: .isPinned)
        isEdited = try c.decodeIfPresent(Bool.self, forKey: .isEdited)
        media = try c.decodeIfPresent([APIPostMedia].self, forKey: .media)
        comments = try c.decodeIfPresent([APIPostComment].self, forKey: .comments)
        repostOf = try c.decodeIfPresent(APIRepostOf.self, forKey: .repostOf)
        originalRepostOfId = try c.decodeIfPresent(String.self, forKey: .originalRepostOfId)
        isQuote = try c.decodeIfPresent(Bool.self, forKey: .isQuote)
        moodEmoji = try c.decodeIfPresent(String.self, forKey: .moodEmoji)
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl)
        audioDuration = try c.decodeIfPresent(Int.self, forKey: .audioDuration)
        // Resilience: a single malformed `storyEffects` payload (a type mismatch
        // on a present nested field of another user's story) must NOT fail the
        // whole `APIPost` decode — the story feed is decoded as a strict array,
        // so one throwing post would drop the ENTIRE batch ("0 stories loaded").
        // Degrade this post to no effects (it still renders content/media) and
        // keep the rest of the list intact.
        do {
            storyEffects = try c.decodeIfPresent(StoryEffects.self, forKey: .storyEffects)
        } catch {
            storyEffects = nil
        }
        translations = try c.decodeIfPresent([String: APIPostTranslationEntry].self, forKey: .translations)
        isLikedByMe = try c.decodeIfPresent(Bool.self, forKey: .isLikedByMe)
        isBookmarkedByMe = try c.decodeIfPresent(Bool.self, forKey: .isBookmarkedByMe)
        isRepostedByMe = try c.decodeIfPresent(Bool.self, forKey: .isRepostedByMe)
        isViewedByMe = try c.decodeIfPresent(Bool.self, forKey: .isViewedByMe)
        currentUserReactions = try c.decodeIfPresent([String].self, forKey: .currentUserReactions)
        mentionedUsers = try c.decodeIfPresent([MentionedUser].self, forKey: .mentionedUsers)
        viaUsername = try c.decodeIfPresent(String.self, forKey: .viaUsername)
        // Outbound-link tracking: prefer hoisted top-level `trackingLinks`
        // (socket), else recover from the REST `metadata` envelope. Tolerant.
        if let topLevel = try? c.decodeIfPresent([TrackedLink].self, forKey: .trackingLinks), !topLevel.isEmpty {
            trackingLinks = topLevel
        } else {
            trackingLinks = (try? c.decodeIfPresent(PostMetadataEnvelope.self, forKey: .metadata))??.trackingLinks
        }
    }
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
    // Defers to `AttachmentKind.hexTintColor` — the single source of truth
    // for attachment palette. Used by the feed thumbnail generator.
    AttachmentKind(mimeType: mimeType ?? "").hexTintColor
}

private func formatFileSize(_ bytes: Int) -> String {
    if bytes < 1024 { return "\(bytes) B" }
    if bytes < 1048576 { return String(format: "%.1f KB", Double(bytes) / 1024) }
    return String(format: "%.1f MB", Double(bytes) / 1048576)
}

extension APIPostMedia {
    /// Single source of truth `APIPostMedia → FeedMedia` mapping, shared by post
    /// media, repost media AND comment media. Carries the full Prisme Linguistique
    /// payload (transcription + per-language TTS variants) so a comment's inline
    /// media plays + switches language exactly like a message bubble or a reel.
    public func toFeedMedia() -> FeedMedia {
        let transcription: MessageTranscription? = self.transcription.map { t in
            let segments: [MessageTranscriptionSegment] = (t.segments ?? []).map { seg in
                MessageTranscriptionSegment(
                    text: seg.text,
                    startTime: seg.startTime,
                    endTime: seg.endTime,
                    speakerId: seg.speakerId
                )
            }
            return MessageTranscription(
                attachmentId: id,
                text: t.resolvedText,
                language: t.language ?? "und",
                confidence: t.confidence,
                durationMs: t.durationMs,
                segments: segments,
                speakerCount: t.speakerCount
            )
        }
        let translatedAudios: [MessageTranslatedAudio] = (translations ?? [:]).compactMap { (lang, trans) in
            guard let url = trans.url, !url.isEmpty else { return nil }
            let segments = (trans.segments ?? []).map {
                MessageTranscriptionSegment(
                    text: $0.text,
                    startTime: $0.startTime,
                    endTime: $0.endTime,
                    speakerId: $0.speakerId
                )
            }
            return MessageTranslatedAudio(
                id: "\(id)_\(lang)",
                attachmentId: id,
                targetLanguage: lang,
                url: url,
                transcription: trans.transcription ?? "",
                durationMs: trans.durationMs ?? 0,
                format: trans.format ?? "mp3",
                cloned: trans.cloned ?? false,
                quality: trans.quality ?? 0,
                voiceModelId: trans.voiceModelId,
                ttsModel: trans.ttsModel ?? "xtts",
                segments: segments
            )
        }
        return FeedMedia(
            id: id, type: mediaType, url: fileUrl,
            thumbnailUrl: thumbnailUrl, thumbHash: thumbHash,
            thumbnailColor: thumbnailColorForMime(mimeType),
            width: width, height: height,
            duration: duration.map { $0 / 1000 },
            fileName: originalName ?? fileName,
            fileSize: fileSize.map { formatFileSize($0) },
            transcription: transcription,
            translatedAudios: translatedAudios
        )
    }
}

extension APIPost {
    public func toFeedPost(userLanguage: String? = nil, preferredLanguages: [String] = []) -> FeedPost {
        let langs = preferredLanguages.isEmpty ? (userLanguage.map { [$0] } ?? []) : preferredLanguages

        let feedMedia: [FeedMedia] = (media ?? []).map { $0.toFeedMedia() }

        let feedComments: [FeedComment] = (comments ?? []).map { c in
            let commentTranslatedContent: String? = Self.resolveTranslation(
                translations: c.translations, originalLanguage: c.originalLanguage, preferredLanguages: langs
            )
            if let username = c.author.username {
                UserDisplayNameCache.shared.track(username: username, displayName: c.author.name)
            }
            return FeedComment(id: c.id, author: c.author.name, authorId: c.author.id,
                        authorUsername: c.author.username,
                        authorAvatarURL: c.author.avatar,
                        content: c.content,
                        timestamp: c.createdAt, likes: c.likeCount ?? 0, replies: c.replyCount ?? 0,
                        parentId: c.parentId, effectFlags: c.effectFlags ?? 0,
                        originalLanguage: c.originalLanguage, translatedContent: commentTranslatedContent,
                        currentUserReactions: c.currentUserReactions,
                        media: (c.media ?? []).map { $0.toFeedMedia() })
        }

        var repost: RepostContent?
        if let r = repostOf {
            let repostMedia: [FeedMedia] = (r.media ?? []).map { m in
                FeedMedia(
                    id: m.id, type: m.mediaType, url: m.fileUrl,
                    thumbnailUrl: m.thumbnailUrl, thumbHash: m.thumbHash,
                    thumbnailColor: thumbnailColorForMime(m.mimeType),
                    width: m.width, height: m.height,
                    duration: m.duration.map { $0 / 1000 },
                    fileName: m.originalName ?? m.fileName,
                    fileSize: m.fileSize.map { formatFileSize($0) }
                )
            }
            let repostTranslations: [String: PostTranslation]? = r.translations?.mapValues { entry in
                PostTranslation(text: entry.text, translationModel: entry.translationModel, confidenceScore: entry.confidenceScore)
            }
            repost = RepostContent(id: r.id, author: r.author.name, authorId: r.author.id,
                                   authorUsername: r.author.username,
                                   authorAvatarURL: r.author.avatar,
                                   content: r.content ?? "",
                                   timestamp: r.createdAt, likes: r.likeCount ?? 0,
                                   isQuote: r.isQuote ?? false,
                                   type: r.type,
                                   originalLanguage: r.originalLanguage,
                                   audioUrl: r.audioUrl,
                                   moodEmoji: r.moodEmoji,
                                   storyEffects: r.storyEffects,
                                   media: repostMedia,
                                   translations: repostTranslations,
                                   originalRepostOfId: r.originalRepostOfId,
                                   visibility: nil,
                                   expiresAt: nil)
        }

        let postTranslations: [String: PostTranslation]? = translations?.mapValues { entry in
            PostTranslation(text: entry.text, translationModel: entry.translationModel, confidenceScore: entry.confidenceScore)
        }
        let postTranslatedContent: String? = Self.resolveTranslation(
            translations: translations, originalLanguage: originalLanguage, preferredLanguages: langs
        )

        if let mentionedUsers {
            UserDisplayNameCache.shared.trackFromMentionedUsers(mentionedUsers)
        }
        if let username = author.username {
            UserDisplayNameCache.shared.track(username: username, displayName: author.name)
        }

        var feedPost = FeedPost(id: id, author: author.name, authorId: author.id,
                        authorUsername: author.username,
                        authorAvatarURL: author.avatar,
                        type: type, content: content ?? "",
                        timestamp: createdAt, likes: likeCount ?? 0,
                        comments: feedComments, commentCount: commentCount ?? feedComments.count,
                        repost: repost, repostAuthor: repostOf != nil ? author.name : nil,
                        isQuote: isQuote ?? false,
                        media: feedMedia,
                        originalLanguage: originalLanguage, translations: postTranslations, translatedContent: postTranslatedContent)
        feedPost.isLiked = isLikedByMe ?? false
        feedPost.isBookmarkedByMe = isBookmarkedByMe ?? false
        feedPost.isRepostedByMe = isRepostedByMe ?? false
        // Map the three remaining server-issued counters. The init signature
        // doesn't expose them (kept stable for legacy callers), so we set
        // them post-construction. Missing fields default to 0 — which is
        // honest for pre-migration backends.
        feedPost.repostCount = repostCount ?? 0
        feedPost.bookmarkCount = bookmarkCount ?? 0
        feedPost.shareCount = shareCount ?? 0
        feedPost.viewCount = viewCount ?? 0
        feedPost.postOpenCount = postOpenCount ?? 0
        feedPost.impressionCount = impressionCount ?? 0
        feedPost.qualifiedViewCount = qualifiedViewCount ?? 0
        feedPost.playCount = playCount ?? 0
        // Story canvas + legacy audio (top-level story posts). The init keeps a
        // stable signature, so we set these post-construction like the counters.
        feedPost.storyEffects = storyEffects
        feedPost.audioUrl = audioUrl
        // Outbound-link tracking map (runtime-only, like the counters above).
        feedPost.trackedLinkMap = trackedLinkMap
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
