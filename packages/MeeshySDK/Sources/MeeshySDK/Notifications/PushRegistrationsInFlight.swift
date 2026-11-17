import Foundation

/// Les enregistrements de jetons push (APNs, VoIP) encore en vol (#18911).
///
/// La sortie de session attend qu'ils aboutissent avant de retirer les jetons de
/// l'appareil : une passerelle antérieure à #18910 valide un POST traité APRÈS le
/// DELETE, et recrée la ligne active du compte quitté. L'attente est bornée : un
/// réseau lent ne retient jamais la sortie.
@MainActor
public final class PushRegistrationsInFlight {
    public static let shared = PushRegistrationsInFlight()

    private var count = 0

    nonisolated deinit {}

    public init() {}

    public var isEmpty: Bool { count == 0 }

    /// Encadre un POST d'enregistrement : le vol se termine quel que soit son issue.
    public func track(_ registration: () async throws -> Void) async rethrows {
        count += 1
        defer { count -= 1 }
        try await registration()
    }

    /// Rend la main quand plus rien n'est en vol, ou passé `limit`.
    public func settle(within limit: Duration, polling interval: Duration = .milliseconds(50)) async {
        let clock = ContinuousClock()
        let deadline = clock.now.advanced(by: limit)
        while count > 0, clock.now < deadline {
            do {
                try await Task.sleep(for: interval)
            } catch {
                return
            }
        }
    }
}
