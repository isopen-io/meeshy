import XCTest
@testable import Meeshy

/// **La racine n'observe plus ce qu'elle ne dessine pas** (#7010).
///
/// `NotificationToastManager` publie deux choses : `unreadCount` et
/// `currentToast`. `RootView` (1 955 lignes) ne dessine QUE la première ; le
/// toast est rendu par `RootNotificationToastOverlay`, une feuille dédiée qui
/// l'observe pour son compte. Tant que la racine déclare le gestionnaire en
/// `@ObservedObject`, chaque notification reçue la ré-évalue DEUX fois de plus
/// que nécessaire — l'apparition puis la disparition d'une bannière qu'elle ne
/// peint pas.
///
/// L'invariant se tient par la SOURCE : un abonnement inutile ne change aucun
/// pixel, il coûte des images (même méthode de preuve que #6226,
/// `e06dee46d6`).
final class RootRerenderSourceGuardTests: XCTestCase {

    private func viewsRoot() -> URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Views
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views")
    }

    private func strippedSource(_ relativePath: String) throws -> String {
        AppSourceGuard.stripComments(
            try String(contentsOf: viewsRoot().appendingPathComponent(relativePath), encoding: .utf8)
        )
    }

    func test_rootView_doesNotObserveTheNotificationToastManager() throws {
        let code = try strippedSource("RootView.swift")
        XCTAssertFalse(
            code.contains("@ObservedObject private var notificationManager"),
            "`RootView` ne doit plus s'abonner à `NotificationToastManager` : elle ne lit que `unreadCount`, et le toast a sa propre feuille (#7010)."
        )
        XCTAssertTrue(
            code.contains("RootNotificationSource()"),
            "`RootView` doit passer par `RootNotificationSource`, qui republie le COMPTEUR seul et porte le gestionnaire en `let` non observé (#7010)."
        )
    }

    /// Le toast garde SON observateur — là, il est justifié : cette feuille
    /// DESSINE `currentToast`. Retirer l'abonnement de la racine ne vaut que si
    /// quelqu'un, plus bas, le tient encore : un correctif dont la valeur
    /// n'atteint aucun lecteur n'a corrigé personne.
    func test_theToastOverlayStillObservesTheManagerItDraws() throws {
        let code = try strippedSource("RootLayers/RootSharedLayers.swift")
        XCTAssertTrue(
            code.contains("@ObservedObject var notificationManager: NotificationToastManager"),
            "`RootNotificationToastOverlay` DOIT observer le gestionnaire : c'est elle qui rend `currentToast` (#7010)."
        )
    }

    /// **Le compteur est dédoublonné.** `refreshUnreadCount` est rappelée au
    /// démarrage, à chaque retour en avant-plan et après chaque marquage-lu, et
    /// rend très souvent la même valeur ; `@Published` republie sans comparer.
    func test_theUnreadCountSourceDropsRepeats() throws {
        let code = AppSourceGuard.stripComments(
            try String(contentsOf: viewsRoot().appendingPathComponent("RootNotificationSource.swift"), encoding: .utf8)
        )
        XCTAssertTrue(
            code.contains(".removeDuplicates()"),
            "`RootNotificationSource` doit dédoublonner le compteur — sinon la racine se ré-évalue pour une valeur qui n'a pas bougé (#7010)."
        )
    }
}
