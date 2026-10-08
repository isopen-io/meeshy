import AVFoundation
import MeeshySDK

// MARK: - Dérive en cours de lecture (#9702)

extension StoryMediaLayer {

    /// Recale la vidéo foreground sur la timeline quand elle en a dérivé
    /// au-delà du seuil PENDANT la lecture — pas seulement au démarrage.
    ///
    /// Appelé par le canvas toutes les ~0,5 s (`PlayheadTickClock`). Ne touche
    /// qu'un clip qui JOUE dans sa fenêtre : un clip pas encore commencé, fini,
    /// en pause ou en attente de tampon garde sa logique d'aujourd'hui.
    @MainActor
    func correctTimelineDriftIfNeeded() {
        guard isPlaybackActive, !hasPlayedToEnd,
              let player = avPlayer,
              player.timeControlStatus == .playing else { return }
        let mediaStartTime = media?.startTime ?? 0
        guard slidePlayheadSeconds >= mediaStartTime else { return }
        let expected = Self.trimmedSeekTarget(bounds: currentTrimBounds,
                                              slidePlayheadSeconds: slidePlayheadSeconds,
                                              mediaStartTime: mediaStartTime)
        guard let target = VideoDriftCorrection.driftCorrection(
            expected: expected,
            actual: player.currentTime().seconds,
            threshold: Self.timelineSeekDriftThreshold) else { return }
        player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero)
    }
}
