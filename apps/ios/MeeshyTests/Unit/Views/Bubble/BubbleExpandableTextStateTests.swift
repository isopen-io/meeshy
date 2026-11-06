import XCTest
import MeeshySDK
@testable import Meeshy

/// #8147 — le texte d'un message long se replie sur son EXTRAIT (un quart,
/// coupé au mot, loi `LongMessageExcerpt`) suivi de « … », et se déplie EN
/// PLACE. Déplié, il est un texte ordinaire : aucun « Réduire » (#16463).
@MainActor
final class BubbleExpandableTextStateTests: XCTestCase {

    private func longText(words: Int = 400) -> String {
        Array(repeating: "lecture", count: words).joined(separator: " ")
    }

    func test_displayedText_shortMessage_isTheWholeTextWithoutToggle() {
        let state = BubbleExpandableText.State(content: "Bonjour", isExpanded: false)
        XCTAssertEqual(state.displayedText, "Bonjour")
        XCTAssertFalse(state.showsReadMore)
    }

    func test_displayedText_longCollapsed_isTheExcerptFollowedByAnEllipsis() throws {
        let text = longText()
        let excerpt = try XCTUnwrap(LongMessageExcerpt.excerpt(text))
        let state = BubbleExpandableText.State(content: text, isExpanded: false)
        XCTAssertEqual(state.displayedText, excerpt + "…")
        XCTAssertTrue(state.showsReadMore)
    }

    func test_displayedText_longCollapsed_showsLessThanHalf() {
        let text = longText()
        let state = BubbleExpandableText.State(content: text, isExpanded: false)
        XCTAssertLessThan(state.displayedText.count * 2, text.count)
    }

    func test_displayedText_longExpanded_isTheWholeText_withoutAnyToggle() {
        let text = longText()
        let state = BubbleExpandableText.State(content: text, isExpanded: true)
        XCTAssertEqual(state.displayedText, text)
        XCTAssertFalse(state.showsReadMore, "déplié, le message n'a plus aucun contrôle : il se lit comme un message ordinaire")
    }

    func test_expansion_equality_readsTheMessageAndTheState_notTheClosure() {
        XCTAssertEqual(
            LongMessageExpansion(messageId: "m1", isExpanded: true, expand: {}),
            LongMessageExpansion(messageId: "m1", isExpanded: true, expand: { _ = 1 })
        )
        XCTAssertNotEqual(
            LongMessageExpansion(messageId: "m1", isExpanded: true, expand: {}),
            LongMessageExpansion(messageId: "m1", isExpanded: false, expand: {})
        )
    }

    /// #8161 — une cellule RÉUTILISÉE reçoit l'état de dépliage d'un AUTRE
    /// message. Égal sur l'état seul (replié ⇔ replié), l'environnement
    /// gardait la fermeture du message précédent : « Lire la suite » dépliait
    /// l'ancien occupant de la cellule, et le texte affiché ne bougeait pas.
    func test_expansion_equality_twoMessagesInTheSameState_areDistinct() {
        XCTAssertNotEqual(
            LongMessageExpansion(messageId: "m1", isExpanded: false, expand: {}),
            LongMessageExpansion(messageId: "m2", isExpanded: false, expand: {})
        )
    }
}
