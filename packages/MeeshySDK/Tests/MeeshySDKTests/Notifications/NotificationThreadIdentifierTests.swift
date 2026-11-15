import Testing
import Foundation
@testable import MeeshySDK

/// #6999 — le `threadIdentifier` est la seule clé qui permette de retirer du
/// centre iOS TOUTES les bannières d'un fil consommé. Les quick-actions
/// retiraient par `userInfo["conversationId"]`, et l'ouverture d'une
/// conversation ne retirait rien du tout.
@Suite("Fil de regroupement des bannières")
struct NotificationThreadIdentifierTests {

    @Test("une conversation et un post ont chacun leur fil")
    func composition() {
        #expect(NotificationThreadIdentifier.conversation("c-1") == "conversation:c-1")
        #expect(NotificationThreadIdentifier.post("p-1") == "post:p-1")
    }

    @Test("la référence d'une conversation se résout en son fil")
    func conversationRef() {
        #expect(NotificationThreadIdentifier.resolve(for: .conversation(id: "c-1")) == "conversation:c-1")
    }

    @Test("la référence d'un post se résout en son fil")
    func postRef() {
        #expect(NotificationThreadIdentifier.resolve(for: .post(id: "p-9")) == "post:p-9")
    }

    @Test("une référence qui ne désigne aucun fil ne se résout pas")
    func refsWithoutThread() {
        #expect(NotificationThreadIdentifier.resolve(for: .notification(id: "n-1")) == nil)
        #expect(NotificationThreadIdentifier.resolve(for: .types(["friend_request"])) == nil)
        #expect(
            NotificationThreadIdentifier.resolve(for: .all) == nil,
            "répondre par un fil de repli reviendrait à retirer TOUTES les bannières — le geste que #7000 vient de supprimer"
        )
    }

    @Test("un identifiant vide ne fabrique pas de fil fourre-tout")
    func emptyIdentifier() {
        #expect(
            NotificationThreadIdentifier.resolve(for: .conversation(id: "")) == nil,
            "`conversation:` sans id matcherait par préfixe chez tout appelant assez naïf pour comparer autrement"
        )
        #expect(NotificationThreadIdentifier.resolve(for: .post(id: "")) == nil)
    }
}
