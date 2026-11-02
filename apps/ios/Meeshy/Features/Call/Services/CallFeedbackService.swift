import Foundation
import MeeshySDK

/// #8072 — ce qui sort de la note d'après-appel : la charge émise par
/// `call:quality-feedback`, et la date de la dernière demande, qui borne la
/// fréquence (D-139). La date vit dans `UserDefaults` : c'est un confort par
/// appareil, jamais un état qu'un autre appareil devrait connaître.
@MainActor
protocol CallFeedbackServiceProviding: AnyObject {
    func lastPromptDate() -> Date?
    func recordPrompt(at date: Date)
    func submit(_ feedback: CallQualityFeedback)
}

@MainActor
final class CallFeedbackService: CallFeedbackServiceProviding {
    nonisolated deinit {}

    static let shared = CallFeedbackService()
    static let lastPromptDefaultsKey = "me.meeshy.call-feedback.last-prompt-at"

    private let emitter: CallQualityFeedbackEmitting
    private let defaults: UserDefaults

    init(
        emitter: CallQualityFeedbackEmitting = MessageSocketManager.shared,
        defaults: UserDefaults = .standard
    ) {
        self.emitter = emitter
        self.defaults = defaults
    }

    func lastPromptDate() -> Date? {
        defaults.object(forKey: Self.lastPromptDefaultsKey) as? Date
    }

    func recordPrompt(at date: Date) {
        defaults.set(date, forKey: Self.lastPromptDefaultsKey)
    }

    func submit(_ feedback: CallQualityFeedback) {
        emitter.emitCallQualityFeedback(feedback)
    }
}
