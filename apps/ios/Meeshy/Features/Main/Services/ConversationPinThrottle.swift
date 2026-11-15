import Foundation
import MeeshySDK

// MARK: - La temporisation (#11388)

/// Les échecs d'un code, et ce qu'ils coûtent : rien pour les quatre premiers,
/// puis 30 s, doublées à chaque échec, plafonnées à une heure. Dix mille essais
/// coûtent alors plus d'un an.
///
/// Persistée avec le code (le coffre), donc tuer l'app ne la remet pas à zéro ;
/// une horloge reculée ne raccourcit pas l'attente (`anchored(at:)`).
nonisolated struct ConversationPinThrottle: Codable, Equatable, Sendable {
    static let freeFailures = 4
    static let baseDelay: TimeInterval = 30
    static let maximumDelay: TimeInterval = 3_600

    let failures: Int
    let lastFailureAt: Date?

    init(failures: Int = 0, lastFailureAt: Date? = nil) {
        self.failures = failures
        self.lastFailureAt = lastFailureAt
    }

    static func delay(afterFailures failures: Int) -> TimeInterval {
        guard failures > freeFailures else { return 0 }
        return RetryPolicy(maxAttempts: nil, firstDelay: baseDelay, maxDelay: maximumDelay)
            .delay(afterFailure: min(failures - freeFailures, 21), jitterSample: 0)
    }

    func retryDelay(at now: Date) -> TimeInterval {
        let delay = Self.delay(afterFailures: failures)
        guard delay > 0, let lastFailureAt else { return 0 }
        let elapsed = max(0, now.timeIntervalSince(lastFailureAt))
        return max(0, delay - elapsed)
    }

    /// Un dernier échec daté dans le FUTUR (horloge reculée) est ramené à
    /// maintenant : l'attente repart entière au lieu de durer jusqu'à la date
    /// d'origine — ou de disparaître.
    func anchored(at now: Date) -> ConversationPinThrottle {
        guard let lastFailureAt, lastFailureAt > now else { return self }
        return ConversationPinThrottle(failures: failures, lastFailureAt: now)
    }

    func recordingFailure(at now: Date) -> ConversationPinThrottle {
        ConversationPinThrottle(failures: failures + 1, lastFailureAt: now)
    }
}

/// Le verdict d'un essai. `retryIn` : secondes avant qu'un nouvel essai soit
/// seulement examiné (0 = tout de suite).
nonisolated enum PinAttemptOutcome: Equatable, Sendable {
    case granted
    case rejected(retryIn: TimeInterval)
    case throttled(retryIn: TimeInterval)

    var retryDelay: TimeInterval? {
        switch self {
        case .granted: return nil
        case .rejected(let wait), .throttled(let wait): return wait
        }
    }
}
