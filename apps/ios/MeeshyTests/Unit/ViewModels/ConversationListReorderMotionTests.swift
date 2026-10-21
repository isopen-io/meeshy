import SwiftUI
import XCTest
@testable import Meeshy

/// La remontée en tête d'une conversation s'anime — sauf sous Réduire les
/// animations, et jamais pendant que le doigt fait défiler la liste.
@MainActor
final class ConversationListReorderMotionTests: XCTestCase {

    func test_animation_reduceMotion_isNil() {
        XCTAssertNil(ConversationListReorderMotion.animation(reduceMotion: true, isScrolling: false))
    }

    func test_animation_whileScrolling_isNil() {
        XCTAssertNil(ConversationListReorderMotion.animation(reduceMotion: false, isScrolling: true))
    }

    func test_animation_atRest_isTheListSpring() {
        XCTAssertNotNil(ConversationListReorderMotion.animation(reduceMotion: false, isScrolling: false))
        XCTAssertEqual(ConversationListReorderMotion.response, 0.35, accuracy: 0.0001)
        XCTAssertEqual(ConversationListReorderMotion.dampingFraction, 0.86, accuracy: 0.0001)
    }

    func test_isBumpToTop_oneConversationRisesOthersKeepTheirOrder_isTrue() {
        XCTAssertTrue(ConversationListReorderMotion.isBumpToTop(from: ["a", "b", "c", "d"], to: ["c", "a", "b", "d"]))
    }

    func test_isBumpToTop_filterSwitch_isFalse() {
        XCTAssertFalse(
            ConversationListReorderMotion.isBumpToTop(from: ["a", "b", "c", "d"], to: ["c", "d"]),
            "passer de « Tous » à « Non lus » remplace la liste, sans ressort"
        )
    }

    func test_isBumpToTop_paginationAppend_isFalse() {
        XCTAssertFalse(
            ConversationListReorderMotion.isBumpToTop(from: ["a", "b"], to: ["a", "b", "c", "d"]),
            "une page ajoutée s'insère sans ressort pendant la décélération"
        )
    }

    func test_isBumpToTop_rewrittenOrderOrOtherAccount_isFalse() {
        XCTAssertFalse(ConversationListReorderMotion.isBumpToTop(from: ["a", "b", "c"], to: ["c", "b", "a"]))
        XCTAssertFalse(ConversationListReorderMotion.isBumpToTop(from: ["a", "b", "c"], to: ["x", "y", "z"]))
    }

    func test_isBumpToTop_unchangedOrHeadAlreadyOnTop_isFalse() {
        XCTAssertFalse(ConversationListReorderMotion.isBumpToTop(from: ["a", "b"], to: ["a", "b"]))
        XCTAssertFalse(ConversationListReorderMotion.isBumpToTop(from: [], to: []))
    }

    func test_isScrolling_recentTick_isTrue() {
        let now = Date(timeIntervalSince1970: 1_000)

        XCTAssertTrue(ConversationListReorderMotion.isScrolling(lastTick: now.addingTimeInterval(-0.1), now: now))
    }

    func test_isScrolling_settledOrNeverScrolled_isFalse() {
        let now = Date(timeIntervalSince1970: 1_000)

        XCTAssertFalse(ConversationListReorderMotion.isScrolling(lastTick: now.addingTimeInterval(-1), now: now))
        XCTAssertFalse(ConversationListReorderMotion.isScrolling(lastTick: nil, now: now))
    }

    func test_scrollPulse_noteTick_marksScrolling() {
        let pulse = ConversationListScrollPulse()
        let now = Date(timeIntervalSince1970: 1_000)

        pulse.noteTick(at: now)

        XCTAssertTrue(pulse.isScrolling(now: now.addingTimeInterval(0.05)))
        XCTAssertFalse(pulse.isScrolling(now: now.addingTimeInterval(2)))
    }
}
