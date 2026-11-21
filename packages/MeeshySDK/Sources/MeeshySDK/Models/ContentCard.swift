import Foundation

/// **La carte vivante d'un contenu Meeshy** (#19331, #19332) — ce qu'une bulle
/// ou un texte de post montre d'un post, d'un réel, d'une story ou d'une humeur
/// qu'il cite, lu sous l'audience du lecteur (`GET /posts/:id`).
///
/// Projection PURE d'un `APIPost` : le texte est servi par le Prisme du lecteur
/// (`APIPost.resolveTranslation`, jamais une seconde boucle), et une
/// republication sans texte ni média propre montre son ORIGINAL. Les
/// statistiques et le favori restent ceux du contenu LIÉ — celui que le toucher
/// ouvre.
public struct ContentCard: Equatable, Sendable {

    public struct Author: Equatable, Sendable {
        public let id: String
        /// Le nom affiché, sinon `@pseudo`.
        public let name: String
        public let avatarURL: String?
    }

    public struct Media: Equatable, Sendable {
        public enum Kind: Equatable, Sendable {
            case image
            case video
        }

        /// L'identifiant du média servi (`PostMedia.id`) — celui qu'un objet de
        /// scène désigne par `postMediaId`.
        public let id: String
        public let kind: Kind
        /// La vignette ; pour une image, le fichier lui-même à défaut. Une vidéo
        /// sans vignette n'a que son ThumbHash.
        public let imageURL: String?
        public let thumbHash: String?
        /// Largeur / hauteur affichée : celle du média bornée entre 4:5 et 16:9,
        /// le portrait 9:16 pour un réel et une story.
        public let aspectRatio: Double
        public let durationSeconds: Int?
    }

    public struct Stats: Equatable, Sendable {
        public let views: Int
        public let likes: Int
        public let comments: Int
        /// Les FAVORIS : il n'y a pas d'autre compteur de favoris.
        public let bookmarks: Int
    }

    public let postId: String
    /// Le type du contenu LIÉ — le mot et l'icône de sa pastille, la place où
    /// le toucher l'ouvre.
    public let kind: PostType
    public let author: Author
    public let createdAt: Date
    public let text: String?
    public let moodEmoji: String?
    public let media: Media?
    /// Les médias en plus de celui que montre le bloc (« +N »).
    public let extraMediaCount: Int
    public let stats: Stats
    public let isBookmarkedByMe: Bool
    /// Ce que le bloc visuel montre (#20211) : diaporama, image de garde, son,
    /// scène composée, ou rien.
    public let visual: Visual
    /// La scène composée à dessiner, quand le contenu en porte une.
    public let scene: Scene?

    /// Le portrait d'un réel ou d'une story : la scène, lue dans sa loi (`SceneShape.aspect`).
    public static let portraitAspectRatio = Double(SceneShape.aspect)
    public static let aspectRatioRange: ClosedRange<Double> = (4.0 / 5.0)...(16.0 / 9.0)
    /// Un média sans dimensions servies.
    public static let unknownAspectRatio = 4.0 / 3.0

    /// - Parameter announcedKind: le type qu'annonçait le lien, quand le post
    ///   n'en sert pas un des quatre.
    public init(post: APIPost, preferredLanguages: [String], announcedKind: PostType? = nil) {
        let shown = ShownContent(post: post)
        let firstVisual = shown.media.first { $0.mediaType == .image || $0.mediaType == .video }
        postId = post.id
        kind = Self.postType(of: post.type) ?? announcedKind ?? .post
        author = Author(shown.author)
        createdAt = shown.createdAt
        text = Self.nonBlank(
            APIPost.resolveTranslation(translations: shown.translations, originalLanguage: shown.originalLanguage,
                                       preferredLanguages: preferredLanguages) ?? shown.content
        )
        moodEmoji = shown.type == .status ? Self.nonBlank(shown.moodEmoji) : nil
        media = firstVisual.map { Media($0, portrait: shown.type == .reel || shown.type == .story) }
        extraMediaCount = firstVisual == nil ? 0 : max(0, shown.media.count - 1)
        stats = Stats(views: post.viewCount ?? 0, likes: post.likeCount ?? 0,
                      comments: post.commentCount ?? 0, bookmarks: post.bookmarkCount ?? 0)
        isBookmarkedByMe = post.isBookmarkedByMe ?? false
        let portrait = shown.type == .reel || shown.type == .story
        let pages = shown.media.filter { $0.mediaType == .image || $0.mediaType == .video }
            .map { Media($0, portrait: portrait) }
        scene = Scene(shown: shown)
        visual = Self.visual(pages: pages, sound: Sound(shown: shown), document: scene?.document)
    }

    static func postType(of type: String?) -> PostType? {
        type.flatMap { PostType(rawValue: $0.uppercased()) }
    }

    static func nonBlank(_ text: String?) -> String? {
        guard let trimmed = text?.trimmingCharacters(in: .whitespacesAndNewlines), !trimmed.isEmpty else { return nil }
        return trimmed
    }

    /// La largeur / hauteur d'affichage d'un média (contrat § 4.1).
    public static func displayAspectRatio(width: Int?, height: Int?, portrait: Bool) -> Double {
        if portrait { return portraitAspectRatio }
        guard let width, let height, width > 0, height > 0 else { return unknownAspectRatio }
        let ratio = Double(width) / Double(height)
        return min(max(ratio, aspectRatioRange.lowerBound), aspectRatioRange.upperBound)
    }
}

// MARK: - Ce que la carte montre

/// Le contenu dont la carte montre l'auteur, le texte et les médias : le post
/// lui-même, ou l'original d'une republication qui n'a ni texte ni média.
struct ShownContent {
    let id: String
    let type: PostType?
    let author: APIAuthor
    let createdAt: Date
    let content: String?
    let originalLanguage: String?
    let translations: [String: APIPostTranslationEntry]?
    let moodEmoji: String?
    let media: [APIPostMedia]
    let storyEffects: StoryEffects?
    let audioUrl: String?
    let audioDurationMs: Int?

    init(post: APIPost) {
        let ownMedia = post.media ?? []
        let isBareRepost = ContentCard.nonBlank(post.content) == nil && ownMedia.isEmpty
        guard isBareRepost, let original = post.repostOf else {
            self.init(id: post.id, type: post.type, author: post.author, createdAt: post.createdAt, content: post.content,
                      originalLanguage: post.originalLanguage, translations: post.translations,
                      moodEmoji: post.moodEmoji, media: ownMedia, storyEffects: post.storyEffects,
                      audioUrl: post.audioUrl, audioDurationMs: post.audioDuration)
            return
        }
        self.init(id: original.id, type: original.type, author: original.author, createdAt: original.createdAt,
                  content: original.content, originalLanguage: original.originalLanguage,
                  translations: original.translations, moodEmoji: original.moodEmoji, media: original.media ?? [],
                  storyEffects: original.storyEffects, audioUrl: original.audioUrl, audioDurationMs: nil)
    }

    private init(id: String, type: String?, author: APIAuthor, createdAt: Date, content: String?,
                 originalLanguage: String?, translations: [String: APIPostTranslationEntry]?, moodEmoji: String?,
                 media: [APIPostMedia], storyEffects: StoryEffects?, audioUrl: String?, audioDurationMs: Int?) {
        self.id = id
        self.type = ContentCard.postType(of: type)
        self.author = author
        self.createdAt = createdAt
        self.content = content
        self.originalLanguage = originalLanguage
        self.translations = translations
        self.moodEmoji = moodEmoji
        self.media = media
        self.storyEffects = storyEffects
        self.audioUrl = audioUrl
        self.audioDurationMs = audioDurationMs
    }
}

extension ContentCard.Author {
    init(_ author: APIAuthor) {
        id = author.id
        name = ContentCard.nonBlank(author.displayName) ?? ContentCard.nonBlank(author.username).map { "@\($0)" } ?? ""
        avatarURL = ContentCard.nonBlank(author.avatar)
    }
}

extension ContentCard.Media {
    init(_ media: APIPostMedia, portrait: Bool) {
        let isVideo = media.mediaType == .video
        id = media.id
        kind = isVideo ? .video : .image
        let thumbnail = ContentCard.nonBlank(media.thumbnailUrl)
        imageURL = isVideo ? thumbnail : thumbnail ?? ContentCard.nonBlank(media.fileUrl)
        thumbHash = ContentCard.nonBlank(media.thumbHash)
        aspectRatio = ContentCard.displayAspectRatio(width: media.width, height: media.height, portrait: portrait)
        durationSeconds = isVideo ? media.duration.map { $0 / 1000 } : nil
    }
}
