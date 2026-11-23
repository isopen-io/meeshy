import Foundation

/// **Ce que la vignette d'un contenu montre, lue sur un `FeedPost`** (#20243).
///
/// « Lui envoyer un contenu » range mes contenus en grille de cartes larges et ne tient que des `FeedPost` — ceux du
/// cache du profil. La vignette suit la carte de #20211 : la règle du bloc visuel (`ContentCard.visual`) reste UNE, et
/// cette projection ne fait que lui remettre les mêmes entrées — médias visuels, son, scène composée — lues sur le
/// modèle du fil au lieu de la réponse de l'API.
extension ContentCard {

    public struct Showcase: Equatable, Sendable {
        public let visual: Visual
        /// La scène composée à dessiner, quand le contenu en porte une.
        public let scene: Scene?

        public init(post: FeedPost) {
            let portrait = post.isReel || post.isStory
            let pages = post.media.filter { $0.type == .image || $0.type == .video }
                .map { Media($0, portrait: portrait) }
            scene = Scene(post: post)
            visual = ContentCard.visual(pages: pages, sound: Sound(post: post), document: scene?.document)
        }
    }
}

extension ContentCard.Media {
    init(_ media: FeedMedia, portrait: Bool) {
        let isVideo = media.type == .video
        id = media.id
        kind = isVideo ? .video : .image
        let thumbnail = ContentCard.nonBlank(media.thumbnailUrl)
        imageURL = isVideo ? thumbnail : thumbnail ?? ContentCard.nonBlank(media.url)
        thumbHash = ContentCard.nonBlank(media.thumbHash)
        aspectRatio = ContentCard.displayAspectRatio(width: media.width, height: media.height, portrait: portrait)
        durationSeconds = isVideo ? media.duration : nil
    }
}

extension ContentCard.Sound {
    /// Le premier média audio du contenu, sinon son son de fond (`audioUrl`) — dont le `FeedPost` ne garde pas la durée.
    init?(post: FeedPost) {
        if let audio = post.media.first(where: { $0.type == .audio }), let url = ContentCard.nonBlank(audio.url) {
            self.init(attachmentId: audio.id, url: url, durationSeconds: audio.duration)
            return
        }
        guard let url = ContentCard.nonBlank(post.audioUrl) else { return nil }
        self.init(attachmentId: "\(post.id)-audio", url: url, durationSeconds: nil)
    }
}

extension ContentCard.Scene {
    init?(post: FeedPost) {
        guard let effects = post.storyEffects, let document = effects.canvasV3, !document.scenes.isEmpty else {
            return nil
        }
        carrierId = post.id
        content = post.content.isEmpty ? nil : post.content
        createdAt = post.timestamp
        self.document = document
        self.effects = effects
        media = post.media
        floorHex = post.storyAccentHex
    }
}
