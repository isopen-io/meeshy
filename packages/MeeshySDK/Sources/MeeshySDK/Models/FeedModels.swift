import Foundation

// MARK: - Feed Media Type
/// `location` a été retiré (2026-07-30) : ni le gateway (PostMedia est
/// fichier-only), ni l'app (fabrique sans appelant) n'ont jamais produit un
/// média de ce type — la position d'un post voyage par `FeedPost.location`
/// (`SharedPlace`), pas par un média.
public enum FeedMediaType: String, Sendable, Codable {
    case image, video, audio, document
}

// MARK: - Story media store routing (R7)

/// Rule engine PUR : type effectif d'un média pour le routage vers les stores
/// disque (`images` / `video` / `audio`). L'extension d'URL, quand elle est
/// reconnue, est la vérité du CONTENU et corrige un `FeedMedia.type` absent
/// ou contradictoire — bug confirmé « mp4 déclaré image → rangé dans le store
/// images (300 Mo) → cache-miss au replay vidéo ». URL sans extension
/// exploitable (CDN signé) → type déclaré, sinon défaut historique `.image`.
public enum StoryMediaStoreRouter {
    private static let videoExtensions: Set<String> = ["mp4", "mov", "m4v", "webm", "avi"]
    private static let audioExtensions: Set<String> = ["m4a", "mp3", "aac", "wav", "ogg", "opus", "caf"]
    private static let imageExtensions: Set<String> = ["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"]

    public static func effectiveKind(declaredType: FeedMediaType?, urlString: String) -> FeedMediaType {
        let ext = URL(string: urlString)?.pathExtension.lowercased() ?? ""
        if videoExtensions.contains(ext) { return .video }
        if audioExtensions.contains(ext) { return .audio }
        if imageExtensions.contains(ext) { return .image }
        return declaredType ?? .image
    }
}

// MARK: - Post Translation
public struct PostTranslation: Sendable, Codable {
    public let text: String
    public let translationModel: String?
    public let confidenceScore: Double?

    public init(text: String, translationModel: String? = nil, confidenceScore: Double? = nil) {
        self.text = text
        self.translationModel = translationModel
        self.confidenceScore = confidenceScore
    }
}

// MARK: - Feed Media Model
public struct FeedMedia: Identifiable, Sendable, Codable {
    public let id: String
    public let type: FeedMediaType
    public let url: String?
    public let thumbnailUrl: String?
    public let thumbHash: String?
    public let thumbnailColor: String
    public var width: Int?
    public var height: Int?
    public var duration: Int?
    public var fileName: String?
    public var fileSize: String?
    public var pageCount: Int?
    /// Légende du média, telle que servie par `PostMedia.caption` (posts, réels,
    /// stories) — le texte que le plein écran affiche SOUS l'image ou la vidéo,
    /// et que VoiceOver lit à sa place.
    ///
    /// Elle existait sur le fil (`APIPostMedia.caption`) et dans le schéma
    /// (`PostMedia.caption`) mais n'était déclarée NI ici NI dans
    /// `toMessageAttachment()` : le décodeur la jetait, et le plein écran d'un
    /// média de post ou de commentaire ne pouvait structurellement rien montrer.
    public var caption: String?
    public var transcription: MessageTranscription?
    /// Per-language TTS variants of an audio media (Prisme Linguistique).
    /// Each carries the translated transcription text + the synthesized audio
    /// URL for that language. Populated for reel/feed audio from the gateway's
    /// `PostMedia.translations` map; empty for non-audio media or when the
    /// translator pipeline has not produced TTS variants yet.
    public var translatedAudios: [MessageTranslatedAudio]
    /// Variantes WebP responsive (D4) de l'image — `nil` pour une image chiffrée
    /// ou un média dont le fil n'en sert pas. Transportées jusqu'à
    /// `MeeshyMessageAttachment.imageVariants` pour que le plein écran élise la
    /// variante à la largeur d'écran (`ImageVariantSelector`) au lieu de charger
    /// l'original multi-Mo — la galerie ouverte depuis un post les perdait.
    /// Décodage tolérant par élément (`LossyImageVariants`) : un blob de feed
    /// persisté dont une variante est partielle rend quand même le média.
    @LossyImageVariants public var imageVariants: [MeeshyImageVariant]?

    /// Ratio largeur/hauteur dérivé de `width`/`height`. `nil` si l'un des
    /// deux est absent ou si l'un des deux vaut 0 (évite une division par
    /// zéro et un faux ratio 0.0 pour une largeur nulle/corrompue).
    public var aspectRatio: Double? {
        guard let width, let height, width > 0, height > 0 else { return nil }
        return Double(width) / Double(height)
    }

    public init(id: String = UUID().uuidString, type: FeedMediaType, url: String? = nil,
                thumbnailUrl: String? = nil, thumbHash: String? = nil,
                thumbnailColor: String = "4ECDC4",
                width: Int? = nil, height: Int? = nil, duration: Int? = nil,
                fileName: String? = nil, fileSize: String? = nil, pageCount: Int? = nil,
                caption: String? = nil,
                transcription: MessageTranscription? = nil,
                translatedAudios: [MessageTranslatedAudio] = [],
                imageVariants: [MeeshyImageVariant]? = nil) {
        self.id = id; self.type = type; self.url = url; self.thumbnailUrl = thumbnailUrl; self.thumbHash = thumbHash; self.thumbnailColor = thumbnailColor
        self.width = width; self.height = height; self.duration = duration
        self.fileName = fileName; self.fileSize = fileSize; self.pageCount = pageCount
        self.caption = caption
        self.transcription = transcription
        self.translatedAudios = translatedAudios
        self.imageVariants = imageVariants
    }

    public static func image(color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, thumbnailColor: color, width: 1200, height: 800)
    }

    public static func image(url: String, color: String = "4ECDC4") -> FeedMedia {
        FeedMedia(type: .image, url: url, thumbnailColor: color, width: 1200, height: 800)
    }

    public static func video(duration: Int, color: String = "FF6B6B") -> FeedMedia {
        FeedMedia(type: .video, thumbnailColor: color, width: 1920, height: 1080, duration: duration)
    }

    public static func audio(duration: Int, color: String = "9B59B6") -> FeedMedia {
        FeedMedia(type: .audio, thumbnailColor: color, duration: duration)
    }

    public static func document(name: String, size: String, pages: Int, color: String = "F8B500") -> FeedMedia {
        FeedMedia(type: .document, thumbnailColor: color, fileName: name, fileSize: size, pageCount: pages)
    }

    public var durationFormatted: String? {
        guard let d = duration else { return nil }
        return String(format: "%d:%02d", d / 60, d % 60)
    }

    // Explicit Codable so a newly-added `translatedAudios` field stays
    // backward-compatible with feed blobs persisted before it existed: a
    // missing key decodes to `[]` instead of throwing `keyNotFound`, which
    // would otherwise drop the whole cached feed page on cold start.
    private enum CodingKeys: String, CodingKey {
        case id, type, url, thumbnailUrl, thumbHash, thumbnailColor
        case width, height, duration, fileName, fileSize, pageCount
        case caption
        case transcription, translatedAudios, imageVariants
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(FeedMediaType.self, forKey: .type)
        url = try c.decodeIfPresent(String.self, forKey: .url)
        thumbnailUrl = try c.decodeIfPresent(String.self, forKey: .thumbnailUrl)
        thumbHash = try c.decodeIfPresent(String.self, forKey: .thumbHash)
        thumbnailColor = try c.decode(String.self, forKey: .thumbnailColor)
        width = try c.decodeIfPresent(Int.self, forKey: .width)
        height = try c.decodeIfPresent(Int.self, forKey: .height)
        duration = try c.decodeIfPresent(Int.self, forKey: .duration)
        fileName = try c.decodeIfPresent(String.self, forKey: .fileName)
        fileSize = try c.decodeIfPresent(String.self, forKey: .fileSize)
        pageCount = try c.decodeIfPresent(Int.self, forKey: .pageCount)
        caption = try c.decodeIfPresent(String.self, forKey: .caption)
        transcription = try c.decodeIfPresent(MessageTranscription.self, forKey: .transcription)
        translatedAudios = try c.decodeIfPresent([MessageTranslatedAudio].self, forKey: .translatedAudios) ?? []
        _imageVariants = try c.decode(LossyImageVariants.self, forKey: .imageVariants)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encodeIfPresent(url, forKey: .url)
        try c.encodeIfPresent(thumbnailUrl, forKey: .thumbnailUrl)
        try c.encodeIfPresent(thumbHash, forKey: .thumbHash)
        try c.encode(thumbnailColor, forKey: .thumbnailColor)
        try c.encodeIfPresent(width, forKey: .width)
        try c.encodeIfPresent(height, forKey: .height)
        try c.encodeIfPresent(duration, forKey: .duration)
        try c.encodeIfPresent(fileName, forKey: .fileName)
        try c.encodeIfPresent(fileSize, forKey: .fileSize)
        try c.encodeIfPresent(pageCount, forKey: .pageCount)
        try c.encodeIfPresent(caption, forKey: .caption)
        try c.encodeIfPresent(transcription, forKey: .transcription)
        if !translatedAudios.isEmpty {
            try c.encode(translatedAudios, forKey: .translatedAudios)
        }
        try c.encodeIfPresent(imageVariants, forKey: .imageVariants)
    }
}

extension FeedMedia {
    /// Bridge to MeeshyMessageAttachment for reuse of media player components
    public func toMessageAttachment() -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(
            id: id,
            fileName: fileName ?? "",
            originalName: fileName ?? "",
            mimeType: mimeTypeFromFeedType,
            fileSize: 0,
            fileUrl: url ?? "",
            caption: caption,
            width: width,
            height: height,
            thumbnailPath: nil,
            thumbnailUrl: thumbnailUrl,
            thumbHash: thumbHash,
            duration: duration.map { $0 * 1000 },
            latitude: nil,
            longitude: nil,
            thumbnailColor: thumbnailColor,
            imageVariants: imageVariants
        )
    }

    private var mimeTypeFromFeedType: String {
        switch type {
        case .image: return "image/jpeg"
        case .video: return "video/mp4"
        case .audio: return "audio/mpeg"
        case .document: return "application/pdf"
        }
    }
}

// MARK: - Repost Content Model
public struct RepostContent: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorUsername: String?
    public let authorColor: String
    public let authorAvatarURL: String?
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public let isQuote: Bool
    /// Type of the reposted entity ("STORY" / "POST" / "STATUS"). Used by the
    /// feed cell to decide whether to render the embedded story canvas.
    public let type: String?
    public let originalLanguage: String?
    public let audioUrl: String?
    /// Mood emoji of the reposted STATUS (nil for non-status sources). Lets the
    /// feed quote-block render the mood instead of an empty body.
    public let moodEmoji: String?
    public let storyEffects: StoryEffects?
    public let media: [FeedMedia]
    public let translations: [String: PostTranslation]?
    public let originalRepostOfId: String?
    public let visibility: String?
    public let expiresAt: Date?
    /// Lieu attaché au post SOURCE (miroir de `FeedPost.location`) : sans lui,
    /// un repost perdait la position de l'original (reste ouvert du lot 2,
    /// clos 2026-07-30).
    public let location: SharedPlace?
    /// Les personnes que le post SOURCE nomme. `nil` = la charge utile n'en
    /// disait rien ; `[]` = elle affirme qu'il n'y en a aucune. Le renderer du
    /// texte cité s'appuie sur cette différence pour décider quoi linkifier.
    public let mentions: [PostReference]?

    /// Les pseudos que le texte cité a le droit de rendre cliquables — miroir
    /// exact de `FeedPost.validMentionUsernames`, même règle, même casse.
    ///
    /// `nil` se propage : sans avis sur les références du source, le renderer
    /// garde son comportement historique. C'est la seule valeur honnête — une
    /// liste vide affirmerait « personne n'est nommé », ce qu'une charge utile
    /// muette ne dit pas.
    public var validMentionUsernames: Set<String>? {
        mentions.map { Set($0.map { $0.username.lowercased() }) }
    }

    public init(id: String = UUID().uuidString, author: String, authorId: String = "",
                authorUsername: String? = nil, authorAvatarURL: String? = nil,
                content: String, timestamp: Date = Date(), likes: Int = 0, isQuote: Bool = false,
                type: String? = nil, originalLanguage: String? = nil, audioUrl: String? = nil,
                moodEmoji: String? = nil,
                storyEffects: StoryEffects? = nil, media: [FeedMedia] = [],
                translations: [String: PostTranslation]? = nil,
                originalRepostOfId: String? = nil, visibility: String? = nil,
                expiresAt: Date? = nil, location: SharedPlace? = nil,
                mentions: [PostReference]? = nil) {
        self.id = id; self.author = author; self.authorId = authorId
        self.authorUsername = authorUsername
        self.authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
        self.authorAvatarURL = authorAvatarURL
        self.content = content; self.timestamp = timestamp; self.likes = likes
        self.isQuote = isQuote
        self.type = type
        self.originalLanguage = originalLanguage
        self.audioUrl = audioUrl
        self.moodEmoji = moodEmoji
        self.storyEffects = storyEffects
        self.media = media
        self.translations = translations
        self.originalRepostOfId = originalRepostOfId
        self.visibility = visibility
        self.expiresAt = expiresAt
        self.location = location
        self.mentions = mentions
    }
}

extension RepostContent: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorUsername, authorAvatarURL, content, timestamp, likes, isQuote
        case type, originalLanguage, audioUrl, moodEmoji, storyEffects, media, translations
        case originalRepostOfId, visibility, expiresAt, location, mentions
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorUsername = try c.decodeIfPresent(String.self, forKey: .authorUsername)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        isQuote = try c.decode(Bool.self, forKey: .isQuote)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl)
        moodEmoji = try c.decodeIfPresent(String.self, forKey: .moodEmoji)
        // Resilience: a single malformed `storyEffects` payload must NOT fail
        // the whole decode (RepostContent/FeedPost are decoded inside strict
        // arrays — one throwing entry would drop the entire feed page). Degrade
        // this entry to no effects (miroir de PostModels.swift:290-293).
        do {
            storyEffects = try c.decodeIfPresent(StoryEffects.self, forKey: .storyEffects)
        } catch {
            storyEffects = nil
        }
        media = try c.decodeIfPresent([FeedMedia].self, forKey: .media) ?? []
        translations = try c.decodeIfPresent([String: PostTranslation].self, forKey: .translations)
        originalRepostOfId = try c.decodeIfPresent(String.self, forKey: .originalRepostOfId)
        visibility = try c.decodeIfPresent(String.self, forKey: .visibility)
        expiresAt = try c.decodeIfPresent(Date.self, forKey: .expiresAt)
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        mentions = try c.decodeIfPresent([PostReference].self, forKey: .mentions)
        authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorUsername, forKey: .authorUsername)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(isQuote, forKey: .isQuote)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(audioUrl, forKey: .audioUrl)
        try c.encodeIfPresent(moodEmoji, forKey: .moodEmoji)
        try c.encodeIfPresent(storyEffects, forKey: .storyEffects)
        if !media.isEmpty { try c.encode(media, forKey: .media) }
        try c.encodeIfPresent(translations, forKey: .translations)
        try c.encodeIfPresent(originalRepostOfId, forKey: .originalRepostOfId)
        try c.encodeIfPresent(visibility, forKey: .visibility)
        try c.encodeIfPresent(expiresAt, forKey: .expiresAt)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encodeIfPresent(mentions, forKey: .mentions)
    }
}

// MARK: - Repost Reel Classification

public extension RepostContent {
    /// True when the reposted content is a reel (server-side `REEL` type is the
    /// single source of truth, mirroring `FeedPost.isReel`). Lets the feed cell
    /// render a rich reel preview instead of the empty text-only quote block.
    var isReel: Bool {
        (type ?? "").uppercased() == "REEL"
    }

    /// Media surfaced first when previewing a reposted reel: the first video,
    /// else the first audio, else the first image. `nil` when the repost is not a
    /// reel or carries no playable/visual media. Mirrors `FeedPost.primaryReelMedia`.
    var primaryReelMedia: FeedMedia? {
        guard isReel else { return nil }
        if let video = media.first(where: { $0.type == .video }) { return video }
        if let audio = media.first(where: { $0.type == .audio }) { return audio }
        return media.first(where: { $0.type == .image })
    }
}

// MARK: - Feed Comment Model
public struct FeedComment: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorUsername: String?
    public let authorColor: String
    public let authorAvatarURL: String?
    public let parentId: String?
    public let content: String
    public let timestamp: Date
    public var likes: Int
    public var replies: Int
    public var effectFlags: Int
    public var originalLanguage: String?
    public var translatedContent: String?
    /// Emojis avec lesquels l'utilisateur courant a réagi sur ce commentaire.
    /// Hydraté depuis `APIPostComment.currentUserReactions` au mapping.
    /// Persisté dans le cache GRDB iOS via le Codable manuel ci-dessous —
    /// permet de restaurer l'état "liké par moi" au cold start sans API call.
    public var currentUserReactions: [String]?
    /// Média unique attaché au commentaire (image/vidéo/audio). Réutilise `FeedMedia`
    /// (même bridge `toMessageAttachment()` que les posts → mêmes viewers inline +
    /// plein écran que les messages). Vide pour un commentaire texte. Le pipeline
    /// audio enrichit la transcription/`translatedAudios` via `comment:media-updated`.
    public var media: [FeedMedia]
    /// Lieu attaché au commentaire (`APIPostComment.location`, hissé par le
    /// gateway depuis `metadata.location`). Était décodé puis JETÉ au passage
    /// domaine — même panne que `FeedPost.location`, corrigée le 2026-07-30.
    public var location: SharedPlace? = nil

    public var displayContent: String { translatedContent ?? content }

    public var effects: MessageEffects {
        MessageEffects(flags: MessageEffectFlags(rawValue: UInt32(clamping: effectFlags)))
    }

    /// Copie éditée (édition par l'auteur) : nouveau contenu + effets, tout le
    /// reste préservé. `content` étant immuable (let), l'édition passe par une
    /// copie. Un contenu MODIFIÉ invalide `translatedContent` — les traductions
    /// décrivaient l'ancien texte ; le pipeline serveur régénère et les vues se
    /// mettent à jour via `comment:translation-updated`.
    public func withEditedContent(_ newContent: String, effectFlags newFlags: Int) -> FeedComment {
        FeedComment(
            id: id, author: author, authorId: authorId, authorUsername: authorUsername,
            authorAvatarURL: authorAvatarURL,
            content: newContent, timestamp: timestamp, likes: likes, replies: replies,
            parentId: parentId, effectFlags: newFlags,
            originalLanguage: originalLanguage,
            translatedContent: newContent == content ? translatedContent : nil,
            currentUserReactions: currentUserReactions, media: media, location: location
        )
    }

    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorUsername: String? = nil,
                authorAvatarURL: String? = nil,
                content: String, timestamp: Date = Date(), likes: Int = 0, replies: Int = 0,
                parentId: String? = nil, effectFlags: Int = 0,
                originalLanguage: String? = nil, translatedContent: String? = nil,
                currentUserReactions: [String]? = nil, media: [FeedMedia] = [],
                location: SharedPlace? = nil) {
        self.id = id; self.author = author; self.authorId = authorId; self.authorUsername = authorUsername
        self.authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
        self.authorAvatarURL = authorAvatarURL; self.parentId = parentId
        self.content = content; self.timestamp = timestamp; self.likes = likes; self.replies = replies
        self.effectFlags = effectFlags
        self.originalLanguage = originalLanguage; self.translatedContent = translatedContent
        self.currentUserReactions = currentUserReactions
        self.media = media
        self.location = location
    }
}

extension FeedComment: CacheIdentifiable {}

extension FeedComment: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorUsername, authorAvatarURL, parentId, content, timestamp, likes, replies
        case effectFlags, originalLanguage, translatedContent, currentUserReactions, media, location
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorUsername = try c.decodeIfPresent(String.self, forKey: .authorUsername)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        parentId = try c.decodeIfPresent(String.self, forKey: .parentId)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        replies = try c.decode(Int.self, forKey: .replies)
        effectFlags = try c.decodeIfPresent(Int.self, forKey: .effectFlags) ?? 0
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        translatedContent = try c.decodeIfPresent(String.self, forKey: .translatedContent)
        currentUserReactions = try c.decodeIfPresent([String].self, forKey: .currentUserReactions)
        media = try c.decodeIfPresent([FeedMedia].self, forKey: .media) ?? []
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        authorColor = DynamicColorGenerator.colorForName(authorId.isEmpty ? author : authorId)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorUsername, forKey: .authorUsername)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encodeIfPresent(parentId, forKey: .parentId)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(replies, forKey: .replies)
        try c.encode(effectFlags, forKey: .effectFlags)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(translatedContent, forKey: .translatedContent)
        try c.encodeIfPresent(currentUserReactions, forKey: .currentUserReactions)
        if !media.isEmpty {
            try c.encode(media, forKey: .media)
        }
        try c.encodeIfPresent(location, forKey: .location)
    }
}

// MARK: - Feed Post Model
public struct FeedPost: Identifiable, Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorUsername: String?
    public let authorColor: String
    public let authorAvatarURL: String?
    public let type: String?
    /// Mutable so optimistic edit flows (FeedViewModel.updatePost) can
    /// rewrite the body without reconstructing the whole struct. All
    /// other identity / authorship fields stay immutable.
    public var content: String
    public let timestamp: Date
    public var likes: Int
    public var isLiked: Bool = false
    /// Whether the current user has bookmarked this post. Server-enriched
    /// via `PostFeedService.getFeed` — drives the filled amber bookmark
    /// icon on first render without needing the cache-hydrate fallback.
    public var isBookmarkedByMe: Bool = false
    /// Whether the current user has reposted this post (any of their posts
    /// has `repostOfId == this.id`). Drives the filled green repost icon.
    public var isRepostedByMe: Bool = false
    public var comments: [FeedComment] = []
    public var commentCount: Int = 0
    /// Server-issued repost count — total reposts of this post. Distinct from
    /// `isReposted` which (when present, currently absent server-side) would
    /// indicate whether the *current user* has reposted.
    public var repostCount: Int = 0
    /// Server-issued bookmark count.
    public var bookmarkCount: Int = 0
    /// Server-issued share count (every `POST /posts/:id/share` increments it).
    public var shareCount: Int = 0
    /// Server-issued unique-view count (`Post.viewCount`). Set via
    /// `APIPost.toFeedPost` and persisted through the Codable round-trip
    /// below so a cache-first render doesn't flash it back to 0.
    public var viewCount: Int = 0
    /// Server-issued post-open count (`Post.postOpenCount`) — TOTAL full-frame
    /// openings of this post: immersive reel player OR post Detail page (the
    /// concept is generic to any Post, not just reels). This is what the eye
    /// badge shows ("vues totales"). Derived server-side from PostEngagement
    /// sessions on the `reels`/`detail` surfaces. Persisted through the
    /// Codable round-trip below (see `viewCount` note).
    public var postOpenCount: Int = 0
    /// Server-issued impression count (`Post.impressionCount`) — total
    /// exposures, NEVER deduplicated: each feed appearance AND each Detail
    /// open counts. This is what the "Impressions" (chart) badge shows.
    /// Persisted through the Codable round-trip below (see `viewCount` note).
    public var impressionCount: Int = 0
    /// Server-issued qualified-view count (`Post.qualifiedViewCount`) — total
    /// sessions reaching the 2.5s-OR-30% threshold. Persisted through the
    /// Codable round-trip below (see `viewCount` note).
    public var qualifiedViewCount: Int = 0
    /// Server-issued playback-completion count (`Post.playCount`). Persisted
    /// through the Codable round-trip below (see `viewCount` note).
    public var playCount: Int = 0
    public var repost: RepostContent? = nil
    public var repostAuthor: String? = nil
    public var isQuote: Bool = false
    public var media: [FeedMedia] = []
    public var originalLanguage: String?
    /// Audience du post et sa liste nommée (EXCEPT/ONLY) — champs augmentés
    /// serveur, posés par `APIPost.toFeedPost` / `PostRecord.toFeedPost`,
    /// jamais par l'init memberwise. Ils rendent l'audience ÉDITABLE : sans
    /// eux, la sheet d'édition ne saurait pas sur quoi rouvrir, et un post en
    /// ONLY repartirait sans ses destinataires.
    public var visibility: String?
    public var visibilityUserIds: [String]?
    public var translations: [String: PostTranslation]?
    public var translatedContent: String?
    /// `[rawURL: token]` outbound-link tracking map carried from
    /// `APIPost.trackedLinkMap`. Empty when the post has no tracked links.
    /// Runtime-only (set via `toFeedPost`, like the engagement counters) —
    /// consumed by the post body renderer (`/l/<token>` rewrite) and the
    /// embedded-video façade destination. Backward-compatible by construction.
    public var trackedLinkMap: [String: String] = [:]

    /// Story canvas payload (`StoryEffects`) when this post is a story. `nil`
    /// for normal posts. Mirrors `RepostContent.storyEffects`. Carried on the
    /// domain model (not just the API model) so the post-detail story canvas
    /// survives the `CacheCoordinator.feed` round-trip.
    public var storyEffects: StoryEffects? = nil
    /// Legacy voice-note audio URL for story/status posts. `nil` for normal posts.
    public var audioUrl: String? = nil
    /// Lieu attaché au post (picker → `SharedPlace`, persisté gateway-side en
    /// `metadata.location` et hissé en champ top-level). Porté sur le modèle
    /// domaine — comme `storyEffects` — pour survivre au round-trip
    /// `CacheCoordinator.feed` : sans lui la position était décodée
    /// (`APIPost.location`) puis PERDUE au passage domaine (constat user
    /// 2026-07-30, aucune carte sur les posts).
    public var location: SharedPlace? = nil
    /// Les personnes que ce post nomme, avec leur mode. Miroir de
    /// `APIPost.mentions` — `nil` tant que le réseau ne l'a pas fourni (post
    /// pas encore rafraîchi depuis un serveur qui ne le sert pas encore, OU
    /// projection GRDB du cache qui ne persiste pas encore ce champ). Les
    /// consommateurs (renderer, `ReferenceNoteRow`) traitent `nil` comme « pas
    /// d'avis » — jamais comme « personne » : `[]` dirait « le serveur s'est
    /// prononcé, personne ne matche », `nil` dit « ne rien changer ».
    public var mentions: [PostReference]? = nil

    /// `validUsernames` prêt pour `MessageTextRenderer.render` : `nil` quand
    /// `mentions` est `nil` (repli sur le comportement historique — tout
    /// `@handle` est linkifié), un `Set` — possiblement vide — sinon.
    public var validMentionUsernames: Set<String>? {
        mentions.map { Set($0.map { $0.username.lowercased() }) }
    }

    public var hasMedia: Bool { !media.isEmpty }
    public var mediaUrl: String? { media.first?.url }
    public var isTranslated: Bool { translatedContent != nil }
    public var displayContent: String { translatedContent ?? content }
    public var availableLanguages: [String] { Array(translations?.keys ?? [String: PostTranslation]().keys) }

    /// B2 / B4 (Prisme Linguistique) — recomputes `translatedContent` for
    /// the supplied preferred-language chain WITHOUT requiring the source
    /// `APIPost`. Used by ViewModels (Feed, PostDetail) when the user
    /// changes their preferred-content languages mid-session: the stored
    /// `translations` dict is enough to flip the rendered language, no
    /// re-fetch needed.
    ///
    /// Honours the Prisme rules: walk `preferredLanguages` IN ORDER and stop
    /// at the first rank that is served — either because the original is
    /// already written in that language, or because a translation exists for
    /// it. The original language competes for ITS rank in the chain; it is
    /// never a short-circuit tested ahead of the loop (Prisme rule 3,
    /// 2026-08-10) — with `preferredLanguages == ["en", "fr"]`, original
    /// `fr`, and an `en` translation available, the `en` translation wins
    /// because it occupies rank 1. Never fall back to an arbitrary
    /// translation if no preferred language matches.
    public func resolved(preferredLanguages: [String]) -> FeedPost {
        guard let dict = translations, !dict.isEmpty else { return self }
        let preferred = preferredLanguages.filter { !$0.isEmpty }.map { $0.lowercased() }
        let origLang = originalLanguage?.lowercased()
        for lang in preferred {
            if let origLang, origLang == lang {
                var copy = self
                copy.translatedContent = nil
                return copy
            }
            if let hit = dict.first(where: { $0.key.lowercased() == lang }) {
                var copy = self
                copy.translatedContent = hit.value.text
                return copy
            }
        }
        var copy = self
        copy.translatedContent = nil
        return copy
    }

    /// Companion to `resolved(preferredLanguages:)`: returns the language code
    /// that `displayContent` is currently showing, using the exact same
    /// deterministic Prisme algorithm — walk `preferredLanguages` IN ORDER,
    /// the first rank served wins (original at that rank, else a matching
    /// translation) — never `translations.keys.first` (dictionary iteration
    /// order is non-deterministic in Swift). Used by the feed card to know
    /// which language flag is "active" without re-deriving it unsafely.
    ///
    /// `originalLanguage == nil` does NOT short-circuit to `nil`: `resolved()`
    /// still matches `translations` against `preferredLanguages` in that case
    /// (the per-rank `origLang == lang` test simply never fires, falling
    /// through to the translation check at each rank). This mirrors that —
    /// `nil` only when there's truly no language to report (no original AND
    /// no preferred-language translation matches).
    public func resolvedLanguageCode(preferredLanguages: [String]) -> String? {
        let origLang = originalLanguage?.lowercased()
        guard let dict = translations, !dict.isEmpty else { return origLang }
        let preferred = preferredLanguages.filter { !$0.isEmpty }.map { $0.lowercased() }
        for lang in preferred {
            if let origLang, origLang == lang { return origLang }
            if dict.keys.contains(where: { $0.lowercased() == lang }) { return lang }
        }
        return origLang
    }

    public init(id: String = UUID().uuidString, author: String, authorId: String = "", authorUsername: String? = nil,
                authorAvatarURL: String? = nil,
                type: String? = nil, content: String, timestamp: Date = Date(), likes: Int = 0,
                comments: [FeedComment] = [], commentCount: Int? = nil, repost: RepostContent? = nil, repostAuthor: String? = nil,
                isQuote: Bool = false, media: [FeedMedia] = [], mediaUrl: String? = nil,
                originalLanguage: String? = nil, translations: [String: PostTranslation]? = nil, translatedContent: String? = nil) {
        self.id = id; self.author = author; self.authorId = authorId; self.authorUsername = authorUsername
        let stableId = authorId.isEmpty ? author : authorId
        self.authorColor = DynamicColorGenerator.colorForPost(authorId: stableId, type: type, originalLanguage: originalLanguage)
        self.authorAvatarURL = authorAvatarURL; self.type = type
        self.content = content; self.timestamp = timestamp; self.likes = likes
        self.comments = comments; self.commentCount = commentCount ?? comments.count
        self.repost = repost; self.repostAuthor = repostAuthor
        self.isQuote = isQuote
        if !media.isEmpty { self.media = media }
        else if mediaUrl != nil { self.media = [.image()] }
        self.originalLanguage = originalLanguage; self.translations = translations; self.translatedContent = translatedContent
    }
}

extension FeedPost: Codable {
    enum CodingKeys: String, CodingKey {
        case id, author, authorId, authorUsername, authorAvatarURL, type, content, timestamp, likes, isLiked
        case isBookmarkedByMe, isRepostedByMe
        case comments, commentCount, repostCount, bookmarkCount, shareCount
        case viewCount, postOpenCount, impressionCount, qualifiedViewCount, playCount
        case repost, repostAuthor, isQuote, media
        case originalLanguage, translations, translatedContent
        case storyEffects, audioUrl, location, mentions
        case visibility, visibilityUserIds
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        author = try c.decode(String.self, forKey: .author)
        authorId = try c.decode(String.self, forKey: .authorId)
        authorUsername = try c.decodeIfPresent(String.self, forKey: .authorUsername)
        authorAvatarURL = try c.decodeIfPresent(String.self, forKey: .authorAvatarURL)
        type = try c.decodeIfPresent(String.self, forKey: .type)
        content = try c.decode(String.self, forKey: .content)
        timestamp = try c.decode(Date.self, forKey: .timestamp)
        likes = try c.decode(Int.self, forKey: .likes)
        isLiked = try c.decode(Bool.self, forKey: .isLiked)
        // Engagement counters + "by me" flags are server-augmented (set via
        // `APIPost.toFeedPost`, never through the memberwise init) — a cached
        // page persisted before these fields existed simply lacks the keys.
        // `decodeIfPresent` + a falsy default keeps that page loadable instead
        // of throwing `keyNotFound` and dropping the whole cached feed.
        isBookmarkedByMe = try c.decodeIfPresent(Bool.self, forKey: .isBookmarkedByMe) ?? false
        isRepostedByMe = try c.decodeIfPresent(Bool.self, forKey: .isRepostedByMe) ?? false
        comments = try c.decode([FeedComment].self, forKey: .comments)
        commentCount = try c.decode(Int.self, forKey: .commentCount)
        repostCount = try c.decodeIfPresent(Int.self, forKey: .repostCount) ?? 0
        bookmarkCount = try c.decodeIfPresent(Int.self, forKey: .bookmarkCount) ?? 0
        shareCount = try c.decodeIfPresent(Int.self, forKey: .shareCount) ?? 0
        viewCount = try c.decodeIfPresent(Int.self, forKey: .viewCount) ?? 0
        postOpenCount = try c.decodeIfPresent(Int.self, forKey: .postOpenCount) ?? 0
        impressionCount = try c.decodeIfPresent(Int.self, forKey: .impressionCount) ?? 0
        qualifiedViewCount = try c.decodeIfPresent(Int.self, forKey: .qualifiedViewCount) ?? 0
        playCount = try c.decodeIfPresent(Int.self, forKey: .playCount) ?? 0
        repost = try c.decodeIfPresent(RepostContent.self, forKey: .repost)
        repostAuthor = try c.decodeIfPresent(String.self, forKey: .repostAuthor)
        isQuote = try c.decode(Bool.self, forKey: .isQuote)
        media = try c.decode([FeedMedia].self, forKey: .media)
        originalLanguage = try c.decodeIfPresent(String.self, forKey: .originalLanguage)
        translations = try c.decodeIfPresent([String: PostTranslation].self, forKey: .translations)
        translatedContent = try c.decodeIfPresent(String.self, forKey: .translatedContent)
        visibility = try c.decodeIfPresent(String.self, forKey: .visibility)
        visibilityUserIds = try c.decodeIfPresent([String].self, forKey: .visibilityUserIds)
        // Resilience: a single malformed `storyEffects` payload must NOT fail
        // the whole decode (RepostContent/FeedPost are decoded inside strict
        // arrays — one throwing entry would drop the entire feed page). Degrade
        // this entry to no effects (miroir de PostModels.swift:290-293).
        do {
            storyEffects = try c.decodeIfPresent(StoryEffects.self, forKey: .storyEffects)
        } catch {
            storyEffects = nil
        }
        audioUrl = try c.decodeIfPresent(String.self, forKey: .audioUrl)
        location = try c.decodeIfPresent(SharedPlace.self, forKey: .location)
        mentions = try c.decodeIfPresent([PostReference].self, forKey: .mentions)
        let stableId = authorId.isEmpty ? author : authorId
        authorColor = DynamicColorGenerator.colorForPost(authorId: stableId, type: type, originalLanguage: originalLanguage)
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(author, forKey: .author)
        try c.encode(authorId, forKey: .authorId)
        try c.encodeIfPresent(authorUsername, forKey: .authorUsername)
        try c.encodeIfPresent(authorAvatarURL, forKey: .authorAvatarURL)
        try c.encodeIfPresent(type, forKey: .type)
        try c.encode(content, forKey: .content)
        try c.encode(timestamp, forKey: .timestamp)
        try c.encode(likes, forKey: .likes)
        try c.encode(isLiked, forKey: .isLiked)
        try c.encode(isBookmarkedByMe, forKey: .isBookmarkedByMe)
        try c.encode(isRepostedByMe, forKey: .isRepostedByMe)
        try c.encode(comments, forKey: .comments)
        try c.encode(commentCount, forKey: .commentCount)
        try c.encode(repostCount, forKey: .repostCount)
        try c.encode(bookmarkCount, forKey: .bookmarkCount)
        try c.encode(shareCount, forKey: .shareCount)
        try c.encode(viewCount, forKey: .viewCount)
        try c.encode(postOpenCount, forKey: .postOpenCount)
        try c.encode(impressionCount, forKey: .impressionCount)
        try c.encode(qualifiedViewCount, forKey: .qualifiedViewCount)
        try c.encode(playCount, forKey: .playCount)
        try c.encodeIfPresent(repost, forKey: .repost)
        try c.encodeIfPresent(repostAuthor, forKey: .repostAuthor)
        try c.encode(isQuote, forKey: .isQuote)
        try c.encode(media, forKey: .media)
        try c.encodeIfPresent(originalLanguage, forKey: .originalLanguage)
        try c.encodeIfPresent(translations, forKey: .translations)
        try c.encodeIfPresent(translatedContent, forKey: .translatedContent)
        try c.encodeIfPresent(visibility, forKey: .visibility)
        try c.encodeIfPresent(visibilityUserIds, forKey: .visibilityUserIds)
        try c.encodeIfPresent(storyEffects, forKey: .storyEffects)
        try c.encodeIfPresent(audioUrl, forKey: .audioUrl)
        try c.encodeIfPresent(location, forKey: .location)
        try c.encodeIfPresent(mentions, forKey: .mentions)
    }
}

extension FeedPost: CacheIdentifiable {}

extension FeedPost: Equatable {
    public static func == (lhs: FeedPost, rhs: FeedPost) -> Bool { lhs.id == rhs.id }
}

extension FeedPost: Hashable {
    public func hash(into hasher: inout Hasher) { hasher.combine(id) }
}

// MARK: - Reel Classification
public extension FeedPost {
    /// A *reel* is a post stored with the server-side `REEL` type — an immersive,
    /// full-screen vertical experience instead of a detail page. The type is the
    /// single source of truth: it is chosen at creation time (a media post
    /// defaults to `REEL`, the author may force `POST`), so rendering is a plain
    /// authoritative check, never re-derived from media here.
    var isReel: Bool {
        (type ?? "").uppercased() == "REEL"
    }

    /// True when the server marks this post as a story (`type == "STORY"`).
    /// Mirrors `isReel`; used by `PostDetailView` to render the inline canvas.
    var isStory: Bool { (type ?? "").uppercased() == "STORY" }

    /// **Comment ce post affiche ses médias (directive 2026-08-27).** Dérivé du
    /// TYPE via `PostMediaPresentation.default(for:)` — carousel pour un POST,
    /// diapositives horizontales pour un RÉEL. Le poste DÉFINIT ainsi son
    /// affichage ; aucun autre choix ni interface pour l'instant, un futur champ
    /// stocké pourra surcharger sans changer les appelants (les renderers lisent
    /// ce point unique).
    var mediaPresentation: PostMediaPresentation {
        PostMediaPresentation.default(for: PostType(rawValue: (type ?? "").uppercased()) ?? .post)
    }

    /// Media surfaced first when the reel opens full-screen: the first video,
    /// else the first audio, else the first image. `nil` when the post is not a
    /// reel or carries no playable/visual media.
    var primaryReelMedia: FeedMedia? {
        guard isReel else { return nil }
        if let video = media.first(where: { $0.type == .video }) { return video }
        if let audio = media.first(where: { $0.type == .audio }) { return audio }
        return media.first(where: { $0.type == .image })
    }

    /// Media to RENDER on a reel surface. A reel REPOST carries no media on the
    /// outer post — the content lives in the reposted reel — so fall back to the
    /// reposted reel's media. Without this, `ReelFeedCard` / the immersive viewer
    /// render the empty outer post and a republished reel shows blank.
    var reelDisplayMedia: [FeedMedia] {
        if media.isEmpty, let repost, !repost.media.isEmpty { return repost.media }
        return media
    }

    /// First playable/visual media for a reel surface (video > audio > image),
    /// resolved from `reelDisplayMedia` so reel reposts surface the original
    /// content instead of the empty outer post.
    var primaryReelDisplayMedia: FeedMedia? {
        let list = reelDisplayMedia
        if let video = list.first(where: { $0.type == .video }) { return video }
        if let audio = list.first(where: { $0.type == .audio }) { return audio }
        return list.first(where: { $0.type == .image })
    }

    /// Média à afficher en FOND d'une surface réel : la vidéo si le post en
    /// porte une, sinon la première image. `nil` quand aucun visuel n'existe —
    /// l'appelant rend alors son propre fond (dégradé audio, couleur d'accent).
    ///
    /// Distinct de `primaryReelDisplayMedia`, qui désigne le média JOUÉ et
    /// préfère l'audio à l'image. Les confondre ferait taire un réel audio
    /// portant une image de couverture : son `kind` basculerait sur
    /// `.imageOnly` et l'autoplay ne le prendrait plus.
    var reelBackgroundMedia: FeedMedia? {
        let list = reelDisplayMedia
        if let video = list.first(where: { $0.type == .video }) { return video }
        return list.first(where: { $0.type == .image })
    }

    /// Filters a feed page down to the reels, preserving order. Seeds the reel
    /// pager from the already-loaded feed.
    static func reels(from posts: [FeedPost]) -> [FeedPost] {
        posts.filter(\.isReel)
    }
}

// MARK: - Reel Composition (creation-time classification)

/// Decides, at creation time, whether a post's composition qualifies it as a
/// `REEL`. Règle produit (directive user 2026-08-02, étendue par la directive
/// durée minimale) : un post n'est un réel que s'il porte UNE VIDÉO (>= 3s),
/// UN AUDIO (>= 3s), ou AU MOINS DEUX IMAGES. Une image seule, un document ou
/// un lieu restent un post de base ; une vidéo/audio de moins de 3 secondes
/// (ou de durée inconnue) ne qualifie jamais à elle seule — les images ne sont
/// JAMAIS soumises à cette condition de durée. L'auteur peut toujours forcer
/// un `POST` (toggle Réel⇄Post) ; il ne peut jamais forcer un `REEL` non
/// qualifiant. Pure and stateless so it is testable and shared by every
/// composer path — miroir exact du prédicat gateway
/// (`services/gateway/src/services/posts/reelComposition.ts`).
public enum ReelComposition {
    /// Plancher de durée (ms) pour qu'une vidéo ou un audio qualifie seul —
    /// miroir de `MIN_QUALIFYING_DURATION_MS` côté gateway.
    public static let minQualifyingDurationMs = 3000

    /// `true` when a post with these media kinds qualifies as a reel: a video
    /// or audio of at least `minQualifyingDurationMs`, or at least two images.
    /// Documents and locations never qualify — and neither does a single
    /// image or a video/audio whose duration is too short or unknown.
    public static func qualifiesAsReel(mediaKinds: [(kind: FeedMediaType, durationMs: Int?)]) -> Bool {
        let hasQualifyingVideo = mediaKinds.contains { $0.kind == .video && meetsMinDuration($0.durationMs) }
        let hasQualifyingAudio = mediaKinds.contains { $0.kind == .audio && meetsMinDuration($0.durationMs) }
        // Pas de `count(where:)` : stdlib 6.0 (iOS 18+), le SDK cible iOS 16.
        let imageCount = mediaKinds.lazy.filter { $0.kind == .image }.count
        return hasQualifyingVideo || hasQualifyingAudio || imageCount >= 2
    }

    private static func meetsMinDuration(_ durationMs: Int?) -> Bool {
        guard let durationMs else { return false }
        return durationMs >= minQualifyingDurationMs
    }

    /// MIME-type convenience for the composer, which holds attachments as MIME
    /// strings rather than `FeedMediaType`. Same rule: video (>=3s) || audio
    /// (>=3s) || >= 2 images. `durationsMs` aligns by index with `mimeTypes`;
    /// an index missing from `durationsMs` (including the default `[]`) is
    /// treated as an unknown duration — non-qualifying for that video/audio
    /// entry, but never blocks the other entries (e.g. the >= 2 images rule).
    public static func qualifiesAsReel(mimeTypes: [String], durationsMs: [Int?] = []) -> Bool {
        qualifiesAsReel(mediaKinds: mediaKinds(forMimeTypes: mimeTypes, durationsMs: durationsMs))
    }

    private static func mediaKinds(forMimeTypes mimeTypes: [String], durationsMs: [Int?]) -> [(kind: FeedMediaType, durationMs: Int?)] {
        mimeTypes.enumerated().compactMap { index, mime in
            let m = mime.lowercased()
            let durationMs = index < durationsMs.count ? durationsMs[index] : nil
            if m.hasPrefix("image/") { return (kind: .image, durationMs: durationMs) }
            if m.hasPrefix("video/") { return (kind: .video, durationMs: durationMs) }
            if m.hasPrefix("audio/") { return (kind: .audio, durationMs: durationMs) }
            return nil
        }
    }

    /// The default `PostType` for a new post: `REEL` when its composition
    /// qualifies and the author hasn't forced a plain post, otherwise `POST`.
    public static func defaultType(mediaKinds: [(kind: FeedMediaType, durationMs: Int?)], forcePlainPost: Bool = false) -> PostType {
        (!forcePlainPost && qualifiesAsReel(mediaKinds: mediaKinds)) ? .reel : .post
    }

    /// MIME-type convenience overload of `defaultType`.
    public static func defaultType(mimeTypes: [String], durationsMs: [Int?] = [], forcePlainPost: Bool = false) -> PostType {
        (!forcePlainPost && qualifiesAsReel(mimeTypes: mimeTypes, durationsMs: durationsMs)) ? .reel : .post
    }
}

// MARK: - StoryItem bridge

public extension StoryItem {
    /// Synthesize a `StoryItem` from a story `FeedPost` (post-detail inline
    /// rendering). Mirrors the `RepostContent` bridge used by
    /// `StoryReaderRepresentable.init(repost:)`. `FeedPost` has no `expiresAt`,
    /// which is irrelevant to in-place playback.
    ///
    /// REPUBLICATION DE STORY : quand le post reposte une STORY sans ajouts
    /// propres, ses `storyEffects`/`audioUrl` sont nil et ses `media` vides —
    /// le contenu vit sur la source. Sans fallback, la page détail rendait un
    /// canvas VIDE (flou) et l'audio de fond / les audios timeline ne se
    /// résolvaient jamais (le resolver cherche `postMediaId` dans `media`).
    /// On retombe donc sur la source, avec la MÊME politique que
    /// `toStoryGroups` (StoryModels.swift, extension `[APIPost]`) — seule
    /// cascade équivalente côté API/tray/viewer — pour que les deux ponts
    /// résolvent un repost identiquement.
    ///
    /// `media` et `storyEffects` sont couplés en UNE SEULE décision de
    /// fallback (`hasOwnContent`), jamais résolus indépendamment : les
    /// `mediaObjects`/`audioPlayerObjects` des effects référencent leurs
    /// médias par `postMediaId`, donc mélanger des effects de la SOURCE avec
    /// des médias PROPRES (ou l'inverse) casse silencieusement toute
    /// résolution audio/vidéo — le composer de repost (`StoryComposerViewModel
    /// (reposting:authorHandle:)`) ne produit d'ailleurs jamais l'un sans
    /// l'autre : il clone `story.storyEffects` dès qu'il y a un ajout. Durci
    /// ici en profondeur pour ne jamais dépendre de cette garantie côté
    /// composer (post-revue 2026-07-13).
    init(feedPost: FeedPost) {
        let storySource: RepostContent? = {
            guard let repost = feedPost.repost,
                  (repost.type ?? "").uppercased() == "STORY" else { return nil }
            return repost
        }()
        let hasOwnContent = !feedPost.media.isEmpty || feedPost.storyEffects != nil
        self.init(
            id: feedPost.id,
            content: feedPost.content,
            media: hasOwnContent ? feedPost.media : (storySource?.media ?? []),
            storyEffects: hasOwnContent ? feedPost.storyEffects : storySource?.storyEffects,
            createdAt: feedPost.timestamp,
            expiresAt: nil,
            repostOfId: storySource?.id,
            repostAuthorName: storySource?.author,
            repostAuthorUsername: storySource?.authorUsername,
            audioUrl: feedPost.audioUrl ?? storySource?.audioUrl,
            isViewed: false
        )
    }
}
