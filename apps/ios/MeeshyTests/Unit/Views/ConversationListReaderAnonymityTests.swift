import XCTest
@testable import Meeshy
import MeeshySDK

/// #3592 — `currentUser?.isAnonymous ?? true` traitait un `currentUser` `nil`
/// (chargement en cours) comme anonyme, et cachait le mode Résumé aux
/// utilisateurs inscrits pendant cette fenêtre transitoire
/// (`ConversationListView.swift:864` / `ConversationListView+Overlays.swift:177`).
///
/// **Le témoin RED** est le premier cas : avant le correctif, `?? true`
/// rendait `true` pour un `currentUser` `nil`, alors qu'un état de chargement
/// n'est jamais une preuve d'anonymat.
final class ConversationListReaderAnonymityTests: XCTestCase {

    private func makeUser(id: String = "u1", isAnonymous: Bool?) -> MeeshyUser {
        MeeshyUser(id: id, username: "user", displayName: "User", isAnonymous: isAnonymous)
    }

    /// LE témoin de l'issue : `nil` (chargement) ne doit JAMAIS se replier sur
    /// anonyme — sinon un inscrit perd le mode Résumé pendant cette fenêtre.
    func test_isAnonymous_whenCurrentUserIsNil_returnsFalse() {
        XCTAssertFalse(ConversationListReaderAnonymity.isAnonymous(currentUser: nil))
    }

    func test_isAnonymous_whenCurrentUserIsExplicitlyAnonymous_returnsTrue() {
        let guest = makeUser(isAnonymous: true)
        XCTAssertTrue(ConversationListReaderAnonymity.isAnonymous(currentUser: guest))
    }

    func test_isAnonymous_whenCurrentUserIsExplicitlyRegistered_returnsFalse() {
        let registered = makeUser(isAnonymous: false)
        XCTAssertFalse(ConversationListReaderAnonymity.isAnonymous(currentUser: registered))
    }

    /// Le champ API `isAnonymous` peut lui-même être absent (`nil`) sur un
    /// utilisateur chargé — même raisonnement que pour `currentUser == nil` :
    /// pas de preuve explicite d'anonymat ⇒ pas de repli anonyme.
    func test_isAnonymous_whenFieldItselfIsNilOnALoadedUser_returnsFalse() {
        let user = makeUser(isAnonymous: nil)
        XCTAssertFalse(ConversationListReaderAnonymity.isAnonymous(currentUser: user))
    }
}
