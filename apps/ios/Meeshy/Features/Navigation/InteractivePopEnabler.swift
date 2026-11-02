import SwiftUI
import UIKit

/// **Réactive le geste de retour par le bord gauche quand la barre est masquée.**
///
/// `UINavigationController` DÉSACTIVE son `interactivePopGestureRecognizer` dès
/// qu'on masque sa barre : le geste n'est pas « perdu », il est retiré, et
/// aucune API SwiftUI ne le rend. Tout écran qui porte son propre chrome —
/// c'est-à-dire tous ceux de cette app — le perd donc en silence, et l'utilisateur
/// n'a plus que le bouton pour revenir.
///
/// **Pourquoi ce fichier existe.** La parade vivait en `private struct` dans
/// `ConversationView.swift` : la première page qui en a eu besoin ailleurs
/// (les sections du hub de progression, #5843) ne pouvait que la RECOPIER, et
/// une jumelle recopiée diverge — celle-ci porte une politique (`allowsEdgeSwipe`)
/// dont la Rivière dépend, et qu'une copie n'aurait pas suivie. Un seul site,
/// donc, et les deux écrans le montent.
struct InteractivePopEnabler: UIViewControllerRepresentable {
    /// **La Rivière défile HORIZONTALEMENT — le geste de bord doit lui céder.**
    /// Retour produit 2026-08-21 : « aucune possibilité de naviguer librement
    /// horizontalement ». Le geste de retour par bord gauche d'iOS, réactivé
    /// ici pour toutes les autres vues du fil, s'emparait de chaque balayage
    /// latéral : mesuré au simulateur, un glissement dans la Rivière fermait
    /// la conversation au lieu de changer de couloir. Le fil vertical, lui,
    /// n'a jamais eu d'axe horizontal à défendre — d'où l'activation d'origine,
    /// conservée intégralement partout ailleurs. Le bouton « Retour » de
    /// l'en-tête reste, dans les deux cas, le chemin explicite.
    let allowsEdgeSwipe: Bool

    init(allowsEdgeSwipe: Bool = true) {
        self.allowsEdgeSwipe = allowsEdgeSwipe
    }

    func makeUIViewController(context: Context) -> PopEnablerVC {
        let vc = PopEnablerVC()
        vc.allowsEdgeSwipe = allowsEdgeSwipe
        return vc
    }

    func updateUIViewController(_ vc: PopEnablerVC, context: Context) {
        vc.allowsEdgeSwipe = allowsEdgeSwipe
        vc.applyEdgeSwipePolicy()
    }

    final class PopEnablerVC: UIViewController {
        // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
        // défaut) → double-free `pointer being freed was not allocated` (abrt)
        // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
        // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
        nonisolated deinit {}

        var allowsEdgeSwipe: Bool = true

        override func viewWillAppear(_ animated: Bool) {
            super.viewWillAppear(animated)
            applyEdgeSwipePolicy()
        }

        func applyEdgeSwipePolicy() {
            guard let navigation = navigationController,
                  let recognizer = navigation.interactivePopGestureRecognizer else { return }
            recognizer.isEnabled = allowsEdgeSwipe
            recognizer.delegate = EdgeSwipePopGuard.installed(on: navigation)
        }
    }
}

/// **Le geste de retour ne démarre que s'il y a quelque chose à dépiler** (#10839).
///
/// Masquer la barre retire au geste son délégué d'origine, et c'est ce délégué
/// qui le refusait sur la racine de la pile. L'ancienne parade le remplaçait par
/// `nil` : plus rien ne refusait, et un balayage depuis le bord sur la liste des
/// conversations ouvrait une transition SANS écran à retirer. UIKit gèle alors
/// les touchers le temps qu'elle se résolve — la liste ne défilait plus pendant
/// quelques secondes, sans une goutte de CPU sur le fil principal.
///
/// Le garde est rattaché au contrôleur de navigation, pas à l'écran qui l'a
/// posé : le délégué du geste est `weak`, et c'est précisément APRÈS le retour
/// à la racine, quand l'écran poussé n'existe plus, qu'il doit encore refuser.
final class EdgeSwipePopGuard: NSObject, UIGestureRecognizerDelegate {
    private static var associationKey: UInt8 = 0

    private weak var navigation: UINavigationController?

    private init(navigation: UINavigationController) {
        self.navigation = navigation
    }

    nonisolated deinit {}

    static func installed(on navigation: UINavigationController) -> EdgeSwipePopGuard {
        if let existing = objc_getAssociatedObject(navigation, &associationKey) as? EdgeSwipePopGuard {
            return existing
        }
        let guardian = EdgeSwipePopGuard(navigation: navigation)
        objc_setAssociatedObject(navigation, &associationKey, guardian, .OBJC_ASSOCIATION_RETAIN_NONATOMIC)
        return guardian
    }

    func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
        guard let navigation else { return false }
        return navigation.viewControllers.count > 1 && navigation.transitionCoordinator == nil
    }
}
