import CoreGraphics
import QuartzCore
import MeeshySDK

/// Ce contre quoi une capture du verre a été faite (#9864).
///
/// Deux captures de même clé sont interchangeables tant que rien d'autre ne
/// bouge sous le verre : même slide, même révision de contenu, même taille de
/// rendu, mêmes langues, et le même ensemble d'objets visibles à l'instant
/// capturé — ce dernier champ suit les fenêtres d'apparition sans exiger une
/// capture par image.
nonisolated struct StoryGlassCaptureKey: Equatable, Sendable {
    let slideId: String
    let contentRevision: UInt64
    let renderSize: CGSize
    let languages: [String]
    let visibleItemIds: Set<String>
}

/// Ce qu'une couche de verre a reçu : la génération de capture dont vient sa
/// découpe, et le cadre découpé. Une couche dont le tampon est égal au tampon
/// courant porte déjà la bonne image floutée.
nonisolated struct StoryGlassFeedStamp: Equatable, Sendable {
    let generation: Int
    let frame: CGRect
}

/// **Le verre se capture quand ce qui est dessous change, pas à chaque image** (#9864).
///
/// En lecture, `rebuildLayers` refaisait à chaque tick (60–120 Hz) la capture
/// `CARenderer` de la scène, sa découpe, le flou MPS et la relecture
/// `createCGImage` de chaque texte en verre. Sous un verre posé sur une scène
/// immobile, ces quatre passes rendaient la même image cent fois par seconde.
///
/// La loi répond à deux questions, sans rien rendre :
/// - faut-il refaire la capture de la scène ? — une seule fois pour un dessous
///   immobile, à cadence bornée (celle de `StoryEditBackdropThrottle`, réglée
///   pour la lecture) pour un dessous qui bouge, et toujours quand la clé change ;
/// - faut-il re-nourrir cette couche de verre ? — seulement si elle n'a pas
///   déjà reçu la découpe de la capture courante pour son cadre courant.
enum StoryGlassBackdropPlayback {

    /// ~12 Hz : un flou lit comme « vivant » bien en dessous de la cadence
    /// d'affichage, et la lecture n'a pas l'urgence d'un geste d'édition.
    nonisolated static let movingBackdropMinInterval: CFTimeInterval = 1.0 / 12.0

    nonisolated static func slideHasGlass(_ slide: StorySlide) -> Bool {
        slide.effects.textObjects.contains(where: isGlass)
    }

    /// Le dessous du verre change-t-il avec le playhead ? Les textes en verre
    /// sont exclus de la capture : leurs propres keyframes ne la changent pas.
    nonisolated static func backdropMoves(slide: StorySlide, backgroundIsVideo: Bool) -> Bool {
        if backgroundIsVideo { return true }
        let effects = slide.effects
        if !(effects.clipTransitions ?? []).isEmpty { return true }
        let movingText = effects.textObjects.contains { text in
            !isGlass(text) && (hasFade(text.fadeIn, text.fadeOut) || !(text.keyframes ?? []).isEmpty)
        }
        let movingMedia = (effects.mediaObjects ?? []).contains { media in
            !media.isBackground
                && (media.kind == .video
                    || hasFade(media.fadeIn, media.fadeOut)
                    || !(media.keyframes ?? []).isEmpty)
        }
        let movingSticker = (effects.stickerObjects ?? []).contains { sticker in
            sticker.animation != nil || hasFade(sticker.fadeIn, sticker.fadeOut)
        }
        let movingPlace = effects.locationObjects.contains { hasFade($0.fadeIn, $0.fadeOut) }
        return movingText || movingMedia || movingSticker || movingPlace
    }

    /// Les objets de la capture visibles à `seconds`, selon la même fenêtre que
    /// `StoryRenderer.shouldRender` en lecture.
    nonisolated static func visibleBackdropItemIds(slide: StorySlide, at seconds: Double) -> Set<String> {
        let effects = slide.effects
        let texts: [StoryGlassVisibilityWindow] = effects.textObjects.filter { !isGlass($0) }.map {
            StoryGlassVisibilityWindow(id: $0.id, start: $0.startTime, duration: $0.duration)
        }
        let medias: [StoryGlassVisibilityWindow] = (effects.mediaObjects ?? []).filter { !$0.isBackground }.map {
            StoryGlassVisibilityWindow(id: $0.id, start: $0.startTime, duration: $0.duration)
        }
        let stickers: [StoryGlassVisibilityWindow] = (effects.stickerObjects ?? []).map {
            StoryGlassVisibilityWindow(id: $0.id, start: $0.startTime, duration: $0.duration)
        }
        let places: [StoryGlassVisibilityWindow] = effects.locationObjects.map {
            StoryGlassVisibilityWindow(id: $0.id, start: $0.startTime, duration: $0.duration)
        }
        let visible = (texts + medias + stickers + places).filter { $0.contains(seconds) }
        return Set(visible.map { $0.id })
    }

    nonisolated static func shouldRecapture(previous: StoryGlassCaptureKey?,
                                            current: StoryGlassCaptureKey,
                                            backdropMoves: Bool,
                                            now: CFTimeInterval,
                                            lastCaptureAt: CFTimeInterval) -> Bool {
        guard previous == current else { return true }
        guard backdropMoves else { return false }
        return StoryEditBackdropThrottle.shouldEmit(now: now,
                                                    last: lastCaptureAt,
                                                    minInterval: movingBackdropMinInterval)
    }

    nonisolated static func shouldFeed(lastFed: StoryGlassFeedStamp?, current: StoryGlassFeedStamp) -> Bool {
        lastFed != current
    }

    private nonisolated static func isGlass(_ text: StoryTextObject) -> Bool {
        if case .glass = text.resolvedBackgroundStyle { return true }
        return false
    }

    private nonisolated static func hasFade(_ fadeIn: Double?, _ fadeOut: Double?) -> Bool {
        StoryPlaybackCadence.hasFade(fadeIn, fadeOut)
    }
}

/// La fenêtre d'apparition d'un objet de la capture, en secondes de slide.
private nonisolated struct StoryGlassVisibilityWindow {
    let id: String
    let start: Double?
    let duration: Double?

    func contains(_ seconds: Double) -> Bool {
        let begin = start ?? 0
        let end = duration.map { begin + $0 } ?? .infinity
        return seconds >= begin && seconds < end
    }
}
