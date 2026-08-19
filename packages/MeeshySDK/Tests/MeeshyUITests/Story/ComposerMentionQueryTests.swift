import XCTest
import Testing
@testable import MeeshyUI
@testable import MeeshySDK

/// Les règles PURES de la mention « @ ». Elles servent trois surfaces — le
/// composeur de post, l'éditeur de texte de story, et le contrôleur de mention
/// de la conversation côté app — d'où l'intérêt de les épingler ici une fois.
final class ComposerMentionQueryTests: XCTestCase {

    // MARK: - Handle en cours de frappe

    func test_trailingHandle_afterASpace_isTheFragmentBeingTyped() {
        XCTAssertEqual(ComposerMentionQuery.trailingHandle(in: "Bonjour @ali"), "ali")
    }

    func test_trailingHandle_atTheVeryStart_isRecognised() {
        XCTAssertEqual(ComposerMentionQuery.trailingHandle(in: "@ali"), "ali")
    }

    /// Le `@` qui vient d'être tapé n'est pas une absence : c'est le moment où
    /// la liste par défaut (les contacts) doit s'ouvrir.
    func test_trailingHandle_justAfterTheAt_isTheEmptyQuery_notNil() {
        XCTAssertEqual(ComposerMentionQuery.trailingHandle(in: "Bonjour @"), "")
    }

    func test_trailingHandle_withoutAnyAt_isNil() {
        XCTAssertNil(ComposerMentionQuery.trailingHandle(in: "Bonjour tout le monde"))
    }

    /// Un espace clôt le handle — sinon la liste resterait ouverte sur toute la
    /// phrase qui suit.
    func test_trailingHandle_onceASpaceFollows_isNil() {
        XCTAssertNil(ComposerMentionQuery.trailingHandle(in: "Bonjour @alice ça va"))
    }

    /// Le défaut que la règle partagée corrige : le contrôleur de conversation
    /// coupait sur le DERNIER `@` sans vérifier qu'il ouvre un handle, et
    /// ouvrait donc une recherche sur « exemple.com » à chaque adresse tapée.
    func test_trailingHandle_insideAnEmailAddress_isNil() {
        XCTAssertNil(ComposerMentionQuery.trailingHandle(in: "écris à contact@exemple.com"))
    }

    func test_trailingHandle_pastedOverlyLongFragment_isNil() {
        let long = String(repeating: "a", count: 40)
        XCTAssertNil(ComposerMentionQuery.trailingHandle(in: "@" + long))
    }

    // MARK: - Remplacement

    func test_replacingTrailingHandle_swapsTheFragmentAndLeavesATrailingSpace() {
        XCTAssertEqual(
            ComposerMentionQuery.replacingTrailingHandle(in: "Salut @ali", with: "alice"),
            "Salut @alice "
        )
    }

    func test_replacingTrailingHandle_withoutAHandleInProgress_leavesTheTextIntact() {
        XCTAssertEqual(
            ComposerMentionQuery.replacingTrailingHandle(in: "Salut @alice ça va", with: "bob"),
            "Salut @alice ça va"
        )
    }
}

struct ComposerReferencesTests {

    @Test func test_upsert_newUsername_appends() {
        let result = ComposerReferences.upsert(
            ComposerReference(username: "alice", userId: nil, display: .note),
            into: []
        )
        #expect(result.map(\.username) == ["alice"])
        #expect(result[0].display == .note)
    }

    @Test func test_upsert_existingUsername_replacesModeInPlace() {
        // Choisir un mode et en changer sont le MÊME geste : la personne ne doit
        // pas être ajoutée deux fois, et elle ne doit pas sauter en fin de liste.
        let existing = [
            ComposerReference(username: "alice", userId: nil, display: .pinned),
            ComposerReference(username: "bob", userId: nil, display: .silent),
        ]
        let result = ComposerReferences.upsert(
            ComposerReference(username: "Alice", userId: nil, display: .note),
            into: existing
        )

        #expect(result.count == 2)
        #expect(result[0].username == "alice")
        #expect(result[0].display == .note)
        #expect(result[1].username == "bob")
    }

    @Test func test_remove_isCaseInsensitive() {
        let existing = [ComposerReference(username: "alice", userId: nil, display: .note)]
        #expect(ComposerReferences.remove(username: "ALICE", from: existing).isEmpty)
    }

    @Test func test_payload_carriesModeAndDropsNothing() {
        let refs = [
            ComposerReference(username: "alice", userId: nil, display: .pinned),
            ComposerReference(username: nil == nil ? "bob" : "", userId: "u-bob", display: .silent),
        ]
        let payload = ComposerReferences.payload(refs)

        #expect(payload.count == 2)
        #expect(payload[0].username == "alice")
        #expect(payload[0].display == "PINNED")
        #expect(payload[1].userId == "u-bob")
        #expect(payload[1].display == "SILENT")
    }

    @Test func test_payload_neverDeclaresInline() {
        // INLINE est dérivé par le serveur. Le déclarer ouvrirait un second
        // chemin vers le même fait, et les deux divergeraient.
        let refs = [ComposerReference(username: "alice", userId: nil, display: .inline)]
        #expect(ComposerReferences.payload(refs).isEmpty)
    }

    @Test func test_removingHandle_dropsTheHandleAndItsSpacing() {
        #expect(ComposerReferences.removingHandle("alice", from: "Soirée avec @alice hier")
                == "Soirée avec hier")
        #expect(ComposerReferences.removingHandle("alice", from: "@alice")
                == "")
        #expect(ComposerReferences.removingHandle("alice", from: "bravo @Alice !")
                == "bravo !")
    }

    @Test func test_removingHandle_leavesOtherHandlesAlone() {
        #expect(ComposerReferences.removingHandle("alice", from: "@alice et @alicia")
                == "et @alicia")
    }
}
