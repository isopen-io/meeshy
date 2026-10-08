import Foundation

/// Courbe des fondus du lecteur (#9702) : le volume se LIT sur le temps réel
/// écoulé depuis l'instant PRÉVU du fondu, jamais sur un nombre de pas.
///
/// Avant, chaque réveil avançait d'un pas (`i / steps`) : un `Task.sleep` qui
/// se réveillait en retard étirait la rampe d'autant, et un minuteur de
/// déclenchement tardif la décalait sur la musique. Ici un réveil tardif pose
/// directement la valeur que l'horloge dicte.
nonisolated enum ReaderVolumeRamp {

    /// Cadence de rafraîchissement : `AVAudioPlayerNode.volume` est lu à chaque
    /// tranche de rendu, 60 Hz rend les paliers inaudibles.
    static let stepInterval: TimeInterval = 1.0 / 60.0

    static func volume(from start: Float, to end: Float,
                       duration: TimeInterval, elapsed: TimeInterval) -> Float {
        guard duration.isFinite, duration > 0, elapsed.isFinite else { return end }
        let progress = Float(min(1, max(0, elapsed / duration)))
        return start + (end - start) * progress
    }

    static func isComplete(duration: TimeInterval, elapsed: TimeInterval) -> Bool {
        !(elapsed < duration)
    }
}
