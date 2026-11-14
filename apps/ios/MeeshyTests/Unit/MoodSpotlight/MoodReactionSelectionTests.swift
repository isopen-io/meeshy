import XCTest
@testable import Meeshy

/// La sélection optimiste d'une rangée de réactions d'humeur (#18110) :
/// l'emoji est posé dès le toucher, rendu sur refus, et ne repart pas deux fois.
@MainActor
final class MoodReactionSelectionTests: XCTestCase {

    func test_begin_newEmoji_placesItAndAllowsTheSend() {
        var selection = MoodReactionSelection()

        let allowed = selection.begin("\u{1F525}")

        XCTAssertTrue(allowed)
        XCTAssertEqual(selection.placed, ["\u{1F525}"])
    }

    func test_begin_emojiAlreadyPlaced_refusesTheSend() {
        var selection = MoodReactionSelection(placed: ["\u{1F525}"])

        XCTAssertFalse(selection.begin("\u{1F525}"))
    }

    func test_settle_failed_rollsTheEmojiBack() {
        var selection = MoodReactionSelection()
        _ = selection.begin("\u{1F44D}")

        selection.settle("\u{1F44D}", outcome: .failed)

        XCTAssertTrue(selection.placed.isEmpty)
    }

    func test_settle_sentOrAlreadyPlaced_keepsTheEmoji() {
        var selection = MoodReactionSelection()
        _ = selection.begin("\u{1F44D}")
        _ = selection.begin("\u{1F62E}")

        selection.settle("\u{1F44D}", outcome: .sent)
        selection.settle("\u{1F62E}", outcome: .alreadyPlaced)

        XCTAssertEqual(selection.placed, ["\u{1F44D}", "\u{1F62E}"])
    }

    func test_merging_keepsBothSides() {
        let selection = MoodReactionSelection(placed: ["\u{1F44D}"]).merging(["\u{1F525}"])

        XCTAssertEqual(selection.placed, ["\u{1F44D}", "\u{1F525}"])
    }

    func test_emojis_areTheSharedQuickReactions() {
        XCTAssertEqual(MoodReactionSelection.emojis.count, 15)
        XCTAssertEqual(Set(MoodReactionSelection.emojis).count, MoodReactionSelection.emojis.count)
    }
}
