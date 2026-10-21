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
        XCTAssertEqual(
            ConversationListReorderMotion.animation(reduceMotion: false, isScrolling: false),
            .spring(response: 0.35, dampingFraction: 0.86)
        )
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
