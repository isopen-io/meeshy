import Foundation

/// **Ce que le bloc visuel de la carte d'un contenu montre** (#20211).
///
/// > « Une carte IMAGE swappable si réel ou post de plusieurs images, image de
/// > garde de la vidéo si une vidéo, un composant sonore avec play si c'est
/// > juste un son de fond, sinon le fond de la scène dessiné avec les éléments
/// > sur la scène de base ! » — le porteur (#20211).
///
/// La règle est PURE et se lit dans cet ordre :
/// 1. plusieurs pages (médias visuels d'un post ou d'un réel, ou scènes d'un
///    document) : un diaporama qu'on fait glisser ;
/// 2. une vidéo seule — un post d'un clip, ou une scène qui n'est que ce clip :
///    son image de garde ;
/// 3. rien de peint, mais un son : le composant sonore ;
/// 4. sinon la scène composée, fond et objets posés ; à défaut de scène, l'image
///    seule ; et rien quand le contenu n'a que du texte.
///
/// Une scène qui n'est QU'UNE image se montre en image : même pixel, sans
/// monter le player.
extension ContentCard {

    public enum Visual: Equatable, Sendable {
        /// Du texte seulement : la carte n'a pas de bloc visuel.
        case none
        /// Une image, ou l'image de garde d'une vidéo avec le signe lecture.
        case media(Media)
        /// Deux pages ou plus, qu'on fait glisser une à une.
        case slideshow([Page])
        /// Un son seul, qu'on écoute sans quitter la conversation.
        case sound(Sound)
        /// La scène d'index donné de `ContentCard.scene`, arrêtée.
        case scene(Int)
    }

    public enum Page: Equatable, Sendable {
        case media(Media)
        case scene(Int)
    }

    public struct Sound: Equatable, Sendable {
        /// L'identité de la piste pour le lecteur : le média audio, ou
        /// `<post>-audio` pour le son de fond du contenu.
        public let attachmentId: String
        public let url: String
        public let durationSeconds: Int?

        public init(attachmentId: String, url: String, durationSeconds: Int?) {
            self.attachmentId = attachmentId
            self.url = url
            self.durationSeconds = durationSeconds
        }
    }

    /// Ce que le player de scène reçoit : le document, et le porteur qui
    /// indexe ses médias (`MeeshyScenePlayer(carrier:)` — sans lui, une scène
    /// de média se peint vide).
    public struct Scene: Equatable, Sendable {
        /// Le contenu qui porte la scène : le post, ou l'original d'une
        /// republication nue.
        public let carrierId: String
        public let content: String?
        public let createdAt: Date
        public let document: CanvasV3
        public let effects: StoryEffects
        public let media: [FeedMedia]
        /// Le fond d'une scène qui n'en déclare aucun : la couleur de l'auteur.
        public let floorHex: String

        public static func == (lhs: Scene, rhs: Scene) -> Bool {
            lhs.carrierId == rhs.carrierId && lhs.content == rhs.content && lhs.createdAt == rhs.createdAt
                && lhs.document == rhs.document && lhs.floorHex == rhs.floorHex
                && lhs.media.map(\.id) == rhs.media.map(\.id)
        }
    }

    static func visual(pages media: [Media], sound: Sound?, document: CanvasV3?) -> Visual {
        guard let document, let first = document.scenes.first else {
            return mediaVisual(media, sound: sound)
        }
        if document.scenes.count > 1 { return .slideshow(document.scenes.indices.map(Page.scene)) }
        let painted = first.objects.filter(SceneShape.paintsPixels)
        if painted.isEmpty { return sound.map(Visual.sound) ?? .scene(0) }
        guard painted.count == 1, let only = painted.first, only.kind == .media,
              let shown = media.first(where: { $0.id == only.mediaReference }) else { return .scene(0) }
        return .media(shown)
    }

    private static func mediaVisual(_ media: [Media], sound: Sound?) -> Visual {
        if media.count > 1 { return .slideshow(media.map(Page.media)) }
        if let single = media.first { return .media(single) }
        return sound.map(Visual.sound) ?? .none
    }
}

extension ContentCard.Sound {
    /// Le premier média audio du contenu, sinon son son de fond (`audioUrl`).
    init?(shown: ShownContent) {
        if let audio = shown.media.first(where: { $0.mediaType == .audio }),
           let url = ContentCard.nonBlank(audio.fileUrl) {
            self.init(attachmentId: audio.id, url: url, durationSeconds: audio.duration.map { $0 / 1000 })
            return
        }
        guard let url = ContentCard.nonBlank(shown.audioUrl) else { return nil }
        self.init(attachmentId: "\(shown.id)-audio", url: url, durationSeconds: shown.audioDurationMs.map { $0 / 1000 })
    }
}

extension ContentCard.Scene {
    init?(shown: ShownContent) {
        guard let effects = shown.storyEffects, let document = effects.canvasV3, !document.scenes.isEmpty else {
            return nil
        }
        carrierId = shown.id
        content = shown.content
        createdAt = shown.createdAt
        self.document = document
        self.effects = effects
        media = shown.media.map { $0.toFeedMedia() }
        floorHex = shown.author.storyAccentHex
    }
}
