import XCTest
@testable import Meeshy

/// #16338 — le salut d'un arrivant se TOUCHE : l'invite « dis-lui salut » de
/// l'avis d'arrivée écrit `@pseudo ` de chaque arrivant dans le composeur.
final class ArrivalGreetingTests: XCTestCase {

    // MARK: - L'invite se détache de la phrase du catalogue

    func test_split_catalogLine_separatesSentenceAndInvite() {
        let line = ArrivalGreeting.split("Aïcha et Tom viennent d’arriver — dis-leur salut")
        XCTAssertEqual(line.sentence, "Aïcha et Tom viennent d’arriver")
        XCTAssertEqual(line.invite, "dis-leur salut")
    }

    func test_split_lineWithoutDash_hasNoInvite() {
        let line = ArrivalGreeting.split("Aïcha a rejoint la conversation")
        XCTAssertEqual(line.sentence, "Aïcha a rejoint la conversation")
        XCTAssertNil(line.invite)
    }

    func test_split_otherLanguage_keepsItsOwnInvite() {
        let line = ArrivalGreeting.split("Aïcha just arrived — say hi")
        XCTAssertEqual(line.invite, "say hi")
    }

    // MARK: - Les pseudos à saluer

    func test_handles_severalArrivals_keepsOrderDropsSelfAndUnknown() {
        let handles = ArrivalGreeting.handles(
            of: [("p1", "aicha"), ("p2", nil), ("p3", "tom"), ("p4", "me")],
            resolving: { $0 == "p2" ? "zoe" : nil },
            excluding: "me"
        )
        XCTAssertEqual(handles, ["aicha", "zoe", "tom"])
    }

    func test_handles_anonymousOnly_isEmpty() {
        XCTAssertEqual(ArrivalGreeting.handles(of: [("p1", nil)], resolving: { _ in nil }, excluding: nil), [])
    }

    // MARK: - Ce qui s'écrit dans le composeur

    func test_inserting_emptyDraft_writesAllMentionsThenSpace() {
        XCTAssertEqual(ArrivalGreeting.inserting(["a", "b"], into: ""), "@a @b ")
    }

    func test_inserting_draftWithText_appendsAfterASpace() {
        XCTAssertEqual(ArrivalGreeting.inserting(["a"], into: "Bienvenue"), "Bienvenue @a ")
        XCTAssertEqual(ArrivalGreeting.inserting(["a"], into: "Bienvenue "), "Bienvenue @a ")
    }

    func test_inserting_alreadyMentioned_isNotRepeated() {
        XCTAssertEqual(ArrivalGreeting.inserting(["a", "b"], into: "@a salut "), "@a salut @b ")
        XCTAssertEqual(ArrivalGreeting.inserting(["a"], into: "@a "), "@a ")
    }
}
