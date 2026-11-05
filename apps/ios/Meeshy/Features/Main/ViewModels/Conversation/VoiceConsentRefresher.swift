import Foundation
import Combine
import UIKit

/// **Le consentement vocal se RELIT** (#16418) : à chaque réapparition de la
/// conversation et à chaque retour au premier plan — la note « activez le
/// consentement vocal » ne survit plus à un consentement donné dans les Réglages.
///
/// Jamais bloquant : un consentement déjà CONNU accordé publie aussitôt, sans
/// réseau ; sinon la relecture publie à son retour. Une relecture DÉPASSÉE par
/// une écriture plus récente (l'octroi optimiste du popup d'envoi) ne publie
/// plus : son « manquant » daterait d'avant l'octroi.
@MainActor
final class VoiceConsentRefresher {
    nonisolated deinit {}

    private let gate: any VoiceConsentGateProviding
    private var generation = 0
    private var foreground: AnyCancellable?

    nonisolated init(gate: any VoiceConsentGateProviding) {
        self.gate = gate
    }

    @discardableResult
    func refresh(publish: @escaping @MainActor (Bool) -> Void) -> Task<Void, Never>? {
        generation += 1
        guard !gate.isKnownGranted else {
            publish(false)
            return nil
        }
        let issued = generation
        let gate = gate
        return Task { [weak self] in
            let missing = await gate.fetchMissing()
            guard let self, self.generation == issued else { return }
            publish(missing)
        }
    }

    /// Une écriture locale fait foi : les relectures en vol ne publient plus.
    func supersede() {
        generation += 1
    }

    /// Idempotent : un seul abonnement, quel que soit le nombre de réapparitions.
    func observeForeground(
        _ center: NotificationCenter = .default,
        onForeground: @escaping @MainActor () -> Void
    ) {
        guard foreground == nil else { return }
        foreground = center.publisher(for: UIApplication.willEnterForegroundNotification)
            .receive(on: DispatchQueue.main)
            .sink { _ in MainActor.assumeIsolated { onForeground() } }
    }
}
