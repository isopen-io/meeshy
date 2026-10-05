import Foundation
import MeeshySDK

/// #8072 — la règle de la note d'après-appel, pure, jumelle de
/// `feedbackPromptFor` (web) et arrêtée par D-139 : un appel qui a vraiment
/// eu lieu (≥ 10 s, raccroché ou perdu), un sur cinq au hasard, toujours
/// celui qui a souffert (reprise, lien dégradé, connexion perdue), et au plus
/// une demande par jour glissant.
nonisolated enum CallFeedbackPolicy {
    static let sampleRate = 0.2
    static let minimumDuration: TimeInterval = 10
    static let cooldown: TimeInterval = 24 * 60 * 60
    static let goodRating = 4

    static func shouldAsk(duration: TimeInterval, reason: CallEndReason, troubled: Bool, random: Double) -> Bool {
        guard duration >= minimumDuration else { return false }
        switch reason {
        case .connectionLost:
            return true
        case .local, .remote:
            return troubled || random < sampleRate
        case .rejected, .missed, .failed:
            return false
        }
    }

    static func cooldownAllows(lastPromptAt: Date?, now: Date) -> Bool {
        guard let lastPromptAt, lastPromptAt <= now else { return true }
        return now.timeIntervalSince(lastPromptAt) >= cooldown
    }

    static func issues(isVideo: Bool) -> [CallFeedbackIssue] {
        isVideo
            ? [.audioQuality, .videoQuality, .echo, .dropped, .sync, .other]
            : [.audioQuality, .echo, .dropped, .other]
    }

    static func feedback(callId: String, rating: Int, issues: [CallFeedbackIssue]) -> CallQualityFeedback? {
        CallQualityFeedback(callId: callId, rating: rating, issues: rating >= goodRating ? [] : issues)
    }
}
