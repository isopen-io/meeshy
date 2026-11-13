import AVFoundation

/// Où et à quel volume sort la voix d'un talkie (#17087) : sur la sortie INTÉGRÉE de l'iPhone, le haut-parleur (jamais
/// l'écouteur d'oreille) et un gain ×2 (+6 dB) sur le volume du moment ; dès qu'une sortie personnelle est branchée
/// (écouteurs, casque, AirPods, Bluetooth, voiture, AirPlay, USB), ni redirection ni gain.
nonisolated struct TalkieOutputPlan: Equatable, Sendable {
    /// +6,02 dB : l'amplitude doublée.
    static let boostDecibels: Float = 6.02

    let routesToSpeaker: Bool
    let gainDecibels: Float

    static func decide(outputs: [AVAudioSession.Port]) -> TalkieOutputPlan {
        let builtIn: Set<AVAudioSession.Port> = [.builtInSpeaker, .builtInReceiver]
        guard !outputs.isEmpty, outputs.allSatisfy(builtIn.contains) else {
            return TalkieOutputPlan(routesToSpeaker: false, gainDecibels: 0)
        }
        return TalkieOutputPlan(routesToSpeaker: outputs.contains(.builtInReceiver), gainDecibels: boostDecibels)
    }
}
