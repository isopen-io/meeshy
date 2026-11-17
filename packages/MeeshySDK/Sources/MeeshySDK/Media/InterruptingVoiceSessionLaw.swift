#if os(iOS)
import AVFoundation

/// **Une voix courte qui INTERROMPT ce qu'on écoutait, puis le rend** (#18820) — la loi, sans session.
///
/// - Elle prend une catégorie qui ne se mélange pas : la musique ou le podcast d'une autre app se met en pause au lieu
///   de couvrir la voix. Rien d'autre ne joue : `.soloAmbient`, qui garde le bouton silencieux. Une autre app joue :
///   `.playback`, entendue même en silencieux, puisque l'utilisateur écoutait déjà quelque chose.
/// - Une catégorie de lecture déjà posée par l'app perd seulement `.mixWithOthers` ; une catégorie sans mélange est
///   gardée telle quelle.
/// - À la fin, la session se rend avec `.notifyOthersOnDeactivation` : l'autre app reprend.
/// - Pendant un appel ou un enregistrement, la session n'est ni reconfigurée ni rendue : elle ne lui appartient pas.
public nonisolated enum InterruptingVoiceSessionLaw {

    public struct Configuration: Equatable, Sendable {
        public let category: AVAudioSession.Category
        public let options: AVAudioSession.CategoryOptions

        public init(category: AVAudioSession.Category, options: AVAudioSession.CategoryOptions) {
            self.category = category
            self.options = options
        }
    }

    public static let activationOptions: AVAudioSession.SetActiveOptions = []
    public static let deactivationOptions: AVAudioSession.SetActiveOptions = .notifyOthersOnDeactivation

    /// La catégorie à poser avant de s'activer, ou `nil` pour garder celle en place.
    public static func activation(
        category: AVAudioSession.Category,
        options: AVAudioSession.CategoryOptions,
        otherAudioPlaying: Bool
    ) -> Configuration? {
        if category == .ambient || category == .soloAmbient {
            return Configuration(category: otherAudioPlaying ? .playback : .soloAmbient, options: [])
        }
        guard options.contains(.mixWithOthers) else { return nil }
        return Configuration(category: category, options: options.subtracting(.mixWithOthers))
    }

    /// La session peut-elle être reconfigurée, puis rendue, par la voix ?
    public static func mayManageSession(callActive: Bool, recordingHoldsSession: Bool) -> Bool {
        !callActive && !recordingHoldsSession
    }
}
#endif
