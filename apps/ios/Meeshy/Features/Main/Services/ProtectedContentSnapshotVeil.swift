import UIKit
import MeeshyUI

/// **L'instantané du sélecteur d'applications ne montre pas un contenu qui
/// disparaît** (#9574).
///
/// La couche sécurisée (`CaptureShield`) noircit les captures, les
/// enregistrements et la recopie d'écran ; l'instantané que le système prend
/// quand l'application quitte le premier plan est un autre chemin. Dès
/// `willResignActive`, si au moins un contenu protégé est dans une fenêtre
/// (`SecureCaptureRegistry`), un voile opaque couvre chaque fenêtre de
/// l'application ; il se retire au retour au premier plan. Aucun contenu
/// protégé à l'écran : rien ne se pose, le sélecteur montre l'écran tel quel.
///
/// Installé UNE fois au lancement ; branche aussi le signalement du bouclier
/// (`CaptureShieldDiagnostics.reporter`) sur le journal de diagnostic.
final class ProtectedContentSnapshotVeil {
    nonisolated deinit {}

    static let shared = ProtectedContentSnapshotVeil()

    private var veils: [UIView] = []
    private var observers: [NSObjectProtocol] = []

    /// La règle : un voile seulement quand un contenu protégé est affiché.
    nonisolated static func shouldVeil(visibleProtectedCount: Int) -> Bool {
        visibleProtectedCount > 0
    }

    func install() {
        guard observers.isEmpty else { return }
        CaptureShieldDiagnostics.reporter = { message in
            CrashDiagnosticsManager.shared.log(message)
        }
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: UIApplication.willResignActiveNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { ProtectedContentSnapshotVeil.shared.raise() }
            },
            center.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { ProtectedContentSnapshotVeil.shared.lower() }
            },
        ]
    }

    func raise() {
        guard veils.isEmpty,
              Self.shouldVeil(visibleProtectedCount: SecureCaptureRegistry.visibleCount) else { return }
        veils = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .filter { !$0.isHidden }
            .map { window in
                let veil = Self.makeVeil(frame: window.bounds)
                window.addSubview(veil)
                return veil
            }
    }

    func lower() {
        veils.forEach { $0.removeFromSuperview() }
        veils = []
    }

    private static func makeVeil(frame: CGRect) -> UIView {
        let veil = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
        veil.frame = frame
        veil.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        veil.contentView.backgroundColor = UIColor.systemBackground.withAlphaComponent(0.92)
        veil.isAccessibilityElement = false
        veil.accessibilityElementsHidden = true
        return veil
    }
}
