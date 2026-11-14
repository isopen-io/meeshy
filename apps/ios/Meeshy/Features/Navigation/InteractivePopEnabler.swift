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
    /// « aucune possibilité de naviguer librement
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

/// **La politique du geste de bord d'un écran poussé se décide une fois, par route** (#18491).
///
/// Seuls la conversation et les pages du jeu montaient l'activateur : le geste des
/// autres écrans poussés dépendait du chemin parcouru, et l'écran poussé après une
/// Rivière héritait d'un geste désactivé. `RootRouteDestination` applique cette
/// politique à chaque route ; le `switch` sans `default` oblige toute nouvelle route
/// à choisir la sienne à la compilation.
enum RouteEdgeSwipe: Equatable {
    /// L'écran réaffirme le geste à chaque apparition.
    case restored
    /// L'écran porte sa propre politique (la Rivière de la conversation).
    case ownedByScreen

    static func policy(for route: Route) -> RouteEdgeSwipe {
        switch route {
        case .conversation:
            return .ownedByScreen
        case .settings, .profile, .contacts, .peopleDiscovery, .nearbyDiscovery,
             .communityList, .communityDetail, .communityCreate, .communitySettings,
             .communityMembers, .communityInvite, .notifications, .userStats,
             .progression, .progressionSection, .progressionRules, .progressionNotebook,
             .gamePage, .progressionConcept, .progressionDashboard, .links, .affiliate,
             .trackingLinks, .shareLinks, .communityLinks, .dataExport, .postDetail,
             .hashtagResults, .bookmarks, .starredMessages, .friendRequests,
             .storyNotificationTarget, .moodSpotlight:
            return .restored
        }
    }
}

extension View {
    /// Monte l'activateur du geste de bord quand la politique de la route le demande.
    func restoresEdgeSwipe(for route: Route) -> some View {
        modifier(RouteEdgeSwipeModifier(policy: RouteEdgeSwipe.policy(for: route)))
    }
}

private struct RouteEdgeSwipeModifier: ViewModifier {
    let policy: RouteEdgeSwipe

    func body(content: Content) -> some View {
        switch policy {
        case .restored:
            content.background(InteractivePopEnabler())
        case .ownedByScreen:
            content
        }
    }
}
