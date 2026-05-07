import Foundation
import Combine
import SwiftUI

/// Logique pure de cycle de vie pour un message ephemere.
/// Was: ThemedMessageBubble.startEphemeralTimerIfNeeded() + ephemeralTimerText.
enum BubbleEphemeralLifecycle {
    enum State: Equatable {
        case running(remaining: TimeInterval)
        case expired
        case none

        /// Calcule l'etat selon la date d'expiration et l'heure courante.
        ///
        /// - Returns: `.none` si pas de date d'expiration, `.expired` si depassee,
        ///   `.running(remaining:)` sinon (en secondes).
        static func evaluate(expiresAt: Date?, now: Date = Date()) -> State {
            guard let expiresAt else { return .none }
            let remaining = expiresAt.timeIntervalSince(now)
            return remaining <= 0 ? .expired : .running(remaining: remaining)
        }
    }

    /// Format compact du temps restant (ex: "7s", "1m 05s", "2h 03m").
    static func format(remaining: TimeInterval) -> String {
        let total = max(0, Int(remaining))
        if total < 10 {
            return "\(total)s"
        }
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        if hours > 0 {
            return String(format: "%dh %02dm", hours, minutes)
        }
        if minutes > 0 {
            return String(format: "%dm %02ds", minutes, seconds)
        }
        return "\(seconds)s"
    }
}

/// Controleur dedie au timer ephemere (decouple de la bulle SwiftUI).
/// Encapsule le `Timer.publish` + le calcul d'etat.
@MainActor
final class BubbleEphemeralController: ObservableObject {
    @Published private(set) var state: BubbleEphemeralLifecycle.State = .none

    private var cancellable: AnyCancellable?
    private var expiresAt: Date?

    /// Demarre le timer pour la date d'expiration donnee. Idempotent —
    /// appeler plusieurs fois remplace le timer en cours.
    func start(expiresAt: Date) {
        self.expiresAt = expiresAt
        let initial = BubbleEphemeralLifecycle.State.evaluate(expiresAt: expiresAt)
        self.state = initial
        if case .expired = initial {
            cancellable = nil
            return
        }

        cancellable = Timer.publish(every: 1, on: .main, in: .common)
            .autoconnect()
            .sink { [weak self] _ in
                guard let self, let expiresAt = self.expiresAt else { return }
                let next = BubbleEphemeralLifecycle.State.evaluate(expiresAt: expiresAt)
                self.state = next
                if case .expired = next {
                    self.cancellable = nil
                }
            }
    }

    /// Arrete le timer sans modifier l'etat (utilise dans `onDisappear`).
    func stop() {
        cancellable = nil
    }
}
