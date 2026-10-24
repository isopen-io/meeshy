import UIKit
import AVFoundation
import MeeshySDK

// MARK: - La qualité de lecture du fond vidéo (#11287)

extension StoryCanvasUIView {

    /// La story que ce canvas lit, déclarée par l'hôte qui la connaît. `nil` :
    /// rien n'est mesuré (aperçu du composer, calque sortant d'un fondu).
    public func setPlaybackQoETarget(_ target: SocialTarget?) {
        backgroundLayer.playbackQoE.target = target
        if case .video = backgroundLayer.kind, mode == .play { backgroundLayer.playbackQoE.markWaiting() }
        beginBackgroundPlaybackQoE()
    }

    /// Le canvas attend sa première image : l'horloge du temps-à-première-image part ICI.
    func markBackgroundPlaybackQoEWaiting() {
        guard mode == .play else { return }
        backgroundLayer.playbackQoE.markWaiting()
    }

    /// Ouvre la session quand le player de fond existe, en lecture. Idempotent
    /// pour un même player ; sans cible déclarée, ne mesure rien.
    func beginBackgroundPlaybackQoE() {
        guard mode == .play, case .video = backgroundLayer.kind,
              let player = backgroundLayer.avPlayer,
              let playerLayer = backgroundLayer.avPlayerLayer else { return }
        backgroundLayer.playbackQoE.begin(
            player: player,
            layer: playerLayer,
            mediaId: StoryBackgroundLayer.mediaIdentity(for: backgroundLayer.kind) ?? slide.id,
            mutedAtStart: player.isMuted
        )
    }

    /// Une scène allée au bout se ferme `completed`, toute autre sortie `swiped`.
    func finishBackgroundPlaybackQoE() {
        backgroundLayer.playbackQoE.finish(reason: completionFired ? .completed : .swiped)
    }
}
