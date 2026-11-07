import XCTest
@testable import Meeshy

/// APP-1 — une seule pile de bannières sous l'en-tête de l'appel, ordre fixe
/// partage → enregistrement → cadre, sans trou ni chevauchement du chevron.
@MainActor
final class CallTopBannerStackTests: XCTestCase {

    func test_ordered_allPresent_followsShareRecordingFrame() {
        XCTAssertEqual(
            CallTopBannerStack.ordered([.liveFrame, .screenShare, .recording]),
            [.screenShare, .recording, .liveFrame]
        )
    }

    func test_ordered_missingMiddle_leavesNoGap() {
        XCTAssertEqual(CallTopBannerStack.ordered([.liveFrame, .screenShare]), [.screenShare, .liveFrame])
    }

    func test_ordered_single_isAlone() {
        XCTAssertEqual(CallTopBannerStack.ordered([.recording]), [.recording])
    }

    func test_ordered_everyArrivalOrder_givesTheSameStack() {
        let all = CallTopBanner.allCases
        for first in all {
            for second in all where second != first {
                let arrival = [first, second] + all.filter { $0 != first && $0 != second }
                XCTAssertEqual(CallTopBannerStack.ordered(Set(arrival)), all)
            }
        }
    }

    func test_ordered_none_isEmpty() {
        XCTAssertTrue(CallTopBannerStack.ordered([]).isEmpty)
    }

    func test_topInset_clearsTheHeaderRowAndItsTapTarget() {
        let chromeTop: CGFloat = 67
        let top = CallTopBannerStack.topInset(chromeTopInset: chromeTop)
        // La rangée d'en-tête occupe 44 pt (cible tactile du chevron « Réduire »).
        XCTAssertGreaterThanOrEqual(top, chromeTop + 44)
        XCTAssertEqual(top, chromeTop + CallTopBannerStack.headerRowClearance)
    }

    func test_topInset_followsTheSafeArea() {
        XCTAssertLessThan(
            CallTopBannerStack.topInset(chromeTopInset: 28),
            CallTopBannerStack.topInset(chromeTopInset: 67)
        )
    }

    func test_connectedView_stacksTheBannersUnderTheHeader_insteadOfFixedOffsets() throws {
        let connected = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallView+Connected.swift")
        )
        for offset in [".padding(.top, 60)", ".padding(.top, 110)", ".padding(.top, 160)"] {
            XCTAssertFalse(connected.contains(offset), "\(offset) : décalage figé qui passe sous le chevron « Réduire »")
        }
        XCTAssertTrue(connected.contains("CallTopBannerStack.topInset(chromeTopInset: Self.chromeTopInset)"))
        XCTAssertFalse(connected.contains("CallScreenShareBanner("), "la bannière vit dans la pile")
        XCTAssertFalse(connected.contains("CallRecordingOverlay("), "la bannière vit dans la pile")
        let stack = try AppSourceGuard.unit("Meeshy/Features/Call/Views/CallTopBannerStackView.swift")
        XCTAssertTrue(stack.contains("CallTopBannerStack.ordered(present)"))
    }

    func test_liveFrameDisplay_isSuspended_onlyForASuspension() {
        XCTAssertFalse(CallLiveFrameDisplay.none.isSuspended)
    }
}
