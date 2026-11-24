import Foundation

/// Le niveau d'une voix du talkie (#17310, #20531) : sa moyenne quadratique, son plancher, et le lissage qui suit
/// l'attaque d'une syllabe sans trembler entre deux.
nonisolated enum TalkieWaveLaw {
    /// En deçà, c'est le silence ; 0 dBFS est le plafond.
    static let floorDecibels: Float = -50
    /// Montée rapide, descente lente : l'onde suit l'attaque d'une syllabe sans trembler entre deux.
    static let attack: Float = 0.55
    static let release: Float = 0.12

    /// La moyenne quadratique d'un tampon PCM, appelée sur le fil audio.
    static func rms(_ samples: UnsafeBufferPointer<Float>) -> Float {
        guard !samples.isEmpty else { return 0 }
        let energy = samples.reduce(Float(0)) { $0 + $1 * $1 }
        return (energy / Float(samples.count)).squareRoot()
    }

    static func smoothed(previous: Float, target: Float) -> Float {
        let goal = clamp(target)
        let from = clamp(previous)
        let rate = goal > from ? attack : release
        return clamp(from + (goal - from) * rate)
    }

    private static func clamp(_ value: Float) -> Float {
        guard !value.isNaN else { return 0 }
        return min(max(value, 0), 1)
    }
}
