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

/// La session audio de la voix d'un talkie : `MediaSessionCoordinator` en production, un double dans les tests.
@MainActor
protocol TalkieVoiceSessionProviding: AnyObject {
    /// Une session qui interrompt les autres apps au lieu de se mêler à elles.
    func activateVoice()
    /// La session se rend en prévenant les autres apps, qui reprennent.
    func releaseVoice()
}

/// Ce que l'utilisateur écoutait dans Meeshy : vocal, vidéo, réel, story, séance Ensemble.
@MainActor
protocol MeeshyListeningProviding: AnyObject {
    func pauseListening()
    func resumeListening()
}

/// **Ce qu'on écoutait se tait pendant la voix d'un talkie, puis reprend** (#18820).
///
/// - La voix commence : les lecteurs Meeshy se mettent en pause, PUIS la session se prend sans mélange — la musique
///   d'une autre app s'interrompt (`InterruptingVoiceSessionLaw`).
/// - La voix finit (fin, « Couper », durée dépassée) : la session se rend en prévenant les autres apps, PUIS les
///   lecteurs Meeshy reprennent — ceux que l'utilisateur a mis en pause entre-temps restent en pause.
/// - Réveillée par Push to Talk, la session appartient au système : seuls les lecteurs sont touchés.
@MainActor
final class TalkieListeningHold {
    private let session: TalkieVoiceSessionProviding
    private let listening: MeeshyListeningProviding
    private(set) var isHolding = false

    nonisolated deinit {}

    init(session: TalkieVoiceSessionProviding, listening: MeeshyListeningProviding) {
        self.session = session
        self.listening = listening
    }

    func begin(systemSession: Bool) {
        guard !isHolding else { return }
        isHolding = true
        listening.pauseListening()
        guard !systemSession else { return }
        session.activateVoice()
    }

    func end(systemSession: Bool) {
        guard isHolding else { return }
        isHolding = false
        if !systemSession { session.releaseVoice() }
        listening.resumeListening()
    }
}
