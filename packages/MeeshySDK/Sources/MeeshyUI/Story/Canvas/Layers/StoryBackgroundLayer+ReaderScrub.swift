import AVFoundation
import CoreMedia

// MARK: - StoryBackgroundLayer + ReaderScrub (#7878)
//
// `alignPausedToSlidePlayhead` laisse un fond BOUCLÉ là où il est : pour la
// lecture continue comme pour la preview du composer, sa phase n'a pas de sens
// timeline et le recaler ferait sauter l'image. Le parcours au doigt du lecteur
// est l'inverse : l'utilisateur DEMANDE l'image d'un instant. Mesuré au
// simulateur sur un réel à scène dont le fond boucle — la barre bougeait, la
// vidéo restait figée sur la même image.
//
// Ici, et seulement ici, le fond bouclé est calé sur le tour en cours ; au
// relâcher, `alignToTimelineThenPlay` le laisse repartir de cette phase sans le
// recaler — la boucle reprend là où le doigt l'a posée.

extension StoryBackgroundLayer {

    /// La position, dans l'item d'un fond bouclé, que montre la scène à
    /// `playhead` : le tour en cours, à sa phase. `nil` quand la durée de
    /// l'item n'est pas encore connue.
    nonisolated static func loopedScrubTarget(playhead: Double, itemDuration: Double) -> Double? {
        guard itemDuration.isFinite, itemDuration > 0, playhead.isFinite else { return nil }
        return max(0, playhead).truncatingRemainder(dividingBy: itemDuration)
    }

    /// Fige le fond sur l'instant pointé par le doigt — bouclé ou non.
    @MainActor
    public func alignPausedForReaderScrub() {
        guard avPlayerLooper != nil else {
            alignPausedToSlidePlayhead()
            return
        }
        guard let player = avPlayer else { return }
        player.pause()
        guard let item = player.currentItem,
              let target = Self.loopedScrubTarget(playhead: slidePlayheadSeconds,
                                                  itemDuration: item.duration.seconds) else { return }
        let tolerance = CMTime(seconds: 0.05, preferredTimescale: 600)
        player.seek(to: CMTime(seconds: target, preferredTimescale: 600),
                    toleranceBefore: tolerance, toleranceAfter: tolerance)
    }
}
