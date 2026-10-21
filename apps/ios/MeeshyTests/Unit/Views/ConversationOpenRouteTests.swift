import XCTest
@testable import Meeshy

/// **Toute ouverture depuis la liste passe la porte du verrou** (#11213, revue
/// adversariale).
///
/// Le toucher d'une rangée demandait le PIN d'une conversation verrouillée ;
/// le toucher de la carte d'aperçu, sa loupe et l'entrée « Rechercher » du menu
/// natif appelaient `onSelect` directement et ouvraient la conversation sans le
/// demander. Aucun autre site ne revérifie le verrou : ni le fil, ni le routeur.
/// La décision se lit donc à UNE loi, que tous les chemins d'ouverture de la
/// liste consomment par `ConversationListView.openConversation(_:searching:)`.
@MainActor
final class ConversationOpenRouteTests: XCTestCase {

    // MARK: - La loi

    func test_resolve_unlocked_opensDirectly() {
        XCTAssertEqual(ConversationOpenRoute.resolve(isLocked: false, searching: false), .open(searching: false))
    }

    func test_resolve_locked_asksForThePinFirst() {
        XCTAssertEqual(ConversationOpenRoute.resolve(isLocked: true, searching: false), .unlockFirst(searching: false))
    }

    /// La loupe d'une conversation verrouillée : la recherche s'ouvre APRÈS le
    /// PIN, jamais avant, et jamais perdue.
    func test_resolve_lockedSearch_keepsTheSearchForAfterTheUnlock() {
        let route = ConversationOpenRoute.resolve(isLocked: true, searching: true)

        XCTAssertEqual(route, .unlockFirst(searching: true))
        XCTAssertTrue(route.presentsLockSheet)
        XCTAssertFalse(route.armsSearchNow, "armer la recherche avant le PIN la ferait fuir vers la prochaine conversation ouverte si le PIN est abandonné")
    }

    func test_resolve_unlockedSearch_armsTheSearchNow() {
        let route = ConversationOpenRoute.resolve(isLocked: false, searching: true)

        XCTAssertFalse(route.presentsLockSheet)
        XCTAssertTrue(route.armsSearchNow)
    }

    // MARK: - Le verrou réel

    /// Une conversation verrouillée par PIN présente la feuille de verrou, quel
    /// que soit le chemin d'ouverture — le témoin lit le gestionnaire réel.
    func test_resolve_conversationLockedByPin_presentsTheLockSheet() {
        let locks = ConversationLockManager.shared
        let conversationId = "open-route-\(UUID().uuidString)"
        locks.setLock(conversationId: conversationId, pin: "1234")
        defer { locks.removeLock(conversationId: conversationId) }

        XCTAssertTrue(ConversationOpenRoute.resolve(conversationId, searching: false).presentsLockSheet)
        XCTAssertTrue(ConversationOpenRoute.resolve(conversationId, searching: true).presentsLockSheet)
    }

    /// Une fenêtre détachée (menu « Ouvrir dans une nouvelle fenêtre », glissé
    /// vers le bord de l'iPad) monte le fil sans la liste : jamais pour une
    /// conversation verrouillée.
    func test_mayDetach_conversationLockedByPin_neverOffersAWindow() {
        let locks = ConversationLockManager.shared
        let conversationId = "open-route-\(UUID().uuidString)"
        locks.setLock(conversationId: conversationId, pin: "1234")
        defer { locks.removeLock(conversationId: conversationId) }

        XCTAssertFalse(ConversationOpenRoute.mayDetach(conversationId))
    }

    func test_mayDetach_conversationWithoutLock_offersAWindow() {
        XCTAssertTrue(ConversationOpenRoute.mayDetach("open-route-\(UUID().uuidString)"))
    }

    func test_resolve_conversationWithoutLock_opens() {
        XCTAssertEqual(
            ConversationOpenRoute.resolve("open-route-\(UUID().uuidString)", searching: false),
            .open(searching: false)
        )
    }
}
