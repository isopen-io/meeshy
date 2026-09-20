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
///
/// **La garde portait sur UNE racine, et le dépôt en a DEUX** (#7166). Elle
/// n'a jamais rougi pour `iPadRootView`, qui a gardé son
/// `@ObservedObject var notificationManager` pendant tout ce temps — alors que
/// son corps porte, lui aussi, tout l'écran. Une garde nommée d'après le
/// fichier qu'elle a servi à corriger ne couvre pas la famille à laquelle il
/// appartient : elle se relit en demandant « qui d'AUTRE est dans ce cas ? ».
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

    /// #7166 — MÊME INVARIANT, AUTRE RACINE. `iPadRootView` déclare le
    /// gestionnaire sans `private` (`@ObservedObject var notificationManager`),
    /// ce que le motif de `RootView` ne pouvait pas attraper : la garde
    /// cherchait une chaîne EXACTE, `private` compris. Le test porte donc sur
    /// l'abonnement, pas sur l'orthographe d'une déclaration.
    func test_iPadRootView_doesNotObserveTheNotificationToastManager() throws {
        let code = try strippedSource("iPadRootView.swift")
        XCTAssertFalse(
            code.contains("@ObservedObject var notificationManager"),
            "`iPadRootView` ne doit pas s'abonner à `NotificationToastManager` : elle ne lit que `unreadCount`, et la bannière a sa propre feuille (#7166, portage de #7010)."
        )
        XCTAssertFalse(
            code.contains("@ObservedObject private var notificationManager"),
            "Ajouter `private` ne rend pas l'abonnement acceptable (#7166)."
        )
        XCTAssertTrue(
            code.contains("RootNotificationSource()"),
            "`iPadRootView` doit passer par `RootNotificationSource`, comme `RootView` (#7166)."
        )
    }

    /// **Les DEUX racines, et rien d'autre.** Ce témoin est celui qui empêche
    /// la prochaine divergence : il n'énumère pas des fichiers connus, il
    /// BALAIE le répertoire des racines. Une troisième racine — un jour, une
    /// coque Mac, une racine de test — naîtrait gardée.
    func test_aucuneRacineNObserveLeGestionnaireEnBloc() throws {
        let racines = try FileManager.default
            .contentsOfDirectory(at: viewsRoot(), includingPropertiesForKeys: nil)
            .filter { $0.lastPathComponent.hasSuffix("RootView.swift") }

        XCTAssertGreaterThanOrEqual(
            racines.count, 2,
            "Le balayage doit voir AU MOINS les deux racines connues — une liste vide se lit comme « rien à signaler »."
        )

        for racine in racines {
            let code = AppSourceGuard.stripComments(try String(contentsOf: racine, encoding: .utf8))
            XCTAssertFalse(
                code.contains("@ObservedObject") && code.contains("NotificationToastManager.shared"),
                "\(racine.lastPathComponent) observe `NotificationToastManager.shared` en bloc — le compteur seul suffit (#7010, #7166)."
            )
        }
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

    /// **Le fil de l'iPhone ne s'abonne pas au coordinateur de lecture
    /// automatique des réels** (#7010).
    ///
    /// `ReelFeedAutoplayCoordinator` publie `activeReelId` PENDANT le
    /// défilement — c'est son rôle : élire le réel le plus centré. Le body de
    /// `ThemedFeedOverlay` n'en lit aucune valeur ; il ne fait que remettre la
    /// référence (`coordinator:`, `reelAutoplay:`) et l'appeler (`update`,
    /// `clear`). Tant qu'il la déclare en `@StateObject`, chaque changement de
    /// réel actif re-diffuse tout le fil.
    ///
    /// Le chemin iPad a reçu ce correctif avec la raison écrite à côté
    /// (`FeedView.swift`) ; il n'avait jamais traversé vers l'iPhone.
    func test_theIPhoneFeedDoesNotObserveTheReelAutoplayCoordinator() throws {
        let code = try strippedSource("RootViewComponents.swift")
        XCTAssertFalse(
            code.contains("@StateObject private var reelAutoplay"),
            "`ThemedFeedOverlay` ne doit pas OBSERVER le coordinateur de lecture automatique : son body n'en lit rien, et l'abonnement re-diffuse tout le fil à chaque changement de réel actif (#7010)."
        )
        XCTAssertTrue(
            code.contains("@State private var reelAutoplay"),
            "`ThemedFeedOverlay` doit POSSÉDER le coordinateur en `@State` — même montage que son jumeau iPad `FeedView` (#7010)."
        )
    }

    /// **Le pendant : la carte, elle, l'observe toujours.**
    ///
    /// La racine cesse de s'abonner ; sans un abonné plus bas, aucun réel ne
    /// se mettrait à jouer quand l'élection change. C'est `ReelFeedCard` qui
    /// porte l'abonnement, et c'est le seul qui en a besoin.
    func test_theReelCardStillObservesTheCoordinatorItDrawsFrom() throws {
        let code = try strippedSource("ReelFeedCard.swift")
        XCTAssertTrue(
            code.contains("@ObservedObject") && code.contains("ReelFeedAutoplayCoordinator"),
            "`ReelFeedCard` DOIT observer le coordinateur : c'est elle qui décide de jouer (#7010)."
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
