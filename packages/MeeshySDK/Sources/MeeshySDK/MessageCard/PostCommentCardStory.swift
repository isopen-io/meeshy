import Foundation

/// **Le SUPPORT d'un commentaire de STORY** (#10915) — ce que la carte peut en
/// montrer : son auteur, son texte et, en HERO, son visuel.
///
/// GARDES (loi pure, `heroMedia(now:)`) :
/// - une story dont l'AUDIENCE n'est pas `PUBLIC` (`visibility`, fail-closed :
///   absente ou restreinte — `FRIENDS`, `COMMUNITY`, `PRIVATE`, `EXCEPT`, `ONLY`)
///   n'est jamais support ni hero : la carte part hors de Meeshy, seul le
///   commentaire reste ;
/// - une story ÉCHUE (`StoryItem.isExpired`, la fenêtre par défaut sans
///   `expiresAt`) ne se fige pas en image ;
/// - une story à CANVAS (`hasCanvas` : textes, stickers, filtres posés par
///   `storyEffects`) n'est pas son média de fond : sa VIGNETTE (`thumbnailUrl`,
///   servie par la passerelle) la représente, et sans vignette il n'y a ni
///   hero ni story en tête — on ne peint jamais un fond nu à sa place ;
/// - une story sans canvas montre son premier visuel : une photo par son
///   fichier (sa vignette en repli), une vidéo par sa vignette — à défaut, par
///   sa première image.
public struct PostCommentCardStory: Sendable {
    public let id: String
    public let author: String
    public let authorId: String
    public let authorUsername: String?
    public let text: String?
    public let media: [FeedMedia]
    public let timestamp: Date
    public let expiresAt: Date?
    public let hasCanvas: Bool
    /// L'audience de la story (`PostVisibility`) — seule `PUBLIC` la laisse devenir support.
    public let visibility: String?

    public init(id: String, author: String, authorId: String, authorUsername: String? = nil, text: String? = nil,
                media: [FeedMedia] = [], timestamp: Date, expiresAt: Date? = nil, hasCanvas: Bool = false,
                visibility: String? = nil) {
        self.id = id
        self.author = author
        self.authorId = authorId
        self.authorUsername = authorUsername
        self.text = text
        self.media = media
        self.timestamp = timestamp
        self.expiresAt = expiresAt
        self.hasCanvas = hasCanvas
        self.visibility = visibility
    }

    public init(story: StoryItem, author: String, authorId: String, authorUsername: String? = nil) {
        self.init(id: story.id, author: author, authorId: authorId, authorUsername: authorUsername, text: story.content,
                  media: story.media, timestamp: story.createdAt, expiresAt: story.expiresAt, hasCanvas: story.storyEffects != nil,
                  visibility: story.visibility)
    }

    /// Une story ou un statut lu par son `FeedPost` (« Mes stories », #11477) — son texte servi,
    /// ses médias ; sans `expiresAt`, la fenêtre par défaut de `StoryItem` la borne.
    public init(feedPost post: FeedPost) {
        self.init(id: post.id, author: post.author, authorId: post.authorId, authorUsername: post.authorUsername,
                  text: post.displayContent, media: post.media, timestamp: post.timestamp,
                  hasCanvas: post.storyEffects != nil, visibility: post.visibility)
    }

    /// Le visuel qui représente la story sur la carte — `nil` : aucun (voir les gardes).
    func heroMedia(now: Date) -> MessageCardSubjectMedia? {
        guard PostCommentCardComposition.isPublicAudience(visibility), !StoryItem.isExpired(createdAt: timestamp, expiresAt: expiresAt, at: now) else { return nil }
        guard let visual = media.first(where: { $0.type == .image || $0.type == .video }) else { return nil }
        let thumbnail = MessageCardText.nonBlank(visual.thumbnailUrl)
        if hasCanvas {
            guard let thumbnail else { return nil }
            return Self.subjectMedia(of: visual, kind: .image, file: thumbnail, poster: nil)
        }
        switch visual.type {
        case .image:
            guard let file = MessageCardText.nonBlank(visual.url) ?? thumbnail else { return nil }
            return Self.subjectMedia(of: visual, kind: .image, file: file, poster: thumbnail)
        case .video:
            guard let file = MessageCardText.nonBlank(visual.url) ?? thumbnail else { return nil }
            return Self.subjectMedia(of: visual, kind: .video, file: file, poster: thumbnail)
        case .audio, .document:
            return nil
        }
    }

    private static func subjectMedia(of item: FeedMedia, kind: MessageCardMediaKind, file: String, poster: String?) -> MessageCardSubjectMedia {
        let declared = MessageCardSticker.declaredAspect(width: item.width, height: item.height)
        return MessageCardSubjectMedia(
            media: MessageCardMedia(
                id: item.id, kind: kind, aspect: declared ?? 1,
                duration: kind == .video ? item.duration.map { Double($0) } : nil,
                aspectKnown: declared != nil
            ),
            fileURL: file,
            posterURL: poster
        )
    }
}
