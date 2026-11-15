import QuartzCore
import MeeshySDK

/// Ce que la lecture d'une slide exige de son horloge (#9864).
nonisolated enum StoryPlaybackCadenceTier: Equatable, Sendable {
    /// Un contenu suit le playhead image par image : vidéo, son, keyframes,
    /// fondus, décorations animées, transitions, ou un hôte qui dessine sa
    /// barre de progression depuis `onPlaybackTime`.
    case high
    /// Rien ne bouge entre deux images : l'horloge ne sert plus qu'à avancer
    /// le playhead, sonder la santé de lecture et constater la fin.
    case low
}

/// **Une slide immobile ne tient plus l'écran à 60–120 Hz** (#9864).
///
/// `startPlayback` armait le lien de lecture à `60…120 Hz` pour toute slide,
/// même un texte posé sur une photo : chaque tick reconstruisait la scène pour
/// rendre la même image. La loi lit la slide et ce qui l'accompagne, et rend le
/// palier ; la vue n'en garde que la projection en `CAFrameRateRange`.
///
/// La barre du lecteur de stories ne dépend pas de ce lien : elle avance par le
/// lien de `StoryReaderTimerController`. Celle d'un réel ou de la galerie, si —
/// d'où l'entrée `relaysPlaybackClock`, qui garde le palier haut dès qu'un hôte
/// écoute `onPlaybackTime`.
enum StoryPlaybackCadence {

    /// La transition de fin se pose par tick : le palier remonte un peu AVANT
    /// sa fenêtre, pour que sa première image ne tombe pas sur un tick lent.
    nonisolated static let closingLead: Double = 0.25

    nonisolated static func tier(slide: StorySlide,
                                 elapsed: Double,
                                 totalDuration: Double,
                                 backgroundIsVideo: Bool,
                                 hasSchedulableAudio: Bool,
                                 relaysPlaybackClock: Bool) -> StoryPlaybackCadenceTier {
        if backgroundIsVideo || hasSchedulableAudio || relaysPlaybackClock { return .high }
        if isInOpening(slide: slide, elapsed: elapsed) { return .high }
        if isNearClosing(slide: slide, elapsed: elapsed, totalDuration: totalDuration) { return .high }
        return carriesTimedContent(slide) ? .high : .low
    }

    /// La plage du lien de lecture pour un palier d'horloge, sur un appareil de
    /// tier `mediaTier` (#11281). Le palier haut d'un appareil faible vise 30 Hz
    /// (bas) ou 60 Hz (moyen) plutôt qu'une plage que sa puce ne tient pas : une
    /// cadence stable vaut mieux qu'une cadence haute qui saccade. `high` et
    /// `pro` gardent la plage historique ; le palier immobile ne dépend pas de
    /// l'appareil.
    ///
    /// `mediaTier` est REQUIS, sans défaut : un site qui pose la plage sans
    /// dire le tier — une résolution de conflit qui garderait l'ancienne ligne,
    /// par exemple — ne compile pas, au lieu d'effacer en silence le tier des
    /// stories. Le site vivant le lit de `DeviceMediaTier.current`.
    nonisolated static func frameRateRange(for tier: StoryPlaybackCadenceTier,
                                           mediaTier: DeviceMediaTier) -> CAFrameRateRange {
        switch (tier, mediaTier) {
        case (.low, _): return CAFrameRateRange(minimum: 10, maximum: 30, preferred: 30)
        case (.high, .low): return CAFrameRateRange(minimum: 30, maximum: 60, preferred: 30)
        case (.high, .mid): return CAFrameRateRange(minimum: 30, maximum: 60, preferred: 60)
        case (.high, .high), (.high, .pro): return CAFrameRateRange(minimum: 60, maximum: 120, preferred: 60)
        }
    }

    private nonisolated static func isInOpening(slide: StorySlide, elapsed: Double) -> Bool {
        slide.effects.opening != nil && elapsed < StoryRenderer.slideTransitionDuration
    }

    private nonisolated static func isNearClosing(slide: StorySlide,
                                                  elapsed: Double,
                                                  totalDuration: Double) -> Bool {
        guard slide.effects.closing != nil else { return false }
        return StoryRenderer.closingProgress(totalDuration: totalDuration, at: elapsed + closingLead) > 0
    }

    /// Ce qui se recalcule au playhead dans `StoryRenderer.render` en lecture —
    /// textes en verre compris, à la différence de la capture du verre.
    private nonisolated static func carriesTimedContent(_ slide: StorySlide) -> Bool {
        let effects = slide.effects
        if !(effects.clipTransitions ?? []).isEmpty { return true }
        let timedText = effects.textObjects.contains {
            hasFade($0.fadeIn, $0.fadeOut) || !($0.keyframes ?? []).isEmpty
        }
        let timedMedia = (effects.mediaObjects ?? []).contains {
            $0.kind == .video || hasFade($0.fadeIn, $0.fadeOut) || !($0.keyframes ?? []).isEmpty
        }
        let timedSticker = (effects.stickerObjects ?? []).contains {
            $0.animation != nil || hasFade($0.fadeIn, $0.fadeOut)
        }
        let timedPlace = effects.locationObjects.contains { hasFade($0.fadeIn, $0.fadeOut) }
        return timedText || timedMedia || timedSticker || timedPlace
    }

    /// Un fondu d'entrée ou de sortie non nul — partagé avec
    /// `StoryGlassBackdropPlayback`, qui pose la même question à la capture.
    nonisolated static func hasFade(_ fadeIn: Double?, _ fadeOut: Double?) -> Bool {
        (fadeIn ?? 0) > 0 || (fadeOut ?? 0) > 0
    }
}
