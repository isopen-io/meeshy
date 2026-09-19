import Combine
import Foundation
import MeeshySDK

/// **Ce que la RACINE lit du gestionnaire de notifications — et rien d'autre**
/// (#7010).
///
/// `NotificationToastManager` publie DEUX choses : `unreadCount` et
/// `currentToast`. `RootView` (1 955 lignes) l'observait en `@ObservedObject`,
/// donc les DEUX la ré-évaluaient — alors qu'elle ne lit que la première
/// (pastille de non-lus, valeur d'accessibilité du bouton menu, badges de
/// l'échelle du menu). Le toast, lui, est déjà rendu par une feuille dédiée qui
/// l'observe pour son compte (`RootNotificationToastOverlay`) : la racine payait
/// une apparition ET une disparition de bannière par notification reçue, pour
/// un contenu qu'elle ne dessine pas.
///
/// Cette source republie le COMPTEUR seul, dédoublonné. Le gestionnaire voyage
/// avec elle en `let` — un `let` sur un `ObservableObject` n'abonne à rien — de
/// sorte que les sites qui l'APPELLENT (`refreshUnreadCount`, `dismissToast`)
/// ou le PASSENT à une couche le trouvent sans que la racine s'y réabonne.
/// Appeler une méthode n'exige aucun abonnement — même dispositif que
/// `ConversationListVMOwner` (possession sans observation) et que
/// `TypingEntriesSource` (republication étroite), dont ce type reprend la forme.
///
/// **`removeDuplicates()` n'est pas un détail de confort.** `refreshUnreadCount`
/// est rappelée au démarrage, à chaque retour en avant-plan et après chaque
/// marquage-lu : elle rend très souvent la MÊME valeur, et `@Published`
/// republie sans comparer. Sans le dédoublonnage, la racine se ré-évaluerait
/// pour un compteur qui n'a pas bougé.
@MainActor
final class RootNotificationSource: ObservableObject {
    // iOS 26.1 : deinit synthétisée ISOLÉE (SE-0466, isolation MainActor par
    // défaut) → double-free `pointer being freed was not allocated` (abrt)
    // au démontage hors d'une tâche (test XCTest synchrone, vue démontée).
    // Garde : MainActorDeinitSourceGuardTests / MeeshyUIDeinitSourceGuardTests.
    nonisolated deinit {}

    /// Le nombre de notifications non lues, dédoublonné.
    @Published private(set) var unreadCount: Int = 0

    /// Le gestionnaire, POSSÉDÉ SANS ÊTRE OBSERVÉ.
    let manager: NotificationToastManager

    private var cancellable: AnyCancellable?

    init(manager: NotificationToastManager = .shared) {
        self.manager = manager
        self.unreadCount = manager.unreadCount
        // `receive(on:)` volontairement ABSENT : l'amont est déjà `@MainActor`,
        // et un saut de file retarderait d'un tour de boucle l'apparition d'une
        // pastille dont tout l'intérêt est d'être immédiate. Même raison, mot
        // pour mot, que `TypingEntriesSource`.
        cancellable = manager.$unreadCount
            .removeDuplicates()
            .sink { [weak self] count in
                self?.unreadCount = count
            }
    }
}
