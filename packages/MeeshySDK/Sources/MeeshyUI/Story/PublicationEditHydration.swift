import Foundation
import MeeshySDK

/// Une scène d'une publication rouverte : ses objets, et le média qui lui sert
/// de fond quand aucun objet ne le désigne.
public nonisolated struct PublicationEditScene {
    public let effects: StoryEffects
    public let background: FeedMedia?
}

/// **Ce que l'édition d'une publication MONTRE de ses médias** (#9333, #15631).
///
/// Une publication se rouvre sur ses scènes : une par scène de canevas, et les
/// objets y désignent leurs médias par `postMediaId`. Un média que rien ne
/// désigne n'est pas perdu pour autant — une publication historique, ou relue
/// d'un cache qui ne garde pas le canevas, n'en désigne aucun :
///
/// - une image ou une vidéo libre devient un FOND : celui de la première scène,
///   puis une scène de plus par média, dans l'ordre du post ;
/// - un son libre devient un lecteur sur la première scène ;
/// - un document n'a pas de place sur une scène : il reste hors de
///   `shownMediaIds`, et la porte d'édition le sait.
public nonisolated enum PublicationEditHydration {

    public static func referencedMediaIds(_ effects: StoryEffects?) -> Set<String> {
        guard let effects else { return [] }
        let visuels: [String] = (effects.mediaObjects ?? []).map(\.postMediaId)
        let sons: [String] = (effects.audioPlayerObjects ?? []).map(\.postMediaId)
        let stickers: [String] = (effects.stickerObjects ?? []).map(\.postMediaId)
        let pistes: [String] = [effects.backgroundAudioId, effects.voiceAttachmentId].compactMap { $0 }
        return Set([visuels, sons, stickers, pistes].joined().filter { !$0.isEmpty })
    }

    /// Le fond d'une story rouverte : son premier média, s'il est une image ou
    /// une vidéo que rien ne désigne.
    public static func background(media: [FeedMedia], effects: StoryEffects?) -> FeedMedia? {
        guard let first = media.first, isVisual(first),
              !referencedMediaIds(effects).contains(first.id) else { return nil }
        return first
    }

    /// Les scènes d'une publication rouverte — jamais vide.
    public static func scenes(media: [FeedMedia], effects: StoryEffects?) -> [PublicationEditScene] {
        let canevas = canvasScenes(effects)
        let designes = canevas.reduce(into: Set<String>()) { $0.formUnion(referencedMediaIds($1)) }
        let libres = media.filter { !designes.contains($0.id) }
        let fonds = libres.filter(isVisual)
        let sons = libres.filter { $0.type == .audio }

        var premiere = canevas[0]
        if !sons.isEmpty {
            premiere.audioPlayerObjects = (premiere.audioPlayerObjects ?? []) + sons.map(soundObject)
        }
        let tete = PublicationEditScene(effects: premiere, background: fonds.first)
        let suite: [PublicationEditScene] = canevas.dropFirst().map { PublicationEditScene(effects: $0, background: nil) }
        let ajoutees: [PublicationEditScene] = fonds.dropFirst().map {
            PublicationEditScene(effects: StoryEffects(), background: $0)
        }
        return [[tete], suite, ajoutees].flatMap { $0 }
    }

    /// Les médias que les scènes rouvertes MONTRENT — objets désignés et fonds.
    public static func shownMediaIds(media: [FeedMedia], effects: StoryEffects?) -> Set<String> {
        scenes(media: media, effects: effects).reduce(into: Set<String>()) { montres, scene in
            montres.formUnion(referencedMediaIds(scene.effects))
            if let fond = scene.background { montres.insert(fond.id) }
        }
    }

    /// Ce que le préchargement d'une publication rouverte va chercher : le fond
    /// de chaque slide, rangé sous l'id de la slide, et chaque objet média,
    /// rangé sous l'id de l'objet.
    static func preloadTargets(slides: [StorySlide], media: [FeedMedia]) -> [RepostMediaPreload.Target] {
        let urls = Dictionary(media.compactMap { m in m.url.map { (m.id, $0) } }, uniquingKeysWith: { premier, _ in premier })
        let fonds: [RepostMediaPreload.Target] = slides.compactMap { slide in
            guard let brut = slide.mediaURL, let url = MeeshyConfig.resolveMediaURL(brut) else { return nil }
            return RepostMediaPreload.Target(storageKey: slide.id, url: url, destination: .slideBackground)
        }
        let objets: [RepostMediaPreload.Target] = slides.flatMap { slide in
            (slide.effects.mediaObjects ?? []).compactMap { objet in
                guard let brut = urls[objet.postMediaId], let url = MeeshyConfig.resolveMediaURL(brut) else { return nil }
                return RepostMediaPreload.Target(storageKey: objet.id, url: url, destination: .canvasObject)
            }
        }
        return fonds + objets
    }

    private static func canvasScenes(_ effects: StoryEffects?) -> [StoryEffects] {
        guard let effects else { return [StoryEffects()] }
        guard let document = effects.canvasV3, document.scenes.count > 1 else { return [effects] }
        return document.scenes.indices.map { StoryEffects(rendering: document, sceneIndex: $0) }
    }

    private static func isVisual(_ media: FeedMedia) -> Bool {
        media.type == .image || media.type == .video
    }

    private static func soundObject(_ media: FeedMedia) -> StoryAudioPlayerObject {
        StoryAudioPlayerObject(id: "edit-audio-\(media.id)", postMediaId: media.id,
                               duration: media.duration.map { Float($0) }, mediaURL: media.url)
    }
}
