import XCTest
@testable import Meeshy

/// Résolution du drop de la chip (morph drag-n-drop de la liste de
/// conversations) : lâcher sur « Épingles » épingle la conversation si elle
/// ne l'est pas déjà (jamais de dés-épinglage par drop — l'action dédiée du
/// menu s'en charge) ; lâcher sur une section la déplace sauf no-op ; hors
/// cible = annulation.
@MainActor
final class ConversationChipDropResolverTests: XCTestCase {

    func test_action_droppedOutsideAnyHeader_isNone() {
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: nil, isPinned: false, currentSectionId: ""),
            .none
        )
    }

    func test_action_onPinned_notYetPinned_pins() {
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "pinned", isPinned: false, currentSectionId: "abc"),
            .pin
        )
    }

    func test_action_onPinned_alreadyPinned_isNone() {
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "pinned", isPinned: true, currentSectionId: ""),
            .none
        )
    }

    func test_action_onOther_fromCustomSection_movesToEmptyId() {
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "other", isPinned: false, currentSectionId: "abc"),
            .move(sectionId: "")
        )
    }

    func test_action_onOther_fromDefaultSection_isNoOp() {
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "other", isPinned: false, currentSectionId: ""),
            .none
        )
    }

    func test_action_onCustomSection_fromDefault_moves() {
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "abc", isPinned: false, currentSectionId: ""),
            .move(sectionId: "abc")
        )
    }

    func test_action_onOwnSection_isNoOp() {
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "abc", isPinned: false, currentSectionId: "abc"),
            .none
        )
    }

    func test_action_onPinned_pinsEvenFromPinnedRowsOwnSection() {
        // Une conv non épinglée listée dans une section custom, lâchée sur
        // Épingles : l'épinglage ne dépend PAS de sa section d'origine.
        XCTAssertEqual(
            ChipDropResolver.action(droppedOn: "pinned", isPinned: false, currentSectionId: ""),
            .pin
        )
    }
}
